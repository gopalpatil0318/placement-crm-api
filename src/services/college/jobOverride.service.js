/**
 * ============================================================================
 * COLLEGE JOB OVERRIDE SERVICE — Override Request Management (TPO / COLLEGEADMIN / TPC)
 * ============================================================================
 *   - getJobOverrideRequests(jobId, collegeId, filters)
 *   - getAllOverrideRequests(collegeId, filters)
 *   - reviewOverrideRequest(overrideId, collegeId, userId, data)
 *   - bulkReviewOverrideRequests(collegeId, userId, data)
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
// HELPER — Verify job exists and belongs to college
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.passout_years, c.company_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         WHERE j.job_id = $1 AND j.college_id = $2 LIMIT 1`,
        [jobId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 1. GET OVERRIDE REQUESTS FOR A SPECIFIC JOB
// ============================================================================

/**
 * All override requests for one job, enriched with student details.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} filters - { status, dept_name, page, limit, sort_by, sort_order }
 * @returns {{ job, requests, total, page, limit }}
 */
async function getJobOverrideRequests(jobId, collegeId, filters = {}) {
    const job = await verifyJob(jobId, collegeId);
    const { page, limit, offset } = getPagination(filters);

    const conditions = [
        'r.job_id = $1',
        'r.college_id = $2',
    ];
    const params = [jobId, collegeId];
    let paramIndex = 3;

    if (filters.status) {
        conditions.push(`r.override_status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
    }

    if (filters.dept_name) {
        conditions.push(`d.dept_name ILIKE $${paramIndex}`);
        params.push(`%${filters.dept_name}%`);
        paramIndex++;
    }

    const SORTABLE = {
        requested_at: 'r.requested_at',
        student_name: 's.first_name',
        dept_name: 'd.dept_name',
        override_status: 'r.override_status',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.requested_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    const whereClause = conditions.join(' AND ');

    const [countResult, rowsResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM job_eligibility_override_requests r
             JOIN students s ON r.student_id = s.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT r.override_id, r.override_status,
                    r.request_reason, r.ineligibility_reasons,
                    r.review_notes, r.rejection_reason,
                    r.requested_at, r.reviewed_at,
                    s.student_id,
                    s.first_name || ' ' || s.last_name AS student_name,
                    s.student_email, s.student_passout_year,
                    d.dept_name,
                    acad.overall_cgpa, acad.total_live_kts,
                    u.user_name AS reviewed_by_name
             FROM job_eligibility_override_requests r
             JOIN students s ON r.student_id = s.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             LEFT JOIN student_academic_information acad ON s.student_id = acad.student_id
             LEFT JOIN users u ON r.reviewed_by = u.user_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        // Summary counts for this specific job (ignores status filter)
        query(
            `SELECT override_status, COUNT(*) AS cnt
             FROM job_eligibility_override_requests
             WHERE job_id = $1 AND college_id = $2
             GROUP BY override_status`,
            [jobId, collegeId]
        ),
    ]);

    const summary = { pending: 0, approved: 0, rejected: 0 };
    for (const row of summaryResult.rows) {
        summary[row.override_status] = parseInt(row.cnt, 10);
    }

    return {
        job: {
            job_id: job.job_id,
            job_title: job.job_title,
            company_name: job.company_name,
            passout_years: job.passout_years,
        },
        summary,
        requests: rowsResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page,
        limit,
    };
}

// ============================================================================
// 2. GET ALL OVERRIDE REQUESTS (dashboard view across all jobs)
// ============================================================================

/**
 * College-level dashboard of all override requests.
 *
 * @param {string} collegeId
 * @param {Object} filters - { status, job_id, dept_name, passout_year, date_from, date_to, page, limit }
 * @returns {{ requests, total, page, limit, summary }}
 */
async function getAllOverrideRequests(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['r.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.status) {
        conditions.push(`r.override_status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
    }

    if (filters.job_id) {
        conditions.push(`r.job_id = $${paramIndex}`);
        params.push(filters.job_id);
        paramIndex++;
    }

    if (filters.dept_name) {
        conditions.push(`d.dept_name ILIKE $${paramIndex}`);
        params.push(`%${filters.dept_name}%`);
        paramIndex++;
    }

    if (filters.passout_year) {
        conditions.push(`$${paramIndex} = ANY(j.passout_years)`);
        params.push(Number(filters.passout_year));
        paramIndex++;
    }

    if (filters.date_from) {
        conditions.push(`r.requested_at >= $${paramIndex}`);
        params.push(filters.date_from);
        paramIndex++;
    }

    if (filters.date_to) {
        conditions.push(`r.requested_at <= $${paramIndex}`);
        params.push(filters.date_to);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const SORTABLE = {
        requested_at: 'r.requested_at',
        student_name: 's.first_name',
        job_title: 'j.job_title',
        override_status: 'r.override_status',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.requested_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    const [countResult, rowsResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM job_eligibility_override_requests r
             JOIN students s ON r.student_id = s.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             JOIN job_postings j ON r.job_id = j.job_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT r.override_id, r.override_status,
                    r.request_reason, r.ineligibility_reasons,
                    r.rejection_reason, r.requested_at, r.reviewed_at,
                    s.student_id,
                    s.first_name || ' ' || s.last_name AS student_name,
                    s.student_email, s.student_passout_year,
                    d.dept_name,
                    j.job_id, j.job_title, j.passout_years,
                    co.company_name,
                    u.user_name AS reviewed_by_name
             FROM job_eligibility_override_requests r
             JOIN students s ON r.student_id = s.student_id
             JOIN departments d ON s.dept_id = d.dept_id
             JOIN job_postings j ON r.job_id = j.job_id
             JOIN companies co ON j.company_id = co.company_id
             LEFT JOIN users u ON r.reviewed_by = u.user_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        // Summary counts by status — always for this college (ignores other filters)
        query(
            `SELECT override_status, COUNT(*) AS cnt
             FROM job_eligibility_override_requests
             WHERE college_id = $1
             GROUP BY override_status`,
            [collegeId]
        ),
    ]);

    const summary = { pending: 0, approved: 0, rejected: 0 };
    for (const row of summaryResult.rows) {
        summary[row.override_status] = parseInt(row.cnt, 10);
    }

    return {
        requests: rowsResult.rows,
        total: parseInt(countResult.rows[0].total, 10),
        page,
        limit,
        summary,
    };
}

// ============================================================================
// 3. REVIEW OVERRIDE REQUEST (single)
// ============================================================================

/**
 * Approve or reject a single override request.
 * - On approve: student gets notified they can now apply.
 * - On reject: student gets notified with the rejection reason.
 *
 * @param {string} overrideId
 * @param {string} collegeId
 * @param {string} userId - reviewer's user_id
 * @param {Object} data - { action: 'approve'|'reject', review_notes?, rejection_reason? }
 * @returns {Object} Updated override request
 */
async function reviewOverrideRequest(overrideId, collegeId, userId, data) {
    // Fetch the override request
    const overrideResult = await query(
        `SELECT r.*, j.job_title, co.company_name,
                s.first_name || ' ' || s.last_name AS student_name
         FROM job_eligibility_override_requests r
         JOIN job_postings j ON r.job_id = j.job_id
         JOIN companies co ON j.company_id = co.company_id
         JOIN students s ON r.student_id = s.student_id
         WHERE r.override_id = $1 AND r.college_id = $2
         LIMIT 1`,
        [overrideId, collegeId]
    );

    if (!overrideResult.rows.length) {
        throw Object.assign(
            new Error('Override request not found'),
            { status: 404 }
        );
    }

    const override = overrideResult.rows[0];

    if (override.override_status !== 'pending') {
        throw Object.assign(
            new Error(`Override request has already been ${override.override_status}. Cannot review again.`),
            { status: 400 }
        );
    }

    const newStatus = data.action === 'approve' ? 'approved' : 'rejected';

    if (newStatus === 'rejected' && !data.rejection_reason?.trim()) {
        throw Object.assign(
            new Error('Rejection reason is required when rejecting an override request'),
            { status: 400 }
        );
    }

    // Update the override request
    const updateResult = await query(
        `UPDATE job_eligibility_override_requests
         SET override_status = $1,
             reviewed_by = $2,
             review_notes = $3,
             rejection_reason = $4,
             reviewed_at = NOW()
         WHERE override_id = $5
         RETURNING *`,
        [
            newStatus,
            userId,
            data.review_notes?.trim() ?? null,
            newStatus === 'rejected' ? data.rejection_reason.trim() : null,
            overrideId,
        ]
    );

    const updated = updateResult.rows[0];

    // Send notification to student
    const notifTitle = newStatus === 'approved'
        ? `Override Approved: ${override.job_title}`
        : `Override Rejected: ${override.job_title}`;

    const notifBody = newStatus === 'approved'
        ? `Your eligibility override request for ${override.job_title} at ${override.company_name} has been approved. You can now apply for this job.`
        : `Your eligibility override request for ${override.job_title} at ${override.company_name} has been rejected. Reason: ${data.rejection_reason.trim()}`;

    const notifType = newStatus === 'approved'
        ? NOTIFICATION_TYPE.ELIGIBILITY_OVERRIDE_APPROVED
        : NOTIFICATION_TYPE.ELIGIBILITY_OVERRIDE_REJECTED;

    await query(
        `INSERT INTO notifications
            (college_id, recipient_type, recipient_id, title, body,
             notification_type, related_entity_type, related_entity_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            collegeId,
            RECIPIENT_TYPE.STUDENT,
            override.student_id,
            notifTitle,
            notifBody,
            notifType,
            'job',
            override.job_id,
        ]
    );

    logger.info(`${LOG.AUTH} Override request ${newStatus}`, {
        overrideId,
        studentId: override.student_id,
        jobId: override.job_id,
        reviewedBy: userId,
        collegeId,
    });

    return {
        override_id: updated.override_id,
        override_status: updated.override_status,
        reviewed_at: updated.reviewed_at,
        rejection_reason: updated.rejection_reason ?? null,
        review_notes: updated.review_notes ?? null,
        job_title: override.job_title,
        company_name: override.company_name,
        student_name: override.student_name,
    };
}

// ============================================================================
// 4. BULK REVIEW OVERRIDE REQUESTS
// ============================================================================

/**
 * Approve or reject multiple override requests in a single transaction.
 * All requests must belong to this college and be in 'pending' status.
 *
 * @param {string} collegeId
 * @param {string} userId - reviewer's user_id
 * @param {Object} data - { override_ids: [], action, review_notes?, rejection_reason? }
 * @returns {Object} Summary of results
 */
async function bulkReviewOverrideRequests(collegeId, userId, data) {
    const { override_ids, action, review_notes, rejection_reason } = data;

    if (!override_ids || override_ids.length === 0) {
        throw Object.assign(new Error('No override IDs provided'), { status: 400 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    if (newStatus === 'rejected' && !rejection_reason?.trim()) {
        throw Object.assign(
            new Error('Rejection reason is required when bulk-rejecting override requests'),
            { status: 400 }
        );
    }

    // Fetch all matching pending requests in this college
    const fetchResult = await query(
        `SELECT r.override_id, r.student_id, r.job_id, r.override_status,
                j.job_title, co.company_name
         FROM job_eligibility_override_requests r
         JOIN job_postings j ON r.job_id = j.job_id
         JOIN companies co ON j.company_id = co.company_id
         WHERE r.override_id = ANY($1) AND r.college_id = $2`,
        [override_ids, collegeId]
    );

    if (!fetchResult.rows.length) {
        throw Object.assign(
            new Error('No valid override requests found for the provided IDs'),
            { status: 404 }
        );
    }

    const pendingRequests = fetchResult.rows.filter(r => r.override_status === 'pending');
    const alreadyReviewed = fetchResult.rows.filter(r => r.override_status !== 'pending');

    if (pendingRequests.length === 0) {
        throw Object.assign(
            new Error('All specified override requests have already been reviewed'),
            { status: 400 }
        );
    }

    const pendingIds = pendingRequests.map(r => r.override_id);

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Bulk update all pending requests
        await client.query(
            `UPDATE job_eligibility_override_requests
             SET override_status = $1,
                 reviewed_by = $2,
                 review_notes = $3,
                 rejection_reason = $4,
                 reviewed_at = NOW()
             WHERE override_id = ANY($5)`,
            [
                newStatus,
                userId,
                review_notes?.trim() ?? null,
                newStatus === 'rejected' ? rejection_reason.trim() : null,
                pendingIds,
            ]
        );

        // Bulk insert notifications for all affected students
        if (pendingRequests.length > 0) {
            const notifType = newStatus === 'approved'
                ? NOTIFICATION_TYPE.ELIGIBILITY_OVERRIDE_APPROVED
                : NOTIFICATION_TYPE.ELIGIBILITY_OVERRIDE_REJECTED;

            // Build UNNEST arrays for batch insert
            const recipientIds = pendingRequests.map(r => r.student_id);
            const titles = pendingRequests.map(
                r => newStatus === 'approved'
                    ? `Override Approved: ${r.job_title}`
                    : `Override Rejected: ${r.job_title}`
            );
            const bodies = pendingRequests.map(
                r => newStatus === 'approved'
                    ? `Your eligibility override for ${r.job_title} at ${r.company_name} is approved. You can now apply.`
                    : `Your eligibility override for ${r.job_title} at ${r.company_name} was rejected. Reason: ${rejection_reason.trim()}`
            );
            const jobIds = pendingRequests.map(r => r.job_id);

            await client.query(
                `INSERT INTO notifications
                    (college_id, recipient_type, recipient_id, title, body,
                     notification_type, related_entity_type, related_entity_id)
                 SELECT $1, $2,
                        unnest($3::uuid[]),
                        unnest($4::text[]),
                        unnest($5::text[]),
                        $6,
                        'job',
                        unnest($7::uuid[])`,
                [
                    collegeId,
                    RECIPIENT_TYPE.STUDENT,
                    recipientIds,
                    titles,
                    bodies,
                    notifType,
                    jobIds,
                ]
            );
        }

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Bulk override review completed`, {
            action: newStatus,
            processedCount: pendingRequests.length,
            skippedCount: alreadyReviewed.length,
            reviewedBy: userId,
            collegeId,
        });

        return {
            processed: pendingRequests.length,
            skipped: alreadyReviewed.length,
            action: newStatus,
            skipped_ids: alreadyReviewed.map(r => r.override_id),
        };
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`${LOG.TRANSACTION} Bulk override review rolled back`, {
            error: err.message,
            collegeId,
        });
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getJobOverrideRequests,
    getAllOverrideRequests,
    reviewOverrideRequest,
    bulkReviewOverrideRequests,
};
