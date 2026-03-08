/**
 * ============================================================================
 * APPLICATION MANAGEMENT SERVICE — College-Side Application Operations
 * ============================================================================
 *   - getJobApplications(jobId, collegeId, filters)
 *   - getApplication(applicationId, collegeId)
 *   - updateApplicationStatus(applicationId, collegeId, newStatus, remarks)
 *   - bulkUpdateApplicationStatus(collegeId, applicationIds, newStatus, remarks)
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

// Valid admin status transitions
const ADMIN_TRANSITIONS = {
    pending: ['under_review', 'shortlisted', 'rejected'],
    under_review: ['shortlisted', 'rejected'],
    shortlisted: ['selected', 'rejected'],
    selected: ['offered', 'rejected'],
    offered: ['rejected'],
    rejected: [],     // terminal from admin side
    withdrawn: [],    // student-initiated, terminal
};

// ============================================================================
// HELPER — Verify job exists and belongs to college
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_status, c.company_name
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
// HELPER — Verify application exists and belongs to college
// ============================================================================

async function verifyApplication(applicationId, collegeId) {
    const result = await query(
        `SELECT a.*,
                j.job_title, j.job_status, j.application_deadline,
                c.company_name,
                s.first_name, s.last_name, s.student_email,
                s.student_status,
                d.dept_name,
                p.position_name,
                sai.roll_number, sai.enrollment_number
         FROM student_applications a
         JOIN job_postings j ON a.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         JOIN students s ON a.student_id = s.student_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN job_positions p ON a.position_id = p.position_id
         LEFT JOIN student_academic_information sai ON s.student_id = sai.student_id
         WHERE a.application_id = $1 AND a.college_id = $2
         LIMIT 1`,
        [applicationId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.APPLICATION_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Format application for list view
// ============================================================================

function formatApplicationListItem(row) {
    return {
        application_id: row.application_id,
        student_id: row.student_id,
        job_id: row.job_id,
        position_id: row.position_id,
        application_status: row.application_status,
        current_round_id: row.current_round_id,
        is_eligible: row.is_eligible,
        eligibility_remarks: row.eligibility_remarks ?? null,
        applied_at: row.applied_at,
        last_updated_at: row.last_updated_at,
        // Student info
        student_name: `${row.first_name} ${row.last_name}`,
        student_email: row.student_email,
        roll_number: row.roll_number ?? null,
        enrollment_number: row.enrollment_number ?? null,
        dept_name: row.dept_name ?? null,
        // Position info
        position_name: row.position_name ?? null,
    };
}

// ============================================================================
// HELPER — Format application for detail view
// ============================================================================

function formatApplicationDetail(row) {
    return {
        application_id: row.application_id,
        student_id: row.student_id,
        job_id: row.job_id,
        position_id: row.position_id,
        application_status: row.application_status,
        current_round_id: row.current_round_id,
        is_eligible: row.is_eligible,
        eligibility_remarks: row.eligibility_remarks ?? null,
        applied_at: row.applied_at,
        last_updated_at: row.last_updated_at,
        // Job info
        job_title: row.job_title,
        job_status: row.job_status,
        application_deadline: row.application_deadline,
        company_name: row.company_name,
        // Student info
        student_name: `${row.first_name} ${row.last_name}`,
        student_email: row.student_email,
        roll_number: row.roll_number ?? null,
        enrollment_number: row.enrollment_number ?? null,
        student_status: row.student_status,
        dept_name: row.dept_name ?? null,
        // Position info
        position_name: row.position_name ?? null,
    };
}

// ============================================================================
// 1. GET JOB APPLICATIONS (paginated, filtered, sorted)
// ============================================================================

/**
 * List all applications for a job with filtering, search, and sorting.
 *
 * Filters: application_status, is_eligible, position_id, search, date range
 * Sort: applied_at, last_updated_at, student_name, application_status
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} filters
 * @returns {{ applications, total, page, limit, status_summary }}
 */
async function getJobApplications(jobId, collegeId, filters = {}) {
    // 1. Verify job exists and belongs to college
    const job = await verifyJob(jobId, collegeId);

    const { page, limit, offset } = getPagination(filters);

    // 2. Build WHERE conditions
    const conditions = ['a.job_id = $1', 'a.college_id = $2'];
    const params = [jobId, collegeId];
    let paramIndex = 3;

    if (filters.application_status) {
        conditions.push(`a.application_status = $${paramIndex}`);
        params.push(filters.application_status);
        paramIndex++;
    }

    if (filters.is_eligible !== undefined && filters.is_eligible !== '') {
        conditions.push(`a.is_eligible = $${paramIndex}`);
        params.push(filters.is_eligible === 'true');
        paramIndex++;
    }

    if (filters.position_id) {
        conditions.push(`a.position_id = $${paramIndex}`);
        params.push(filters.position_id);
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.student_email ILIKE $${paramIndex} OR sai.roll_number ILIKE $${paramIndex} OR sai.enrollment_number ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    if (filters.applied_after) {
        conditions.push(`a.applied_at >= $${paramIndex}`);
        params.push(filters.applied_after);
        paramIndex++;
    }

    if (filters.applied_before) {
        conditions.push(`a.applied_at <= $${paramIndex}`);
        params.push(filters.applied_before);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // 3. Sortable columns
    const SORTABLE = {
        applied_at: 'a.applied_at',
        last_updated_at: 'a.last_updated_at',
        student_name: 's.first_name',
        application_status: 'a.application_status',
    };
    const sortCol = SORTABLE[filters.sort_by] || 'a.applied_at';
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // 4. Count query
    const countResult = await query(
        `SELECT COUNT(*) AS total
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         LEFT JOIN student_academic_information sai ON s.student_id = sai.student_id
         WHERE ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // 5. Fetch applications with student + position info
    const appResult = await query(
        `SELECT a.*,
                s.first_name, s.last_name, s.student_email,
                d.dept_name,
                p.position_name,
                sai.roll_number, sai.enrollment_number
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN job_positions p ON a.position_id = p.position_id
         LEFT JOIN student_academic_information sai ON s.student_id = sai.student_id
         WHERE ${whereClause}
         ORDER BY ${sortCol} ${sortOrd}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
    );

    // 6. Status summary (all statuses for this job, independent of filters)
    const summaryResult = await query(
        `SELECT application_status, COUNT(*) AS cnt
         FROM student_applications
         WHERE job_id = $1 AND college_id = $2
         GROUP BY application_status`,
        [jobId, collegeId]
    );

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
        const count = parseInt(row.cnt, 10);
        statusSummary[row.application_status] = count;
        statusSummary.total += count;
    }

    return {
        applications: appResult.rows.map(formatApplicationListItem),
        total,
        page,
        limit,
        job_title: job.job_title,
        company_name: job.company_name,
        status_summary: statusSummary,
    };
}

// ============================================================================
// 2. GET SINGLE APPLICATION (with answers + round results)
// ============================================================================

/**
 * Get detailed application view with student info, answers, and round results.
 *
 * @param {string} applicationId
 * @param {string} collegeId
 * @returns {Object} Detailed application
 */
async function getApplication(applicationId, collegeId) {
    // 1. Verify and fetch application with full joins
    const app = await verifyApplication(applicationId, collegeId);

    // 2. Fetch application answers (joined with questions)
    const answersResult = await query(
        `SELECT aa.answer_id, aa.question_id,
                aq.question_text, aq.question_type, aq.question_options, aq.is_required, aq.question_order,
                aa.answer_text, aa.answer_options, aa.answer_boolean
         FROM application_answers aa
         JOIN application_questions aq ON aa.question_id = aq.question_id
         WHERE aa.application_id = $1
         ORDER BY aq.question_order ASC`,
        [applicationId]
    );

    // 3. Fetch round results for this application's student and job
    const roundResultsRes = await query(
        `SELECT rr.result_id, rr.round_id, rr.result_status, rr.score, rr.remarks,
                rr.attended, rr.scheduled_at, rr.completed_at,
                jr.round_name, jr.round_number, jr.round_type, jr.round_status
         FROM student_round_results rr
         JOIN job_rounds jr ON rr.round_id = jr.round_id
         WHERE rr.student_id = $1 AND jr.job_id = $2
         ORDER BY jr.round_number ASC`,
        [app.student_id, app.job_id]
    );

    // 4. Fetch student academic info for eligibility review
    const academicResult = await query(
        `SELECT overall_cgpa, total_live_kts, total_dead_kts,
                tenth_percentage, twelfth_percentage, diploma_percentage,
                gap_years, roll_number, enrollment_number
         FROM student_academic_information
         WHERE student_id = $1
         LIMIT 1`,
        [app.student_id]
    );

    return {
        ...formatApplicationDetail(app),
        academic_info: academicResult.rows[0] ?? null,
        answers: answersResult.rows.map(row => ({
            answer_id: row.answer_id,
            question_id: row.question_id,
            question_text: row.question_text,
            question_type: row.question_type,
            question_options: row.question_options,
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
            round_type: row.round_type,
            round_status: row.round_status,
            result_status: row.result_status,
            score: row.score !== null ? parseFloat(row.score) : null,
            remarks: row.remarks ?? null,
            attended: row.attended,
            scheduled_at: row.scheduled_at ?? null,
            completed_at: row.completed_at ?? null,
        })),
    };
}

// ============================================================================
// 3. UPDATE APPLICATION STATUS (single)
// ============================================================================

/**
 * Change application status with transition rules.
 * Admin can set: under_review, shortlisted, rejected, selected, offered
 * Cannot change withdrawn applications.
 *
 * @param {string} applicationId
 * @param {string} collegeId
 * @param {string} newStatus
 * @param {string|null} remarks
 * @returns {Object} Updated application
 */
async function updateApplicationStatus(applicationId, collegeId, newStatus, remarks = null) {
    // 1. Verify application
    const existing = await verifyApplication(applicationId, collegeId);
    const currentStatus = existing.application_status;

    // 2. Same status check
    if (currentStatus === newStatus) {
        throw Object.assign(
            new Error(`Application is already "${newStatus}"`),
            { status: 400 }
        );
    }

    // 3. Validate transition
    const allowedTransitions = ADMIN_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTransitions.includes(newStatus)) {
        throw Object.assign(
            new Error(
                `Cannot change application status from "${currentStatus}" to "${newStatus}". ` +
                `Allowed transitions: ${allowedTransitions.length ? allowedTransitions.join(', ') : 'none (terminal state)'}`
            ),
            { status: 400 }
        );
    }

    // 4. Update
    const result = await query(
        `UPDATE student_applications
         SET application_status = $1, eligibility_remarks = COALESCE($2, eligibility_remarks), last_updated_at = NOW()
         WHERE application_id = $3
         RETURNING *`,
        [newStatus, remarks, applicationId]
    );

    logger.info(`${LOG.AUTH} Application status updated`, {
        applicationId,
        previousStatus: currentStatus,
        newStatus,
        studentId: existing.student_id,
        jobId: existing.job_id,
        collegeId,
    });

    return {
        application_id: result.rows[0].application_id,
        application_status: result.rows[0].application_status,
        eligibility_remarks: result.rows[0].eligibility_remarks,
        last_updated_at: result.rows[0].last_updated_at,
        student_name: `${existing.first_name} ${existing.last_name}`,
        job_title: existing.job_title,
        company_name: existing.company_name,
        previous_status: currentStatus,
    };
}

// ============================================================================
// 4. BULK UPDATE APPLICATION STATUS
// ============================================================================

/**
 * Bulk update application statuses (max 100 at once).
 * Validates each application, skips invalid transitions, reports results.
 *
 * @param {string} collegeId
 * @param {string[]} applicationIds
 * @param {string} newStatus
 * @param {string|null} remarks
 * @returns {{ updated, skipped, errors }}
 */
async function bulkUpdateApplicationStatus(collegeId, applicationIds, newStatus, remarks = null) {
    // Remove duplicates
    const uniqueIds = [...new Set(applicationIds)];

    // Fetch all applications in one query
    const appsResult = await query(
        `SELECT a.application_id, a.application_status, a.student_id, a.job_id,
                s.first_name, s.last_name
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         WHERE a.application_id = ANY($1) AND a.college_id = $2`,
        [uniqueIds, collegeId]
    );

    const appsMap = new Map();
    for (const row of appsResult.rows) {
        appsMap.set(row.application_id, row);
    }

    const updated = [];
    const skipped = [];
    const errors = [];

    // Categorize each application
    for (const appId of uniqueIds) {
        const app = appsMap.get(appId);

        if (!app) {
            errors.push({ application_id: appId, reason: 'Application not found or unauthorized' });
            continue;
        }

        if (app.application_status === newStatus) {
            skipped.push({
                application_id: appId,
                student_name: `${app.first_name} ${app.last_name}`,
                reason: `Already "${newStatus}"`,
            });
            continue;
        }

        const allowedTransitions = ADMIN_TRANSITIONS[app.application_status] ?? [];
        if (!allowedTransitions.includes(newStatus)) {
            skipped.push({
                application_id: appId,
                student_name: `${app.first_name} ${app.last_name}`,
                current_status: app.application_status,
                reason: `Cannot transition from "${app.application_status}" to "${newStatus}"`,
            });
            continue;
        }

        updated.push(appId);
    }

    // Perform bulk update in a single query for valid applications
    if (updated.length > 0) {
        await query(
            `UPDATE student_applications
             SET application_status = $1,
                 eligibility_remarks = COALESCE($2, eligibility_remarks),
                 last_updated_at = NOW()
             WHERE application_id = ANY($3)`,
            [newStatus, remarks, updated]
        );

        logger.info(`${LOG.AUTH} Bulk application status update`, {
            newStatus,
            updatedCount: updated.length,
            skippedCount: skipped.length,
            errorCount: errors.length,
            collegeId,
        });
    }

    return {
        new_status: newStatus,
        summary: {
            total_requested: uniqueIds.length,
            updated: updated.length,
            skipped: skipped.length,
            errors: errors.length,
        },
        updated_ids: updated,
        skipped,
        errors,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getJobApplications,
    getApplication,
    updateApplicationStatus,
    bulkUpdateApplicationStatus,
};
