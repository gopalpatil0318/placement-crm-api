/**
 * ============================================================================
 * ELIGIBLE NOT APPLIED & DENIALS SERVICE — Business Logic
 * ============================================================================
 *   getEligibleNotApplied  — Eligible students who didn't apply for a job
 *   notifyEligibleStudents — Bulk-create notifications for eligible students
 *   getJobDenials          — Students who explicitly denied/opted out
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// ============================================================================
// HELPER — Verify job exists and belongs to college (returns full job info)
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_status, j.passout_years,
                j.application_deadline, j.company_id,
                c.company_name
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
// HELPER — Build eligibility WHERE conditions (reuses jobCriteria logic)
// ============================================================================

async function buildEligibilityConditions(jobId, collegeId, passoutYears) {
    // Base conditions: active students in this college with matching passout year
    const conditions = [
        's.college_id = $1',
        's.student_status = $2',
        's.student_passout_year = ANY($3)',
    ];
    const params = [collegeId, STATUS.STUDENT.ACTIVE, passoutYears];
    let paramIndex = 4;

    // Fetch criteria for this job
    const criteriaResult = await query(
        `SELECT * FROM job_eligibility_criteria
         WHERE job_id = $1 LIMIT 1`,
        [jobId]
    );

    const criteria = criteriaResult.rows[0] || null;

    // Apply criteria-based conditions ONLY if criteria exists and fields are non-null
    if (criteria) {
        // CGPA filter
        if (criteria.min_overall_cgpa !== null && criteria.min_overall_cgpa !== undefined) {
            conditions.push(`COALESCE(acad.overall_cgpa, 0) >= $${paramIndex}`);
            params.push(criteria.min_overall_cgpa);
            paramIndex++;
        }

        // Live KTs filter
        if (criteria.max_live_kts !== null && criteria.max_live_kts !== undefined) {
            conditions.push(`COALESCE(acad.total_live_kts, 0) <= $${paramIndex}`);
            params.push(criteria.max_live_kts);
            paramIndex++;
        }

        // 10th percentage
        if (criteria.min_tenth_percentage !== null && criteria.min_tenth_percentage !== undefined) {
            conditions.push(`COALESCE(acad.tenth_percentage, 0) >= $${paramIndex}`);
            params.push(criteria.min_tenth_percentage);
            paramIndex++;
        }

        // 12th percentage (only for students who did 12th)
        if (criteria.min_twelfth_percentage !== null && criteria.min_twelfth_percentage !== undefined) {
            conditions.push(
                `(acad.twelfth_or_diploma != '12th' OR COALESCE(acad.twelfth_percentage, 0) >= $${paramIndex})`
            );
            params.push(criteria.min_twelfth_percentage);
            paramIndex++;
        }

        // Diploma percentage (only for Diploma students)
        if (criteria.min_diploma_percentage !== null && criteria.min_diploma_percentage !== undefined) {
            conditions.push(
                `(acad.twelfth_or_diploma != 'Diploma' OR COALESCE(acad.diploma_percentage, 0) >= $${paramIndex})`
            );
            params.push(criteria.min_diploma_percentage);
            paramIndex++;
        }

        // Gender filter
        if (criteria.allowed_genders && criteria.allowed_genders.length > 0) {
            conditions.push(`pi.gender = ANY($${paramIndex})`);
            params.push(criteria.allowed_genders);
            paramIndex++;
        }

        // Department filter
        if (criteria.allowed_departments && criteria.allowed_departments.length > 0) {
            conditions.push(`d.dept_name = ANY($${paramIndex})`);
            params.push(criteria.allowed_departments);
            paramIndex++;
        }

        // Gap status filter
        if (criteria.allowed_gap_statuses && criteria.allowed_gap_statuses.length > 0) {
            conditions.push(
                `(CASE WHEN acad.any_gap_during_education = true THEN 'gap' ELSE 'no_gap' END) = ANY($${paramIndex})`
            );
            params.push(criteria.allowed_gap_statuses);
            paramIndex++;
        }

        // Exclude already placed
        if (criteria.exclude_already_placed === true) {
            conditions.push(
                `NOT EXISTS (
                    SELECT 1 FROM student_applications sa_placed
                    WHERE sa_placed.student_id = s.student_id
                      AND sa_placed.application_status = 'selected'
                )`
            );
        }
    }

    // Exclude students with active restrictions
    conditions.push(
        `NOT EXISTS (
            SELECT 1 FROM student_restrictions sr
            WHERE sr.student_id = s.student_id
              AND sr.is_active = true
              AND sr.restriction_type IN ('bar_from_placements', 'temporary_suspension')
        )`
    );

    return { conditions, params, paramIndex, criteria };
}

// ============================================================================
// SORT COLUMN MAPS
// ============================================================================

const ELIGIBLE_SORTABLE = {
    student_name: `CONCAT(s.first_name, ' ', s.last_name)`,
    student_email: 's.student_email',
    overall_cgpa: 'acad.overall_cgpa',
    dept_name: 'd.dept_name',
};

const DENIAL_SORTABLE = {
    denied_at: 'ad.denied_at',
    student_name: `CONCAT(s.first_name, ' ', s.last_name)`,
    denial_reason: 'ad.denial_reason',
};

// ============================================================================
// 1. GET ELIGIBLE NOT APPLIED
// ============================================================================

/**
 * Get students who meet eligibility criteria but haven't applied.
 * Reuses exact same eligibility logic as jobCriteria.service.js.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} filters — { search, dept_name, sort_by, sort_order, page, limit }
 * @returns {{ job, criteria, students, eligible_not_applied_count, total_eligible, total_applied, page, limit }}
 */
async function getEligibleNotApplied(jobId, collegeId, filters = {}) {
    const job = await verifyJob(jobId, collegeId);
    const { page, limit, offset } = getPagination(filters);

    // Build eligibility conditions
    let { conditions, params, paramIndex, criteria } =
        await buildEligibilityConditions(jobId, collegeId, job.passout_years);

    // Core filter: exclude students who already have an application for this job
    conditions.push(
        `NOT EXISTS (
            SELECT 1 FROM student_applications sa
            WHERE sa.student_id = s.student_id
              AND sa.job_id = $${paramIndex}
        )`
    );
    params.push(jobId);
    paramIndex++;

    // Also exclude students who explicitly denied this job
    conditions.push(
        `NOT EXISTS (
            SELECT 1 FROM application_denials ad
            WHERE ad.student_id = s.student_id
              AND ad.job_id = $${paramIndex}
        )`
    );
    params.push(jobId);
    paramIndex++;

    // Additional filters
    if (filters.search && filters.search.trim()) {
        conditions.push(
            `(CONCAT(s.first_name, ' ', COALESCE(s.middle_name, ''), ' ', s.last_name) ILIKE $${paramIndex}
              OR s.student_email ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search.trim()}%`);
        paramIndex++;
    }

    if (filters.dept_name && filters.dept_name.trim()) {
        conditions.push(`d.dept_name ILIKE $${paramIndex}`);
        params.push(`%${filters.dept_name.trim()}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const fromClause = `
        FROM students s
        LEFT JOIN student_academic_information acad ON s.student_id = acad.student_id
        LEFT JOIN student_personal_information pi ON s.student_id = pi.student_id
        JOIN departments d ON s.dept_id = d.dept_id
    `;

    // Sort
    const sortColumn = ELIGIBLE_SORTABLE[filters.sort_by] || ELIGIBLE_SORTABLE.overall_cgpa;
    const order = filters.sort_order === 'asc' ? 'ASC' : 'DESC';
    const nullsHandling = sortColumn.includes('cgpa') ? ' NULLS LAST' : '';

    // Count + Applied count + Students (parallel — all independent)
    const [countResult, appliedCountResult, studentsResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total ${fromClause} WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT COUNT(*) AS total FROM student_applications
             WHERE job_id = $1 AND college_id = $2`,
            [jobId, collegeId]
        ),
        query(
            `SELECT
                s.student_id,
                CONCAT(s.first_name, ' ', COALESCE(s.middle_name || ' ', ''), s.last_name) AS student_name,
                s.student_email,
                s.student_passout_year,
                d.dept_name,
                acad.overall_cgpa,
                acad.total_live_kts,
                acad.tenth_percentage,
                acad.twelfth_or_diploma,
                acad.twelfth_percentage,
                acad.diploma_percentage,
                pi.gender,
                s.profile_complete,
                s.profile_is_approved
             ${fromClause}
             WHERE ${whereClause}
             ORDER BY ${sortColumn} ${order}${nullsHandling}, s.first_name ASC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);
    const eligibleNotAppliedCount = parseInt(countResult.rows[0].total, 10);
    const totalApplied = parseInt(appliedCountResult.rows[0].total, 10);

    return {
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            company_name: job.company_name,
            passout_years: job.passout_years,
            job_status: job.job_status,
            application_deadline: job.application_deadline,
        },
        criteria,
        eligible_not_applied_count: eligibleNotAppliedCount,
        total_applied: totalApplied,
        students: studentsResult.rows,
        page,
        limit,
    };
}

// ============================================================================
// 2. NOTIFY ELIGIBLE STUDENTS
// ============================================================================

/**
 * Send notifications to eligible students who haven't applied.
 * If student_ids is provided and non-empty, only notify those specific students.
 * Otherwise, notify ALL eligible-not-applied students.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {string} userId — who sent the notification
 * @param {Object} data — { title, body, student_ids? }
 * @returns {{ notified_count, skipped_count, job }}
 */
async function notifyEligibleStudents(jobId, collegeId, userId, data) {
    const job = await verifyJob(jobId, collegeId);
    const { title, body, student_ids } = data;

    let targetStudentIds = [];

    if (student_ids && student_ids.length > 0) {
        // Validate that these students are actually eligible and haven't applied
        // We still compute the eligible-not-applied set and intersect
        const { conditions, params, paramIndex } =
            await buildEligibilityConditions(jobId, collegeId, job.passout_years);

        // Exclude students who already applied
        conditions.push(
            `NOT EXISTS (
                SELECT 1 FROM student_applications sa
                WHERE sa.student_id = s.student_id
                  AND sa.job_id = $${paramIndex}
            )`
        );
        params.push(jobId);

        // Exclude students who denied
        conditions.push(
            `NOT EXISTS (
                SELECT 1 FROM application_denials ad
                WHERE ad.student_id = s.student_id
                  AND ad.job_id = $${paramIndex + 1}
            )`
        );
        params.push(jobId);

        // Filter to only the selected student_ids
        conditions.push(`s.student_id = ANY($${paramIndex + 2})`);
        params.push(student_ids);

        const whereClause = conditions.join(' AND ');
        const validResult = await query(
            `SELECT s.student_id
             FROM students s
             LEFT JOIN student_academic_information acad ON s.student_id = acad.student_id
             LEFT JOIN student_personal_information pi ON s.student_id = pi.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}`,
            params
        );
        targetStudentIds = validResult.rows.map(r => r.student_id);
    } else {
        // Notify ALL eligible-not-applied students
        const { conditions, params, paramIndex } =
            await buildEligibilityConditions(jobId, collegeId, job.passout_years);

        conditions.push(
            `NOT EXISTS (
                SELECT 1 FROM student_applications sa
                WHERE sa.student_id = s.student_id
                  AND sa.job_id = $${paramIndex}
            )`
        );
        params.push(jobId);

        conditions.push(
            `NOT EXISTS (
                SELECT 1 FROM application_denials ad
                WHERE ad.student_id = s.student_id
                  AND ad.job_id = $${paramIndex + 1}
            )`
        );
        params.push(jobId);

        const whereClause = conditions.join(' AND ');
        const allResult = await query(
            `SELECT s.student_id
             FROM students s
             LEFT JOIN student_academic_information acad ON s.student_id = acad.student_id
             LEFT JOIN student_personal_information pi ON s.student_id = pi.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}`,
            params
        );
        targetStudentIds = allResult.rows.map(r => r.student_id);
    }

    if (targetStudentIds.length === 0) {
        return {
            notified_count: 0,
            skipped_count: student_ids ? student_ids.length : 0,
            job: {
                job_id: job.job_id,
                job_title: job.job_title,
                company_name: job.company_name,
            },
        };
    }

    // Batch insert notifications — skip duplicates in a single query
    const client = await getClient();
    let notifiedCount = 0;
    let skippedCount = 0;

    try {
        await client.query('BEGIN');

        // Count existing notifications for these students (to compute skipped)
        const existingResult = await client.query(
            `SELECT COUNT(*) AS cnt FROM notifications
             WHERE college_id = $1
               AND recipient_type = 'student'
               AND recipient_id = ANY($2)
               AND related_entity_type = 'job'
               AND related_entity_id = $3
               AND notification_type = 'deadline_reminder'`,
            [collegeId, targetStudentIds, jobId]
        );
        const alreadyNotified = parseInt(existingResult.rows[0].cnt, 10);

        // Batch INSERT using UNNEST + WHERE NOT EXISTS (avoids N+1 loop)
        const insertResult = await client.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             SELECT $1, 'student', sid, $2, $3,
                    'deadline_reminder', 'job', $4
             FROM UNNEST($5::uuid[]) AS sid
             WHERE NOT EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.college_id = $1
                   AND n.recipient_type = 'student'
                   AND n.recipient_id = sid
                   AND n.related_entity_type = 'job'
                   AND n.related_entity_id = $4
                   AND n.notification_type = 'deadline_reminder'
             )`,
            [collegeId, title.trim(), body.trim(), jobId, targetStudentIds]
        );

        notifiedCount = insertResult.rowCount;
        skippedCount = alreadyNotified;

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Notifications sent to eligible students`, {
            job_id: jobId,
            college_id: collegeId,
            notified_count: notifiedCount,
            skipped_count: skippedCount,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`${LOG.TRANSACTION} Failed to send notifications`, {
            error: err.message,
            stack: err.stack,
            job_id: jobId,
        });
        throw err;
    } finally {
        client.release();
    }

    return {
        notified_count: notifiedCount,
        skipped_count: skippedCount,
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            company_name: job.company_name,
        },
    };
}

// ============================================================================
// 3. GET JOB DENIALS
// ============================================================================

/**
 * Get students who explicitly denied/opted out of a job.
 * Reads from application_denials table.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} filters — { search, sort_by, sort_order, page, limit }
 * @returns {{ job, denials, total, page, limit }}
 */
async function getJobDenials(jobId, collegeId, filters = {}) {
    const job = await verifyJob(jobId, collegeId);
    const { page, limit, offset } = getPagination(filters);

    // Build WHERE
    const conditions = ['ad.job_id = $1', 'ad.college_id = $2'];
    const params = [jobId, collegeId];
    let paramIndex = 3;

    if (filters.search && filters.search.trim()) {
        conditions.push(
            `(CONCAT(s.first_name, ' ', COALESCE(s.middle_name, ''), ' ', s.last_name) ILIKE $${paramIndex}
              OR s.student_email ILIKE $${paramIndex}
              OR ad.denial_reason ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search.trim()}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sort
    const sortColumn = DENIAL_SORTABLE[filters.sort_by] || DENIAL_SORTABLE.denied_at;
    const order = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count + Data (parallel — both independent)
    const [countResult, dataResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM application_denials ad
             JOIN students s ON ad.student_id = s.student_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT
                ad.denial_id,
                ad.student_id,
                CONCAT(s.first_name, ' ', COALESCE(s.middle_name || ' ', ''), s.last_name) AS student_name,
                s.student_email,
                d.dept_name,
                s.student_passout_year,
                ad.denial_reason,
                ad.additional_comments,
                ad.denied_at
             FROM application_denials ad
             JOIN students s ON ad.student_id = s.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY ${sortColumn} ${order}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);
    const total = parseInt(countResult.rows[0].total, 10);

    return {
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            company_name: job.company_name,
            passout_years: job.passout_years,
        },
        denials: dataResult.rows,
        total,
        page,
        limit,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getEligibleNotApplied,
    notifyEligibleStudents,
    getJobDenials,
};
