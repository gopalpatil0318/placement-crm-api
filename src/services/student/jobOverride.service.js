/**
 * ============================================================================
 * STUDENT JOB OVERRIDE SERVICE — Eligibility Override Request Business Logic
 * ============================================================================
 *   - checkJobEligibilityForOverride(jobId, studentId, collegeId)
 *   - requestOverride(jobId, studentId, collegeId, data)
 *   - getMyOverrideRequests(studentId, collegeId, filters)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
    NOTIFICATION_TYPE,
    RECIPIENT_TYPE,
} = require('../../config/constants');

// ============================================================================
// COLUMN CONSTANTS
// ============================================================================

const CRITERIA_SELECT_COLUMNS = `
    criteria_id, job_id, min_overall_cgpa, max_live_kts,
    min_tenth_percentage, min_twelfth_percentage, min_diploma_percentage,
    allowed_genders, allowed_departments, allowed_gap_statuses,
    exclude_already_placed, min_hsc_percentage, min_ssc_percentage,
    min_package_lpa, max_package_lpa
`;

const OVERRIDE_RETURNING_COLUMNS = `
    override_id, job_id, student_id, college_id,
    override_status, request_reason, ineligibility_reasons,
    requested_at
`;

// ============================================================================
// HELPER — Verify job exists and belongs to student's college
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_status, j.passout_years,
                j.application_deadline, j.allow_applications,
                c.company_id, c.company_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Get student profile (passout year, dept, academic data etc.)
// ============================================================================

async function getStudentProfile(studentId, collegeId) {
    const result = await query(
        `SELECT s.student_id, s.student_status, s.student_passout_year,
                s.first_name, s.last_name,
                s.profile_complete, s.profile_is_approved,
                d.dept_name,
                acad.overall_cgpa, acad.total_live_kts,
                acad.tenth_percentage, acad.twelfth_or_diploma,
                acad.twelfth_percentage, acad.diploma_percentage,
                acad.any_gap_during_education,
                pi.gender
         FROM students s
         JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN student_academic_information acad ON s.student_id = acad.student_id
         LEFT JOIN student_personal_information pi ON s.student_id = pi.student_id
         WHERE s.student_id = $1 AND s.college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Check a numeric criterion (returns issue string or null)
// ============================================================================

function checkMinCriterion(criterionValue, studentValue, label) {
    if (criterionValue == null) return null;
    const actual = Number.parseFloat(studentValue) || 0;
    const required = Number.parseFloat(criterionValue);
    if (actual < required) {
        return `Minimum ${label}: ${required}, yours: ${actual}`;
    }
    return null;
}

function checkMaxCriterion(criterionValue, studentValue, label) {
    if (criterionValue == null) return null;
    const actual = studentValue || 0;
    if (actual > criterionValue) {
        return `Maximum ${label}: ${criterionValue}, yours: ${actual}`;
    }
    return null;
}

function checkArrayCriterion(allowed, actual, label) {
    if (!allowed || allowed.length === 0) return null;
    if (!actual || !allowed.includes(actual)) {
        return `${label}: ${allowed.join(', ')}`;
    }
    return null;
}

// ============================================================================
// HELPER — Evaluate eligibility (same logic as student/job.service)
// ============================================================================

async function evaluateEligibility(jobId, student) {
    const criteriaResult = await query(
        `SELECT ${CRITERIA_SELECT_COLUMNS} FROM job_eligibility_criteria WHERE job_id = $1 LIMIT 1`,
        [jobId]
    );

    const criteria = criteriaResult.rows[0] || null;
    if (!criteria) {
        return { is_eligible: true, issues: [] };
    }

    // Collect all criterion checks (returns issue string or null)
    const checks = [
        checkMinCriterion(criteria.min_overall_cgpa, student.overall_cgpa, 'CGPA required'),
        checkMaxCriterion(criteria.max_live_kts, student.total_live_kts, 'live backlogs allowed'),
        checkMinCriterion(criteria.min_tenth_percentage, student.tenth_percentage, '10th percentage'),
        student.twelfth_or_diploma === '12th'
            ? checkMinCriterion(criteria.min_twelfth_percentage, student.twelfth_percentage, '12th percentage')
            : null,
        student.twelfth_or_diploma === 'Diploma'
            ? checkMinCriterion(criteria.min_diploma_percentage, student.diploma_percentage, 'diploma percentage')
            : null,
        checkArrayCriterion(criteria.allowed_genders, student.gender, 'Allowed genders'),
        checkArrayCriterion(criteria.allowed_departments, student.dept_name, 'Allowed departments'),
        checkArrayCriterion(
            criteria.allowed_gap_statuses,
            student.any_gap_during_education ? 'gap' : 'no_gap',
            'Allowed education gap statuses'
        ),
    ];

    const issues = checks.filter(Boolean);

    // Already placed check
    if (criteria.exclude_already_placed === true) {
        const placedResult = await query(
            `SELECT 1 FROM placement_results
             WHERE student_id = $1
               AND placement_status NOT IN ('cancelled', 'rejected')
             LIMIT 1`,
            [student.student_id]
        );
        if (placedResult.rows.length > 0) {
            issues.push('Students already placed are not eligible for this job');
        }
    }

    return { is_eligible: issues.length === 0, issues };
}

// ============================================================================
// 1. CHECK JOB ELIGIBILITY FOR OVERRIDE
// ============================================================================

/**
 * Returns full eligibility details plus any existing override request status.
 * Used by the student UI to decide whether to show "Request Override" button.
 *
 * @param {string} jobId
 * @param {string} studentId
 * @param {string} collegeId
 * @returns {Object}
 */
async function checkJobEligibilityForOverride(jobId, studentId, collegeId) {
    const [job, student] = await Promise.all([
        verifyJob(jobId, collegeId),
        getStudentProfile(studentId, collegeId),
    ]);

    // Passout year check first (override cannot bypass year mismatch)
    const yearMismatch = !Array.isArray(job.passout_years) || !job.passout_years.includes(student.student_passout_year);

    // Eligibility against criteria
    const eligibility = await evaluateEligibility(jobId, student);

    // Existing override request
    const overrideResult = await query(
        `SELECT override_id, override_status, rejection_reason, review_notes, requested_at, reviewed_at
         FROM job_eligibility_override_requests
         WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
        [studentId, jobId]
    );

    const existingOverride = overrideResult.rows[0] || null;

    // Application status
    const appResult = await query(
        `SELECT application_id, application_status FROM student_applications
         WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
        [studentId, jobId]
    );

    return {
        job_id: job.job_id,
        job_title: job.job_title,
        company_name: job.company_name,
        passout_years: job.passout_years,
        application_deadline: job.application_deadline,
        job_status: job.job_status,
        year_eligible: !yearMismatch,
        criteria_eligible: eligibility.is_eligible,
        is_fully_eligible: !yearMismatch && eligibility.is_eligible,
        ineligibility_reasons: [
            ...(yearMismatch
                ? [`Your passout year (${student.student_passout_year}) is not in the job's target years (${(job.passout_years || []).join(', ')}). Override cannot change passout year.`]
                : []),
            ...eligibility.issues,
        ],
        can_request_override: !eligibility.is_eligible && !yearMismatch && !existingOverride,
        override_request: existingOverride
            ? {
                override_id: existingOverride.override_id,
                override_status: existingOverride.override_status,
                rejection_reason: existingOverride.rejection_reason ?? null,
                review_notes: existingOverride.review_notes ?? null,
                requested_at: existingOverride.requested_at,
                reviewed_at: existingOverride.reviewed_at ?? null,
            }
            : null,
        application: appResult.rows.length
            ? {
                application_id: appResult.rows[0].application_id,
                application_status: appResult.rows[0].application_status,
            }
            : null,
    };
}

// ============================================================================
// 2. REQUEST OVERRIDE
// ============================================================================

/**
 * Student submits an eligibility override request with a reason.
 * Prerequisites: job published, passout year matches, not already applied,
 *                no existing override request, student IS actually ineligible.
 *
 * @param {string} jobId
 * @param {string} studentId
 * @param {string} collegeId
 * @param {Object} data - { request_reason }
 * @returns {Object} Created override request
 */
async function requestOverride(jobId, studentId, collegeId, data) {
    const [job, student] = await Promise.all([
        verifyJob(jobId, collegeId),
        getStudentProfile(studentId, collegeId),
    ]);

    // Job must be published and accepting applications
    if (job.job_status !== STATUS.JOB.PUBLISHED) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_PUBLISHED), { status: 400 });
    }

    if (job.allow_applications === false) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.JOB_NOT_ACCEPTING),
            { status: 400 }
        );
    }

    if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
        throw Object.assign(new Error(ERROR_MESSAGES.DEADLINE_PASSED), { status: 400 });
    }

    // Passout year MUST match — override does not cover year mismatch
    const passoutYears = Array.isArray(job.passout_years) ? job.passout_years : [];
    if (!passoutYears.includes(student.student_passout_year)) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.PASSOUT_YEAR_NOT_OVERRIDABLE),
            { status: 400 }
        );
    }

    // Check profile approval
    if (!student.profile_is_approved) {
        throw Object.assign(new Error(ERROR_MESSAGES.PROFILE_NOT_APPROVED), { status: 400 });
    }

    // Run parallel checks: already applied, existing override
    const [existingApp, existingOverride] = await Promise.all([
        query(
            `SELECT 1 FROM student_applications
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            [studentId, jobId]
        ),
        query(
            `SELECT override_id, override_status FROM job_eligibility_override_requests
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            [studentId, jobId]
        ),
    ]);

    if (existingApp.rows.length > 0) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.STUDENT_OVERRIDE_ALREADY_APPLIED),
            { status: 400 }
        );
    }

    if (existingOverride.rows.length > 0) {
        const overrideStatus = existingOverride.rows[0].override_status;
        const messageMap = {
            [STATUS.OVERRIDE.PENDING]: ERROR_MESSAGES.STUDENT_OVERRIDE_PENDING,
            [STATUS.OVERRIDE.APPROVED]: ERROR_MESSAGES.STUDENT_OVERRIDE_APPROVED,
            [STATUS.OVERRIDE.REJECTED]: ERROR_MESSAGES.STUDENT_OVERRIDE_REJECTED,
        };
        throw Object.assign(
            new Error(messageMap[overrideStatus] || ERROR_MESSAGES.STUDENT_OVERRIDE_PENDING),
            { status: 409 }
        );
    }

    // Evaluate eligibility — must be ineligible to request override
    const eligibility = await evaluateEligibility(jobId, student);
    if (eligibility.is_eligible) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.STUDENT_ALREADY_ELIGIBLE),
            { status: 400 }
        );
    }

    // Insert override request + notification in a transaction
    const ineligibilityText = eligibility.issues.join('; ');
    const client = await getClient();

    try {
        await client.query('BEGIN');

        const insertResult = await client.query(
            `INSERT INTO job_eligibility_override_requests
                (student_id, job_id, college_id, request_reason, ineligibility_reasons)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING ${OVERRIDE_RETURNING_COLUMNS}`,
            [studentId, jobId, collegeId, data.request_reason.trim(), ineligibilityText]
        );

        const override = insertResult.rows[0];

        // Notify TPO users in this college about the new override request
        await client.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             SELECT $1, $2, u.user_id,
                    $3, $4,
                    $5, $6, $7
             FROM users u
             WHERE u.college_id = $1
               AND u.user_role IN ('tpo', 'collegeadmin', 'tpc')
               AND u.user_status = 'active'`,
            [
                collegeId,
                RECIPIENT_TYPE.USER,
                `Override Request: ${job.job_title}`,
                `${student.first_name} ${student.last_name} (${student.dept_name}) has requested an eligibility override for ${job.job_title} at ${job.company_name}. Reason: ${data.request_reason.trim().substring(0, 150)}`,
                NOTIFICATION_TYPE.ELIGIBILITY_OVERRIDE_REQUESTED,
                'job',
                jobId,
            ]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Eligibility override request submitted`, {
            overrideId: override.override_id,
            studentId,
            jobId,
            collegeId,
        });

        return {
            override_id: override.override_id,
            job_id: override.job_id,
            override_status: override.override_status,
            request_reason: override.request_reason,
            ineligibility_reasons: override.ineligibility_reasons,
            requested_at: override.requested_at,
            job_title: job.job_title,
            company_name: job.company_name,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 3. GET MY OVERRIDE REQUESTS
// ============================================================================

/**
 * Paginated list of student's own override requests.
 *
 * @param {string} studentId
 * @param {string} collegeId
 * @param {Object} filters - { status, page, limit, sort_order }
 * @returns {{ requests, total, page, limit }}
 */
async function getMyOverrideRequests(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = [
        'r.student_id = $1',
        'r.college_id = $2',
    ];
    const params = [studentId, collegeId];
    let paramIndex = 3;

    if (filters.status) {
        conditions.push(`r.override_status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    const [countResult, rowsResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM job_eligibility_override_requests r
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT r.override_id, r.override_status,
                    r.request_reason, r.ineligibility_reasons,
                    r.rejection_reason, r.review_notes,
                    r.requested_at, r.reviewed_at,
                    j.job_id, j.job_title, j.passout_years,
                    j.application_deadline, j.job_status,
                    j.job_type, c.company_name,
                    c.industry,
                    u.user_name AS reviewed_by_name
             FROM job_eligibility_override_requests r
             JOIN job_postings j ON r.job_id = j.job_id
             JOIN companies c ON j.company_id = c.company_id
             LEFT JOIN users u ON r.reviewed_by = u.user_id
             WHERE ${whereClause}
             ORDER BY r.requested_at ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    return {
        requests: rowsResult.rows,
        total: Number.parseInt(countResult.rows[0].total, 10),
        page,
        limit,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    checkJobEligibilityForOverride,
    requestOverride,
    getMyOverrideRequests,
};
