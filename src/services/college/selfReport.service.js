/**
 * ============================================================================
 * COLLEGE SELF-REPORT REVIEW SERVICE — Admin Review of Student Self-Reports
 * ============================================================================
 * Endpoints:
 *   getPendingSelfReports(collegeId, filters)
 *   getSelfReportById(reportId, collegeId)
 *   reviewSelfReport(reportId, collegeId, adminId, adminName, action, data)
 *   getSelfReportStats(collegeId, passoutYear)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    STATUS,
    ERROR_MESSAGES,
} = require('../../config/constants');
const { recordExternalPlacement } = require('./externalPlacement.service');
const { notifyStudents } = require('../../utils/placementNotifier');
const { getPagination } = require('../../utils/pagination');
const { resolveFileUrls, BUCKETS } = require('../../utils/storageHelper');
const { cleanupOldFile } = require('../../utils/fileCleanupHelper');

// ============================================================================
// 1. LIST SELF-REPORTS (admin queue — paginated, searchable)
// ============================================================================

async function getPendingSelfReports(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['srp.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.verification_status) {
        conditions.push(`srp.verification_status = $${paramIndex}`);
        params.push(filters.verification_status);
        paramIndex++;
    }

    if (filters.passout_year) {
        conditions.push(`srp.passout_year = $${paramIndex}`);
        params.push(filters.passout_year);
        paramIndex++;
    }

    if (filters.search) {
        const escapedSearch = filters.search.replaceAll(/[%_\\]/g, String.raw`\$&`);
        conditions.push(
            `(s.first_name ILIKE $${paramIndex}
              OR s.last_name ILIKE $${paramIndex}
              OR srp.form_data->>'company_name' ILIKE $${paramIndex}
              OR srp.form_data->>'job_title' ILIKE $${paramIndex})`
        );
        params.push(`%${escapedSearch}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const [countResult, dataResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM self_reported_placements srp
             JOIN students s ON srp.student_id = s.student_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT srp.report_id, srp.student_id, srp.college_id,
                    srp.form_data, srp.offer_letter_url,
                    srp.passout_year, srp.verification_status,
                    srp.created_at,
                    s.first_name AS student_first_name,
                    s.last_name AS student_last_name,
                    s.student_email,
                    d.dept_name
             FROM self_reported_placements srp
             JOIN students s ON srp.student_id = s.student_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY srp.created_at DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);
    const reports = dataResult.rows;

    await resolveFileUrls(reports, [
        { field: 'offer_letter_url', bucket: BUCKETS.PRIVATE },
    ]);

    return { reports, total, page, limit };
}

// ============================================================================
// 2. GET SINGLE SELF-REPORT (admin view — includes student + existing placements)
// ============================================================================

async function getSelfReportById(reportId, collegeId) {
    const result = await query(
        `SELECT srp.report_id, srp.student_id, srp.college_id,
                srp.form_data, srp.offer_letter_url,
                srp.passout_year, srp.verification_status,
                srp.rejection_reason, srp.reviewed_by, srp.reviewed_at,
                srp.resulting_placement_id,
                srp.created_at, srp.updated_at,
                s.first_name AS student_first_name,
                s.last_name AS student_last_name,
                s.student_email,
                s.student_passout_year,
                d.dept_name,
                u.user_name AS reviewer_name
         FROM self_reported_placements srp
         JOIN students s ON srp.student_id = s.student_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN users u ON srp.reviewed_by = u.user_id
         WHERE srp.report_id = $1 AND srp.college_id = $2
         LIMIT 1`,
        [reportId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.SELF_REPORT_NOT_FOUND), { status: 404 });
    }

    const report = result.rows[0];

    // Resolve offer letter URL
    await resolveFileUrls([report], [
        { field: 'offer_letter_url', bucket: BUCKETS.PRIVATE },
    ]);

    // Fetch student's existing active placements for admin context
    const existingPlacements = await query(
        `SELECT c.company_name, pr.placement_type, pr.fulltime_package,
                pr.placement_status
         FROM placement_results pr
         JOIN job_postings jp ON pr.job_id = jp.job_id
         JOIN companies c ON jp.company_id = c.company_id
         WHERE pr.student_id = $1
           AND pr.college_id = $2
           AND pr.placement_status IN ('${STATUS.PLACEMENT.ACCEPTED}', '${STATUS.PLACEMENT.JOINED}')`,
        [report.student_id, collegeId]
    );

    return {
        ...report,
        existing_placements: existingPlacements.rows,
    };
}

// ============================================================================
// 3. REVIEW SELF-REPORT (approve or reject — single entry point)
// ============================================================================

async function reviewSelfReport(reportId, collegeId, adminId, adminName, action, data) {
    if (action === 'reject') {
        return rejectSelfReport(reportId, collegeId, adminId, data.rejection_reason);
    }
    return approveSelfReport(reportId, collegeId, adminId, adminName, data.company_id, data.job_id);
}

// ── APPROVE ─────────────────────────────────────────────────────────────────

async function approveSelfReport(reportId, collegeId, reviewerId, adminName, companyId, jobId) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Fetch the pending report with lock to prevent concurrent approval
        const reportResult = await client.query(
            `SELECT srp.*, s.student_passout_year,
                    s.first_name AS student_first_name,
                    s.last_name AS student_last_name
             FROM self_reported_placements srp
             JOIN students s ON srp.student_id = s.student_id
             WHERE srp.report_id = $1 AND srp.college_id = $2
             FOR UPDATE OF srp
             LIMIT 1`,
            [reportId, collegeId]
        );

        if (!reportResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SELF_REPORT_NOT_FOUND), { status: 404 });
        }

        const report = reportResult.rows[0];

        if (report.verification_status !== STATUS.VERIFICATION.PENDING) {
            throw Object.assign(
                new Error(`Self-report is already ${report.verification_status}`),
                { status: 409 }
            );
        }

        // 2. Validate company_id — must exist and be active in this college
        const companyResult = await client.query(
            `SELECT company_id, company_name FROM companies
             WHERE company_id = $1 AND college_id = $2 AND company_status = '${STATUS.COMPANY.ACTIVE}'
             LIMIT 1`,
            [companyId, collegeId]
        );

        if (!companyResult.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.SELF_REPORT_COMPANY_NOT_ACTIVE),
                { status: 400 }
            );
        }

        const companyName = companyResult.rows[0].company_name;
        const formData = report.form_data;
        const studentName = `${report.student_first_name || ''} ${report.student_last_name || ''}`.trim();

        // 3. Map self-report fields → recordExternalPlacement input
        const placementData = {
            student_id: report.student_id,
            company_id: companyId,
            job_id: jobId ?? null,
            job_title: formData.job_title,
            job_location: formData.job_location ?? 'External',
            job_type: formData.placement_type,
            drive_type: formData.drive_type ?? 'off_campus',
            placement_type: formData.placement_type,
            fulltime_package: formData.fulltime_package ?? null,
            fulltime_designation: formData.fulltime_designation ?? null,
            fulltime_joining_date: formData.fulltime_joining_date ?? null,
            internship_stipend: formData.internship_stipend ?? null,
            internship_duration: formData.internship_duration ?? null,
            internship_start_date: formData.internship_start_date ?? null,
            offer_letter_url: report.offer_letter_url ?? null,
            passout_year: report.passout_year ?? report.student_passout_year,
        };

        // Mark as approved INSIDE the locked transaction to prevent concurrent approvals.
        // If recordExternalPlacement fails, we revert to 'pending'.
        await client.query(
            `UPDATE self_reported_placements
             SET verification_status = '${STATUS.VERIFICATION.APPROVED}',
                 reviewed_by = $1,
                 reviewed_at = NOW()
             WHERE report_id = $2`,
            [reviewerId, reportId]
        );

        await client.query('COMMIT');

        // 4. Call recordExternalPlacement — creates job + application + placement + cascade
        //    Skip offer-capacity check — admin is explicitly approving this self-report
        let result;
        try {
            result = await recordExternalPlacement(collegeId, reviewerId, placementData, { skipOfferCheck: true });
        } catch (placementErr) {
            // Revert approval status if placement recording fails
            await query(
                `UPDATE self_reported_placements
                 SET verification_status = '${STATUS.VERIFICATION.PENDING}',
                     reviewed_by = NULL,
                     reviewed_at = NULL
                 WHERE report_id = $1`,
                [reportId]
            );
            throw placementErr;
        }

        // 5. Link the resulting placement to the self-report
        await query(
            `UPDATE self_reported_placements
             SET resulting_placement_id = $1
             WHERE report_id = $2`,
            [result.placement.placement_id, reportId]
        );

        // 6. Notify the student (fire-and-forget)
        notifyStudents({ query }, collegeId, [{
            student_id: report.student_id,
            title: 'Self-Report Approved',
            body: `Your off-campus placement at ${companyName} has been verified!`,
            notification_type: STATUS.NOTIFICATION_TYPE.SELF_REPORT_APPROVED,
            entity_type: 'self_report',
            entity_id: reportId,
        }]).catch(err => logger.warn(`${LOG.TRANSACTION} Self-report approve notification failed`, { error: err.message }));

        logger.info(`${LOG.TRANSACTION} Self-report approved`, {
            reportId,
            placementId: result.placement.placement_id,
            studentId: report.student_id,
            companyName,
            reviewerId,
            collegeId,
        });

        return {
            report_id: reportId,
            student_name: studentName,
            company_name: companyName,
            placement: result.placement,
            auto_withdrawal: result.auto_withdrawal,
        };
    } catch (err) {
        // Rollback only if transaction is still open (not yet committed)
        await client.query('ROLLBACK').catch(e => logger.warn(`${LOG.TRANSACTION} ROLLBACK failed`, { error: e.message }));
        throw err;
    } finally {
        client.release();
    }
}

// ── REJECT ──────────────────────────────────────────────────────────────────

async function rejectSelfReport(reportId, collegeId, reviewerId, reason) {
    const result = await query(
        `UPDATE self_reported_placements
         SET verification_status = '${STATUS.VERIFICATION.REJECTED}',
             rejection_reason = $1,
             reviewed_by = $2,
             reviewed_at = NOW()
         WHERE report_id = $3
           AND college_id = $4
           AND verification_status = '${STATUS.VERIFICATION.PENDING}'
         RETURNING report_id, student_id, form_data, offer_letter_url`,
        [reason, reviewerId, reportId, collegeId]
    );

    if (!result.rows.length) {
        const exists = await query(
            `SELECT verification_status FROM self_reported_placements
             WHERE report_id = $1 AND college_id = $2
             LIMIT 1`,
            [reportId, collegeId]
        );

        if (!exists.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SELF_REPORT_NOT_FOUND), { status: 404 });
        }

        throw Object.assign(
            new Error(ERROR_MESSAGES.SELF_REPORT_ALREADY_REVIEWED),
            { status: 409 }
        );
    }

    const rejected = result.rows[0];
    const companyName = rejected.form_data?.company_name || 'Unknown';

    // Fetch student name for return value
    const studentResult = await query(
        `SELECT first_name, last_name FROM students WHERE student_id = $1 LIMIT 1`,
        [rejected.student_id]
    );
    const studentName = studentResult.rows[0]
        ? `${studentResult.rows[0].first_name || ''} ${studentResult.rows[0].last_name || ''}`.trim()
        : 'Unknown';

    // Cleanup offer letter from storage (fire-and-forget)
    if (rejected.offer_letter_url) {
        cleanupOldFile(BUCKETS.PRIVATE, rejected.offer_letter_url, null)
            .catch(err => logger.warn(`${LOG.TRANSACTION} Self-report reject file cleanup failed`, { reportId, error: err.message }));
    }

    // Notify the student (fire-and-forget)
    notifyStudents({ query }, collegeId, [{
        student_id: rejected.student_id,
        title: 'Self-Report Rejected',
        body: `Your off-campus placement report for ${companyName} was not approved. Reason: ${reason}`,
        notification_type: STATUS.NOTIFICATION_TYPE.SELF_REPORT_REJECTED,
        entity_type: 'self_report',
        entity_id: reportId,
    }]).catch(err => logger.warn(`${LOG.TRANSACTION} Self-report reject notification failed`, { error: err.message }));

    logger.info(`${LOG.TRANSACTION} Self-report rejected`, {
        reportId,
        studentId: rejected.student_id,
        companyName,
        reason,
        reviewerId,
        collegeId,
    });

    return {
        report_id: reportId,
        student_name: studentName,
        company_name: companyName,
    };
}

// ============================================================================
// 4. SELF-REPORT STATS
// ============================================================================

async function getSelfReportStats(collegeId, passoutYear) {
    const result = await query(
        `SELECT
             COUNT(*) FILTER (WHERE verification_status = '${STATUS.VERIFICATION.PENDING}')::int  AS pending,
             COUNT(*) FILTER (WHERE verification_status = '${STATUS.VERIFICATION.APPROVED}')::int AS approved,
             COUNT(*) FILTER (WHERE verification_status = '${STATUS.VERIFICATION.REJECTED}')::int AS rejected
         FROM self_reported_placements
         WHERE college_id = $1 AND passout_year = $2`,
        [collegeId, passoutYear]
    );

    return result.rows[0] || { pending: 0, approved: 0, rejected: 0 };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getPendingSelfReports,
    getSelfReportById,
    reviewSelfReport,
    getSelfReportStats,
};
