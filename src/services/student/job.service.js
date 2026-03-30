/**
 * ============================================================================
 * STUDENT JOB SERVICE — Job Browsing & Application Business Logic
 * ============================================================================
 *   - getAvailableJobs(studentId, collegeId, filters)
 *   - getJobDetails(jobId, studentId, collegeId)
 *   - checkJobEligibility(jobId, studentId, collegeId)
 *   - applyForJob(jobId, studentId, collegeId, data)
 *   - denyJob(jobId, studentId, collegeId, data)
 *   - getMyApplications(studentId, collegeId, filters)
 *   - getApplicationDetails(applicationId, studentId, collegeId)
 *   - withdrawApplication(applicationId, studentId, collegeId, reason)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const chunkedQuery = require('../../utils/chunkedQuery');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// Statuses that allow withdrawal by student
const WITHDRAWABLE_STATUSES = [
    STATUS.APPLICATION.PENDING,
    STATUS.APPLICATION.UNDER_REVIEW,
    STATUS.APPLICATION.SHORTLISTED,
];

// ============================================================================
// COLUMN CONSTANTS — explicit column lists, never SELECT * or RETURNING *
// ============================================================================

const APPLICATION_RETURNING_COLUMNS = `application_id, job_id, position_id, college_id,
    application_status, is_eligible, eligibility_remarks, override_id, applied_at, last_updated_at`;

const DENIAL_RETURNING_COLUMNS = `denial_id, student_id, job_id, college_id,
    denial_reason, additional_comments, denied_at`;

const APPLICATION_VERIFY_COLUMNS = `a.application_id, a.job_id, a.position_id,
    a.application_status, a.current_round_id, a.is_eligible, a.eligibility_remarks,
    a.applied_at, a.last_updated_at, a.college_id, a.student_id`;

const CRITERIA_SELECT_COLUMNS = `criteria_id, job_id, min_overall_cgpa, max_live_kts,
    min_tenth_percentage, min_twelfth_percentage, min_diploma_percentage,
    min_package, max_package,
    allowed_genders, allowed_departments, allowed_gap_statuses,
    exclude_already_placed, created_at, updated_at`;

// ============================================================================
// HELPER — Verify job exists and belongs to student's college
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_description, j.job_location,
                j.salary_package, j.salary_min, j.salary_max,
                j.bond_duration, j.bond_details, j.job_type,
                j.internship_duration, j.internship_stipend,
                j.passout_years, j.application_deadline,
                j.job_status, j.allow_applications,
                j.created_at,
                c.company_id, c.company_name, c.company_website,
                c.industry AS industry_type
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
// HELPER — Verify application belongs to student
// ============================================================================

async function verifyStudentApplication(applicationId, studentId, collegeId) {
    const result = await query(
        `SELECT ${APPLICATION_VERIFY_COLUMNS},
                j.job_title, j.job_status, j.application_deadline,
                c.company_name,
                p.position_name
         FROM student_applications a
         JOIN job_postings j ON a.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         LEFT JOIN job_positions p ON a.position_id = p.position_id
         WHERE a.application_id = $1 AND a.student_id = $2 AND a.college_id = $3
         LIMIT 1`,
        [applicationId, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.APPLICATION_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Get student data for eligibility check
// ============================================================================

async function getStudentProfile(studentId, collegeId) {
    const result = await query(
        `SELECT s.student_id, s.student_status, s.student_passout_year,
                s.profile_complete, s.profile_is_approved,
                s.dept_id,
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
// HELPER — Evaluate eligibility against job_eligibility_criteria
// ============================================================================

function checkNumericThreshold(studentValue, thresholdValue, label, suffix = '') {
    const parsed = Number.parseFloat(studentValue) || 0;
    if (parsed < Number.parseFloat(thresholdValue)) {
        return `Minimum ${label}: ${thresholdValue}${suffix}, yours: ${parsed}${suffix}`;
    }
    return null;
}

function checkAcademicCriteria(criteria, student) {
    const issues = [];

    const checks = [
        { threshold: criteria.min_overall_cgpa, value: student.overall_cgpa, label: 'CGPA required', suffix: '' },
        { threshold: criteria.min_tenth_percentage, value: student.tenth_percentage, label: '10th percentage', suffix: '%' },
    ];

    if (criteria.min_twelfth_percentage != null && student.twelfth_or_diploma === '12th') {
        checks.push({ threshold: criteria.min_twelfth_percentage, value: student.twelfth_percentage, label: '12th percentage', suffix: '%' });
    }

    if (criteria.min_diploma_percentage != null && student.twelfth_or_diploma === 'Diploma') {
        checks.push({ threshold: criteria.min_diploma_percentage, value: student.diploma_percentage, label: 'diploma percentage', suffix: '%' });
    }

    for (const { threshold, value, label, suffix } of checks) {
        if (threshold == null) continue;
        const issue = checkNumericThreshold(value, threshold, label, suffix);
        if (issue) issues.push(issue);
    }

    if (criteria.max_live_kts != null) {
        const studentKTs = student.total_live_kts || 0;
        if (studentKTs > criteria.max_live_kts) {
            issues.push(`Maximum live backlogs allowed: ${criteria.max_live_kts}, yours: ${studentKTs}`);
        }
    }

    return issues;
}

function checkDemographicCriteria(criteria, student) {
    const issues = [];

    if (criteria.allowed_genders && criteria.allowed_genders.length > 0) {
        if (!student.gender || !criteria.allowed_genders.includes(student.gender)) {
            issues.push(`Allowed genders: ${criteria.allowed_genders.join(', ')}`);
        }
    }

    if (criteria.allowed_departments && criteria.allowed_departments.length > 0) {
        if (!criteria.allowed_departments.includes(student.dept_name)) {
            issues.push(`Allowed departments: ${criteria.allowed_departments.join(', ')}`);
        }
    }

    if (criteria.allowed_gap_statuses && criteria.allowed_gap_statuses.length > 0) {
        const gapStatus = student.any_gap_during_education ? 'gap' : 'no_gap';
        if (!criteria.allowed_gap_statuses.includes(gapStatus)) {
            issues.push(`Education gap status not permitted for this job`);
        }
    }

    return issues;
}

function formatCriteriaResponse(criteria) {
    return {
        min_overall_cgpa: criteria.min_overall_cgpa == null ? null : Number.parseFloat(criteria.min_overall_cgpa),
        max_live_kts: criteria.max_live_kts,
        min_tenth_percentage: criteria.min_tenth_percentage == null ? null : Number.parseFloat(criteria.min_tenth_percentage),
        min_twelfth_percentage: criteria.min_twelfth_percentage == null ? null : Number.parseFloat(criteria.min_twelfth_percentage),
        min_diploma_percentage: criteria.min_diploma_percentage == null ? null : Number.parseFloat(criteria.min_diploma_percentage),
        allowed_genders: criteria.allowed_genders ?? null,
        allowed_departments: criteria.allowed_departments ?? null,
        allowed_gap_statuses: criteria.allowed_gap_statuses ?? null,
        exclude_already_placed: criteria.exclude_already_placed ?? false,
    };
}

async function evaluateEligibility(jobId, student) {
    const criteriaResult = await query(
        `SELECT ${CRITERIA_SELECT_COLUMNS}
         FROM job_eligibility_criteria
         WHERE job_id = $1 LIMIT 1`,
        [jobId]
    );

    const criteria = criteriaResult.rows[0] || null;

    if (!criteria) {
        return { is_eligible: true, issues: [], criteria: null };
    }

    const issues = [
        ...checkAcademicCriteria(criteria, student),
        ...checkDemographicCriteria(criteria, student),
    ];

    // Exclude already placed
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

    return {
        is_eligible: issues.length === 0,
        issues,
        criteria: formatCriteriaResponse(criteria),
    };
}

// ============================================================================
// HELPER — Check pre-application blockers (restrictions, profile, etc.)
// ============================================================================

async function checkApplicationBlockers(studentId, student, job) {
    const blockers = [];

    // 1. Profile must be approved
    if (!student.profile_is_approved) {
        blockers.push(ERROR_MESSAGES.PROFILE_NOT_APPROVED);
    }

    // 2. Job must be published
    if (job.job_status !== STATUS.JOB.PUBLISHED) {
        blockers.push(ERROR_MESSAGES.JOB_NOT_PUBLISHED);
    }

    // 3. Applications must be allowed
    if (job.allow_applications === false) {
        blockers.push(ERROR_MESSAGES.JOB_NOT_ACCEPTING);
    }

    // 4. Deadline check
    if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
        blockers.push(ERROR_MESSAGES.DEADLINE_PASSED);
    }

    // 5. Passout year match
    if (!Array.isArray(job.passout_years) || !job.passout_years.includes(student.student_passout_year)) {
        blockers.push(ERROR_MESSAGES.JOB_PASSOUT_YEAR_MISMATCH);
    }

    // 6-8. Run independent DB checks in parallel
    const [existingApp, existingDenial, restrictions] = await Promise.all([
        query(
            `SELECT 1 FROM student_applications
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            [studentId, job.job_id]
        ),
        query(
            `SELECT 1 FROM application_denials
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            [studentId, job.job_id]
        ),
        query(
            `SELECT restriction_type, reason FROM student_restrictions
             WHERE student_id = $1 AND is_active = true
               AND restriction_type IN ('bar_from_placements', 'temporary_suspension')
               AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
             LIMIT 1`,
            [studentId]
        ),
    ]);

    if (existingApp.rows.length > 0) {
        blockers.push(ERROR_MESSAGES.ALREADY_APPLIED);
    }
    if (existingDenial.rows.length > 0) {
        blockers.push(ERROR_MESSAGES.ALREADY_OPTED_OUT);
    }
    if (restrictions.rows.length > 0) {
        blockers.push(ERROR_MESSAGES.STUDENT_RESTRICTED);
    }

    return blockers;
}

// ============================================================================
// 1. GET AVAILABLE JOBS (published, within deadline, matching passout year)
// ============================================================================

async function getAvailableJobs(studentId, collegeId, filters = {}) {
    // Get student's passout year
    const studentResult = await query(
        `SELECT student_passout_year FROM students
         WHERE student_id = $1 AND college_id = $2 LIMIT 1`,
        [studentId, collegeId]
    );

    if (!studentResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const passoutYear = studentResult.rows[0].student_passout_year;
    const { page, limit, offset } = getPagination(filters);

    // Build WHERE conditions
    const conditions = [
        'j.college_id = $1',
        'j.job_status = $2',
        '$3 = ANY(j.passout_years)',
        'j.application_deadline >= NOW()',
    ];
    const params = [collegeId, STATUS.JOB.PUBLISHED, passoutYear];
    let paramIndex = 4;

    if (filters.search?.trim()) {
        conditions.push(
            `(j.job_title ILIKE $${paramIndex} OR c.company_name ILIKE $${paramIndex} OR j.job_description ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search.trim()}%`);
        paramIndex++;
    }

    if (filters.job_type) {
        conditions.push(`j.job_type = $${paramIndex}`);
        params.push(filters.job_type);
        paramIndex++;
    }

    if (filters.company_name?.trim()) {
        conditions.push(`c.company_name ILIKE $${paramIndex}`);
        params.push(`%${filters.company_name.trim()}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        application_deadline: 'j.application_deadline',
        created_at: 'j.created_at',
        job_title: 'j.job_title',
        company_name: 'c.company_name',
        salary_min: 'j.salary_min',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.application_deadline;
    const sortOrd = filters.sort_order === 'desc' ? 'DESC' : 'ASC';

    // Count + fetch in parallel (independent queries)
    const [countResult, jobsResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM job_postings j
             JOIN companies c ON j.company_id = c.company_id
             WHERE ${whereClause}`,
            params
        ),
        query(
        `SELECT j.job_id, j.job_title, j.job_description, j.job_location,
                j.salary_package, j.salary_min, j.salary_max,
                j.job_type, j.internship_duration, j.internship_stipend,
                j.application_deadline, j.created_at,
                j.bond_duration,
                c.company_id, c.company_name, c.company_website, c.industry AS industry_type,
                -- Application status for this student (NULL if not applied)
                sa.application_id,
                sa.application_status,
                -- Denial status for this student (NULL if not denied)
                ad.denial_id,
                -- Position count & total applications via LEFT JOIN aggregates
                COALESCE(pc.position_count, 0) AS position_count,
                COALESCE(ac.total_applications, 0) AS total_applications
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         LEFT JOIN student_applications sa ON sa.job_id = j.job_id AND sa.student_id = $${paramIndex}
         LEFT JOIN application_denials ad ON ad.job_id = j.job_id AND ad.student_id = $${paramIndex}
         LEFT JOIN (
             SELECT job_id, COUNT(*) AS position_count
             FROM job_positions WHERE position_status = 'active'
             GROUP BY job_id
         ) pc ON pc.job_id = j.job_id
         LEFT JOIN (
             SELECT job_id, COUNT(*) AS total_applications
             FROM student_applications
             GROUP BY job_id
         ) ac ON ac.job_id = j.job_id
         WHERE ${whereClause}
         ORDER BY ${sortCol} ${sortOrd}, j.job_title ASC
         LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}`,
        [...params, studentId, limit, offset]
        ),
    ]);
    const total = Number.parseInt(countResult.rows[0].total, 10);

    const jobs = jobsResult.rows.map(row => ({
        job_id: row.job_id,
        job_title: row.job_title,
        job_description: row.job_description,
        job_location: row.job_location,
        salary_package: row.salary_package,
        salary_min: row.salary_min == null ? null : Number.parseFloat(row.salary_min),
        salary_max: row.salary_max == null ? null : Number.parseFloat(row.salary_max),
        job_type: row.job_type,
        internship_duration: row.internship_duration ?? null,
        internship_stipend: row.internship_stipend ?? null,
        application_deadline: row.application_deadline,
        bond_duration: row.bond_duration ?? null,
        posted_at: row.created_at,
        // Company info
        company_id: row.company_id,
        company_name: row.company_name,
        company_website: row.company_website ?? null,
        industry_type: row.industry_type ?? null,
        // Counts
        position_count: Number.parseInt(row.position_count, 10),
        total_applications: Number.parseInt(row.total_applications, 10),
        // Student's status with this job
        application_status: row.application_status ?? null,
        has_applied: row.application_id != null,
        has_denied: row.denial_id != null,
    }));

    return { jobs, total, page, limit };
}

// ============================================================================
// 2. GET JOB DETAILS (full: positions, criteria, rounds, questions)
// ============================================================================

async function getJobDetails(jobId, studentId, collegeId) {
    // 1. Verify job exists in student's college & is published
    const job = await verifyJob(jobId, collegeId);

    if (job.job_status !== STATUS.JOB.PUBLISHED) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_PUBLISHED), { status: 400 });
    }

    // 2. Fetch all supplementary data — chunked to max 3 connections at a time
    const [positionsResult, criteriaResult, roundsResult, questionsResult, appResult, denialResult, appCountResult] = await chunkedQuery([
        // Positions
        {
            text: `SELECT position_id, position_name, position_description, vacancies, position_status
             FROM job_positions
             WHERE job_id = $1 AND position_status = 'active'
             ORDER BY position_name ASC`,
            params: [jobId],
        },
        // Eligibility criteria
        {
            text: `SELECT ${CRITERIA_SELECT_COLUMNS}
             FROM job_eligibility_criteria
             WHERE job_id = $1 LIMIT 1`,
            params: [jobId],
        },
        // Rounds
        {
            text: `SELECT round_id, round_number, round_name, round_description,
                    round_type, round_date, round_venue, round_status
             FROM job_rounds
             WHERE job_id = $1
             ORDER BY round_number ASC`,
            params: [jobId],
        },
        // Application questions
        {
            text: `SELECT question_id, question_text, question_type, question_options,
                    is_required, question_order
             FROM application_questions
             WHERE job_id = $1
             ORDER BY question_order ASC`,
            params: [jobId],
        },
        // Student's application status
        {
            text: `SELECT application_id, application_status, applied_at
             FROM student_applications
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            params: [studentId, jobId],
        },
        // Denial status
        {
            text: `SELECT denial_id, denial_reason, denied_at
             FROM application_denials
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            params: [studentId, jobId],
        },
        // Total applications count
        {
            text: `SELECT COUNT(*) AS total FROM student_applications
             WHERE job_id = $1`,
            params: [jobId],
        },
    ], 3);

    const criteria = criteriaResult.rows[0] || null;

    return {
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            job_description: job.job_description,
            job_location: job.job_location,
            salary_package: job.salary_package,
            salary_min: job.salary_min == null ? null : Number.parseFloat(job.salary_min),
            salary_max: job.salary_max == null ? null : Number.parseFloat(job.salary_max),
            bond_duration: job.bond_duration ?? null,
            bond_details: job.bond_details ?? null,
            job_type: job.job_type,
            internship_duration: job.internship_duration ?? null,
            internship_stipend: job.internship_stipend ?? null,
            passout_years: job.passout_years,
            application_deadline: job.application_deadline,
            job_status: job.job_status,
            posted_at: job.created_at,
            total_applications: Number.parseInt(appCountResult.rows[0].total, 10),
        },
        company: {
            company_id: job.company_id,
            company_name: job.company_name,
            company_website: job.company_website ?? null,
            industry_type: job.industry_type ?? null,
        },
        positions: positionsResult.rows.map(row => ({
            position_id: row.position_id,
            position_name: row.position_name,
            position_description: row.position_description ?? null,
            vacancies: row.vacancies,
        })),
        eligibility_criteria: criteria
            ? {
                min_overall_cgpa: criteria.min_overall_cgpa == null ? null : Number.parseFloat(criteria.min_overall_cgpa),
                max_live_kts: criteria.max_live_kts,
                min_tenth_percentage: criteria.min_tenth_percentage == null ? null : Number.parseFloat(criteria.min_tenth_percentage),
                min_twelfth_percentage: criteria.min_twelfth_percentage == null ? null : Number.parseFloat(criteria.min_twelfth_percentage),
                min_diploma_percentage: criteria.min_diploma_percentage == null ? null : Number.parseFloat(criteria.min_diploma_percentage),
                allowed_genders: criteria.allowed_genders ?? null,
                allowed_departments: criteria.allowed_departments ?? null,
                allowed_gap_statuses: criteria.allowed_gap_statuses ?? null,
                exclude_already_placed: criteria.exclude_already_placed ?? false,
            }
            : null,
        rounds: roundsResult.rows.map(row => ({
            round_id: row.round_id,
            round_number: row.round_number,
            round_name: row.round_name,
            round_description: row.round_description ?? null,
            round_type: row.round_type ?? null,
            round_date: row.round_date ?? null,
            round_venue: row.round_venue ?? null,
            round_status: row.round_status,
        })),
        questions: questionsResult.rows.map(row => ({
            question_id: row.question_id,
            question_text: row.question_text,
            question_type: row.question_type,
            question_options: row.question_options ?? null,
            is_required: row.is_required,
            question_order: row.question_order,
        })),
        student_status: {
            has_applied: appResult.rows.length > 0,
            application_id: appResult.rows[0]?.application_id ?? null,
            application_status: appResult.rows[0]?.application_status ?? null,
            applied_at: appResult.rows[0]?.applied_at ?? null,
            has_denied: denialResult.rows.length > 0,
            denial_reason: denialResult.rows[0]?.denial_reason ?? null,
            denied_at: denialResult.rows[0]?.denied_at ?? null,
        },
    };
}

// ============================================================================
// 3. CHECK JOB ELIGIBILITY
// ============================================================================

async function checkJobEligibility(jobId, studentId, collegeId) {
    const [job, student] = await Promise.all([
        verifyJob(jobId, collegeId),
        getStudentProfile(studentId, collegeId),
    ]);

    // Run eligibility + blocker checks in parallel
    const [eligibility, blockers] = await Promise.all([
        evaluateEligibility(jobId, student),
        checkApplicationBlockers(studentId, student, job),
    ]);

    return {
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            company_name: job.company_name,
            passout_years: job.passout_years,
            application_deadline: job.application_deadline,
            job_status: job.job_status,
        },
        eligibility: {
            is_eligible: eligibility.is_eligible,
            issues: eligibility.issues,
            criteria: eligibility.criteria,
        },
        student_snapshot: {
            overall_cgpa: student.overall_cgpa == null ? null : Number.parseFloat(student.overall_cgpa),
            total_live_kts: student.total_live_kts ?? 0,
            tenth_percentage: student.tenth_percentage == null ? null : Number.parseFloat(student.tenth_percentage),
            twelfth_or_diploma: student.twelfth_or_diploma ?? null,
            twelfth_percentage: student.twelfth_percentage == null ? null : Number.parseFloat(student.twelfth_percentage),
            diploma_percentage: student.diploma_percentage == null ? null : Number.parseFloat(student.diploma_percentage),
            gender: student.gender ?? null,
            dept_name: student.dept_name,
            gap_status: student.any_gap_during_education ? 'gap' : 'no_gap',
            profile_is_approved: student.profile_is_approved,
        },
        blockers,
        can_apply: eligibility.is_eligible && blockers.length === 0,
    };
}

// ============================================================================
// 4. APPLY FOR JOB (transaction: application + answers)
// ============================================================================

function throwBadRequest(message) {
    throw Object.assign(new Error(message), { status: 400 });
}

async function resolveEligibilityOverride(studentId, jobId, eligibility) {
    if (eligibility.is_eligible) {
        return null;
    }

    const overrideCheck = await query(
        `SELECT override_id, override_status, rejection_reason
         FROM job_eligibility_override_requests
         WHERE student_id = $1 AND job_id = $2
         LIMIT 1`,
        [studentId, jobId]
    );

    if (overrideCheck.rows.length === 0) {
        throwBadRequest(`${ERROR_MESSAGES.NOT_ELIGIBLE_SUBMIT_OVERRIDE} Reasons: ${eligibility.issues.join('; ')}`);
    }

    const ov = overrideCheck.rows[0];
    if (ov.override_status === 'approved') {
        return ov.override_id;
    }
    if (ov.override_status === 'rejected') {
        const reason = ov.rejection_reason ? `: ${ov.rejection_reason}` : '';
        throwBadRequest(`${ERROR_MESSAGES.OVERRIDE_REJECTED}${reason}`);
    }

    throwBadRequest(ERROR_MESSAGES.OVERRIDE_PENDING);
}

async function validateAnswers(jobId, data) {
    const questionsResult = await query(
        `SELECT question_id, question_type, is_required, question_order
         FROM application_questions
         WHERE job_id = $1
         ORDER BY question_order ASC`,
        [jobId]
    );

    const questions = questionsResult.rows;
    const answersMap = new Map();
    for (const ans of (data.answers || [])) {
        answersMap.set(ans.question_id, ans);
    }

    for (const q of questions) {
        if (!q.is_required) continue;

        const answer = answersMap.get(q.question_id);
        if (!answer) {
            throwBadRequest(`${ERROR_MESSAGES.REQUIRED_QUESTION_NOT_ANSWERED} (question #${q.question_order})`);
        }

        const hasContent =
            answer.answer_text?.trim() ||
            (answer.answer_options && answer.answer_options.length > 0) ||
            (answer.answer_boolean !== null && answer.answer_boolean !== undefined);
        if (!hasContent) {
            throwBadRequest(`${ERROR_MESSAGES.REQUIRED_QUESTION_EMPTY} (question #${q.question_order})`);
        }
    }

    const validQuestionIds = new Set(questions.map(q => q.question_id));
    for (const ans of (data.answers || [])) {
        if (!validQuestionIds.has(ans.question_id)) {
            throwBadRequest(ERROR_MESSAGES.INVALID_ANSWER_QUESTIONS);
        }
    }
}

async function insertApplicationAnswers(client, applicationId, answers) {
    if (answers.length === 0) return [];

    const valuePlaceholders = [];
    const ansParams = [];
    let idx = 1;
    for (const ans of answers) {
        valuePlaceholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
        ansParams.push(
            applicationId,
            ans.question_id,
            ans.answer_text || null,
            ans.answer_options || null,
            ans.answer_boolean ?? null
        );
        idx += 5;
    }

    const ansResult = await client.query(
        `INSERT INTO application_answers
            (application_id, question_id, answer_text, answer_options, answer_boolean)
         VALUES ${valuePlaceholders.join(', ')}
         RETURNING answer_id, question_id`,
        ansParams
    );
    return ansResult.rows;
}

async function applyForJob(jobId, studentId, collegeId, data) {
    const [job, student] = await Promise.all([
        verifyJob(jobId, collegeId),
        getStudentProfile(studentId, collegeId),
    ]);

    // Check all blockers
    const blockers = await checkApplicationBlockers(studentId, student, job);
    if (blockers.length > 0) {
        throwBadRequest(blockers[0]);
    }

    const eligibility = await evaluateEligibility(jobId, student);
    const approvedOverrideId = await resolveEligibilityOverride(studentId, jobId, eligibility);

    // Validate position_id if provided
    if (data.position_id) {
        const posCheck = await query(
            `SELECT 1 FROM job_positions
             WHERE position_id = $1 AND job_id = $2 AND position_status = 'active' LIMIT 1`,
            [data.position_id, jobId]
        );
        if (!posCheck.rows.length) {
            throwBadRequest(ERROR_MESSAGES.POSITION_NOT_ACTIVE);
        }
    }

    await validateAnswers(jobId, data);

    const client = await getClient();

    try {
        await client.query('BEGIN');

        const eligibilityRemarks = eligibility.is_eligible
            ? null
            : eligibility.issues.join('; ');

        const appResult = await client.query(
            `INSERT INTO student_applications
                (student_id, job_id, position_id, college_id,
                 application_status, is_eligible, eligibility_remarks, override_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING ${APPLICATION_RETURNING_COLUMNS}`,
            [
                studentId,
                jobId,
                data.position_id || null,
                collegeId,
                STATUS.APPLICATION.PENDING,
                eligibility.is_eligible,
                eligibilityRemarks,
                approvedOverrideId,
            ]
        );

        const application = appResult.rows[0];
        const insertedAnswers = await insertApplicationAnswers(client, application.application_id, data.answers || []);

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Job application committed`, {
            applicationId: application.application_id,
            studentId,
            jobId,
            collegeId,
            answersCount: insertedAnswers.length,
        });

        return {
            application_id: application.application_id,
            job_id: application.job_id,
            position_id: application.position_id,
            application_status: application.application_status,
            is_eligible: application.is_eligible,
            eligibility_remarks: application.eligibility_remarks ?? null,
            applied_at: application.applied_at,
            answers_submitted: insertedAnswers.length,
            job_title: job.job_title,
            company_name: job.company_name,
        };
    } catch (error) {
        await client.query('ROLLBACK');

        logger.error(`${LOG.TRANSACTION} Job application rolled back`, {
            error: error.message,
            stack: error.stack,
            studentId,
            jobId,
        });

        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 5. DENY JOB (opt-out with reason)
// ============================================================================

async function denyJob(jobId, studentId, collegeId, data) {
    const [job, studentRow] = await Promise.all([
        verifyJob(jobId, collegeId),
        query(
            `SELECT student_passout_year FROM students
             WHERE student_id = $1 AND college_id = $2 LIMIT 1`,
            [studentId, collegeId]
        ),
    ]);

    // Job must be published
    if (job.job_status !== STATUS.JOB.PUBLISHED) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_PUBLISHED), { status: 400 });
    }

    // Passout year must match
    const student = studentRow.rows[0];
    if (!student || !Array.isArray(job.passout_years) || !job.passout_years.includes(student.student_passout_year)) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.JOB_PASSOUT_YEAR_MISMATCH),
            { status: 403 }
        );
    }

    // Check both blockers in parallel
    const [existingApp, existingDenial] = await Promise.all([
        query(
            `SELECT 1 FROM student_applications
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            [studentId, jobId]
        ),
        query(
            `SELECT 1 FROM application_denials
             WHERE student_id = $1 AND job_id = $2 LIMIT 1`,
            [studentId, jobId]
        ),
    ]);
    if (existingApp.rows.length > 0) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_OPT_OUT_ALREADY_APPLIED),
            { status: 400 }
        );
    }
    if (existingDenial.rows.length > 0) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.ALREADY_OPTED_OUT),
            { status: 409 }
        );
    }

    const result = await query(
        `INSERT INTO application_denials
            (student_id, job_id, college_id, denial_reason, additional_comments)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${DENIAL_RETURNING_COLUMNS}`,
        [
            studentId,
            jobId,
            collegeId,
            data.denial_reason,
            data.additional_comments || null,
        ]
    );

    const denial = result.rows[0];

    logger.info(`${LOG.AUTH} Student denied job`, {
        denialId: denial.denial_id,
        studentId,
        jobId,
        collegeId,
    });

    return {
        denial_id: denial.denial_id,
        job_id: denial.job_id,
        denial_reason: denial.denial_reason,
        additional_comments: denial.additional_comments ?? null,
        denied_at: denial.denied_at,
        job_title: job.job_title,
        company_name: job.company_name,
    };
}

// ============================================================================
// 6. GET MY APPLICATIONS (paginated, filtered, sorted)
// ============================================================================

async function getMyApplications(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    // Build WHERE conditions
    const conditions = ['a.student_id = $1', 'a.college_id = $2'];
    const params = [studentId, collegeId];
    let paramIndex = 3;

    if (filters.application_status) {
        conditions.push(`a.application_status = $${paramIndex}`);
        params.push(filters.application_status);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        applied_at: 'a.applied_at',
        last_updated_at: 'a.last_updated_at',
        application_status: 'a.application_status',
        job_title: 'j.job_title',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.applied_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Run count, fetch, and summary in parallel (all independent)
    const [countResult, appResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM student_applications a
             JOIN job_postings j ON a.job_id = j.job_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT a.application_id, a.job_id, a.position_id,
                a.application_status, a.current_round_id,
                a.is_eligible, a.eligibility_remarks,
                a.applied_at, a.last_updated_at,
                j.job_title, j.job_type, j.job_location,
                j.salary_package, j.salary_min, j.salary_max,
                j.job_status, j.application_deadline,
                c.company_id, c.company_name,
                p.position_name,
                -- Current round info
                jr.round_name AS current_round_name,
                jr.round_number AS current_round_number,
                -- Rounds passed & total rounds via LEFT JOIN aggregates
                COALESCE(rp.rounds_passed, 0) AS rounds_passed,
                COALESCE(tr.total_rounds, 0) AS total_rounds
         FROM student_applications a
         JOIN job_postings j ON a.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         LEFT JOIN job_positions p ON a.position_id = p.position_id
         LEFT JOIN job_rounds jr ON a.current_round_id = jr.round_id
         LEFT JOIN (
             SELECT srr.application_id, COUNT(*) AS rounds_passed
             FROM student_round_results srr
             WHERE srr.result_status = 'passed'
             GROUP BY srr.application_id
         ) rp ON rp.application_id = a.application_id
         LEFT JOIN (
             SELECT job_id, COUNT(*) AS total_rounds
             FROM job_rounds
             GROUP BY job_id
         ) tr ON tr.job_id = a.job_id
         WHERE ${whereClause}
         ORDER BY ${sortCol} ${sortOrd}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT application_status, COUNT(*) AS cnt
             FROM student_applications
             WHERE student_id = $1 AND college_id = $2
             GROUP BY application_status`,
            [studentId, collegeId]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    const statusSummary = {
        total: 0,
        pending: 0,
        under_review: 0,
        shortlisted: 0,
        rejected: 0,
        selected: 0,
        offered: 0,
        withdrawn: 0,
    };

    for (const row of summaryResult.rows) {
        const count = Number.parseInt(row.cnt, 10);
        statusSummary[row.application_status] = count;
        statusSummary.total += count;
    }

    const applications = appResult.rows.map(row => ({
        application_id: row.application_id,
        job_id: row.job_id,
        position_id: row.position_id,
        application_status: row.application_status,
        is_eligible: row.is_eligible,
        eligibility_remarks: row.eligibility_remarks ?? null,
        applied_at: row.applied_at,
        last_updated_at: row.last_updated_at,
        // Job info
        job_title: row.job_title,
        job_type: row.job_type,
        job_location: row.job_location,
        salary_package: row.salary_package,
        salary_min: row.salary_min == null ? null : Number.parseFloat(row.salary_min),
        salary_max: row.salary_max == null ? null : Number.parseFloat(row.salary_max),
        job_status: row.job_status,
        application_deadline: row.application_deadline,
        // Company info
        company_id: row.company_id,
        company_name: row.company_name,
        // Position info
        position_name: row.position_name ?? null,
        // Round progress
        current_round_name: row.current_round_name ?? null,
        current_round_number: row.current_round_number ?? null,
        rounds_passed: Number.parseInt(row.rounds_passed, 10),
        total_rounds: Number.parseInt(row.total_rounds, 10),
    }));

    return { applications, total, page, limit, status_summary: statusSummary };
}

// ============================================================================
// 7. GET APPLICATION DETAILS (with answers + round results)
// ============================================================================

async function getApplicationDetails(applicationId, studentId, collegeId) {
    // Verify ownership
    const app = await verifyStudentApplication(applicationId, studentId, collegeId);

    // Fetch all supplementary data in parallel
    const [answersResult, roundResultsRes, allRoundsResult, placementResult] = await Promise.all([
        // Answers with question info
        query(
            `SELECT aa.answer_id, aa.question_id,
                    aq.question_text, aq.question_type, aq.question_options,
                    aq.is_required, aq.question_order,
                    aa.answer_text, aa.answer_options, aa.answer_boolean
             FROM application_answers aa
             JOIN application_questions aq ON aa.question_id = aq.question_id
             WHERE aa.application_id = $1
             ORDER BY aq.question_order ASC`,
            [applicationId]
        ),
        // Round results
        query(
            `SELECT rr.result_id, rr.round_id, rr.result_status, rr.score,
                    rr.remarks, rr.attended, rr.scheduled_at, rr.completed_at,
                    jr.round_name, jr.round_number, jr.round_type, jr.round_status,
                    jr.round_date, jr.round_venue
             FROM student_round_results rr
             JOIN job_rounds jr ON rr.round_id = jr.round_id
             WHERE rr.application_id = $1 AND rr.student_id = $2
             ORDER BY jr.round_number ASC`,
            [applicationId, studentId]
        ),
        // All rounds for this job
        query(
            `SELECT round_id, round_number, round_name, round_type,
                    round_date, round_venue, round_status
             FROM job_rounds
             WHERE job_id = $1
             ORDER BY round_number ASC`,
            [app.job_id]
        ),
        // Placement result for this application
        query(
            `SELECT placement_id, placement_type, placement_status,
                    acceptance_status, fulltime_package, fulltime_designation,
                    internship_stipend
             FROM placement_results
             WHERE application_id = $1 AND student_id = $2
             LIMIT 1`,
            [applicationId, studentId]
        ),
    ]);

    return {
        application: {
            application_id: app.application_id,
            job_id: app.job_id,
            position_id: app.position_id,
            application_status: app.application_status,
            current_round_id: app.current_round_id,
            is_eligible: app.is_eligible,
            eligibility_remarks: app.eligibility_remarks ?? null,
            applied_at: app.applied_at,
            last_updated_at: app.last_updated_at,
            // Job info
            job_title: app.job_title,
            job_status: app.job_status,
            application_deadline: app.application_deadline,
            company_name: app.company_name,
            position_name: app.position_name ?? null,
        },
        answers: answersResult.rows.map(row => ({
            answer_id: row.answer_id,
            question_id: row.question_id,
            question_text: row.question_text,
            question_type: row.question_type,
            question_options: row.question_options ?? null,
            is_required: row.is_required,
            question_order: row.question_order,
            answer_text: row.answer_text ?? null,
            answer_options: row.answer_options ?? null,
            answer_boolean: row.answer_boolean ?? null,
        })),
        round_results: roundResultsRes.rows.map(row => ({
            result_id: row.result_id,
            round_id: row.round_id,
            round_name: row.round_name,
            round_number: row.round_number,
            round_type: row.round_type ?? null,
            round_status: row.round_status,
            round_date: row.round_date ?? null,
            round_venue: row.round_venue ?? null,
            result_status: row.result_status,
            score: row.score == null ? null : Number.parseFloat(row.score),
            remarks: row.remarks ?? null,
            attended: row.attended,
            scheduled_at: row.scheduled_at ?? null,
            completed_at: row.completed_at ?? null,
        })),
        all_rounds: allRoundsResult.rows.map(row => ({
            round_id: row.round_id,
            round_number: row.round_number,
            round_name: row.round_name,
            round_type: row.round_type ?? null,
            round_date: row.round_date ?? null,
            round_venue: row.round_venue ?? null,
            round_status: row.round_status,
        })),
        placement: placementResult.rows[0]
            ? {
                placement_id: placementResult.rows[0].placement_id,
                placement_type: placementResult.rows[0].placement_type,
                placement_status: placementResult.rows[0].placement_status,
                acceptance_status: placementResult.rows[0].acceptance_status ?? null,
                fulltime_package: placementResult.rows[0].fulltime_package == null
                    ? null : Number.parseFloat(placementResult.rows[0].fulltime_package),
                fulltime_designation: placementResult.rows[0].fulltime_designation ?? null,
                internship_stipend: placementResult.rows[0].internship_stipend == null
                    ? null : Number.parseFloat(placementResult.rows[0].internship_stipend),
            }
            : null,
    };
}

// ============================================================================
// 8. WITHDRAW APPLICATION
// ============================================================================

async function withdrawApplication(applicationId, studentId, collegeId, reason) {
    const app = await verifyStudentApplication(applicationId, studentId, collegeId);
    const currentStatus = app.application_status;

    // Already withdrawn
    if (currentStatus === STATUS.APPLICATION.WITHDRAWN) {
        throwBadRequest(ERROR_MESSAGES.APPLICATION_ALREADY_WITHDRAWN);
    }

    // Can only withdraw from specific statuses
    if (!WITHDRAWABLE_STATUSES.includes(currentStatus)) {
        throwBadRequest(`${ERROR_MESSAGES.CANNOT_WITHDRAW_STATUS}. Allowed: ${WITHDRAWABLE_STATUSES.join(', ')}`);
    }

    const result = await query(
        `UPDATE student_applications
         SET application_status = $1,
             eligibility_remarks = CASE
                 WHEN $2::text IS NOT NULL THEN
                     CASE WHEN eligibility_remarks IS NOT NULL AND eligibility_remarks != ''
                          THEN eligibility_remarks || ' | Withdrawal reason: ' || $2
                          ELSE 'Withdrawal reason: ' || $2
                     END
                 ELSE eligibility_remarks
             END,
             last_updated_at = NOW()
         WHERE application_id = $3
         RETURNING ${APPLICATION_RETURNING_COLUMNS}`,
        [STATUS.APPLICATION.WITHDRAWN, reason || null, applicationId]
    );

    logger.info(`${LOG.AUTH} Student withdrew application`, {
        applicationId,
        studentId,
        jobId: app.job_id,
        collegeId,
        previousStatus: currentStatus,
    });

    return {
        application_id: result.rows[0].application_id,
        application_status: result.rows[0].application_status,
        previous_status: currentStatus,
        last_updated_at: result.rows[0].last_updated_at,
        job_title: app.job_title,
        company_name: app.company_name,
    };
}

// ============================================================================
// GET AVAILABLE JOB YEARS — distinct passout years with published jobs
// ============================================================================

async function getAvailableJobYears(collegeId) {
    const result = await query(
        `SELECT DISTINCT unnest(passout_years) AS year
         FROM job_postings
         WHERE college_id = $1
           AND job_status = $2
         ORDER BY year DESC`,
        [collegeId, STATUS.JOB.PUBLISHED]
    );

    return result.rows.map(r => r.year);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getAvailableJobYears,
    getAvailableJobs,
    getJobDetails,
    checkJobEligibility,
    applyForJob,
    denyJob,
    getMyApplications,
    getApplicationDetails,
    withdrawApplication,
};
