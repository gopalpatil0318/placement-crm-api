/**
 * ============================================================================
 * STUDENT SELF-REPORT SERVICE — Off-Campus Placement Self-Reporting
 * ============================================================================
 * Endpoints:
 *   submitSelfReport(studentId, collegeId, passoutYear, data)
 *   getMySelfReports(studentId, collegeId, { page, limit })
 *   cancelSelfReport(reportId, studentId, collegeId)
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    STATUS,
    ERROR_MESSAGES,
} = require('../../config/constants');
const { notifyAdmins } = require('../../utils/placementNotifier');
const { getPagination } = require('../../utils/pagination');
const { resolveFileUrls, BUCKETS } = require('../../utils/storageHelper');
const { cleanupOldFile } = require('../../utils/fileCleanupHelper');

// ============================================================================
// 1. SUBMIT SELF-REPORT
// ============================================================================

/** Validate student + check duplicates + offer capacity before submit */
async function validateSubmission(studentId, collegeId, passoutYear, companyName, jobTitle, companyId) {
    // Verify student is active
    const studentResult = await query(
        `SELECT student_status, first_name, last_name FROM students
         WHERE student_id = $1 AND college_id = $2 LIMIT 1`,
        [studentId, collegeId]
    );

    if (!studentResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const student = studentResult.rows[0];

    if (student.student_status !== STATUS.ACTIVE) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.SELF_REPORT_ONLY_ACTIVE_STUDENTS),
            { status: 403 }
        );
    }

    // Check duplicate (same company + job title, not rejected)
    const escapeLike = (str) => str.replaceAll(/[%_\\]/g, String.raw`\$&`);
    const dupResult = await query(
        `SELECT 1 FROM self_reported_placements
         WHERE student_id = $1
           AND college_id = $2
           AND form_data->>'company_name' ILIKE $3
           AND form_data->>'job_title' ILIKE $4
           AND verification_status != '${STATUS.VERIFICATION.REJECTED}'
         LIMIT 1`,
        [studentId, collegeId, escapeLike(companyName), escapeLike(jobTitle)]
    );

    if (dupResult.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.SELF_REPORT_DUPLICATE),
            { status: 409 }
        );
    }

    // Self-reports are just student submissions — policy enforcement happens at
    // admin approval time, so we skip the offer-capacity check here.

    // Verify company if provided
    if (companyId) {
        const companyResult = await query(
            `SELECT 1 FROM companies
             WHERE company_id = $1 AND college_id = $2 AND company_status = '${STATUS.COMPANY.ACTIVE}'
             LIMIT 1`,
            [companyId, collegeId]
        );

        if (!companyResult.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.SELF_REPORT_COMPANY_NOT_FOUND),
                { status: 400 }
            );
        }
    }

    return student;
}

async function submitSelfReport(studentId, collegeId, passoutYear, data) {
    const {
        company_id,
        company_name,
        job_id,
        job_title,
        placement_type,
        drive_type,
        fulltime_package,
        fulltime_designation,
        fulltime_joining_date,
        internship_stipend,
        internship_duration,
        internship_start_date,
        job_location,
        offer_date,
        offer_letter_url,
        remarks,
    } = data;

    const student = await validateSubmission(studentId, collegeId, passoutYear, company_name, job_title, company_id);

    // Build JSONB form_data (all form fields except offer_letter_url)
    const formData = {
        company_name,
        ...(company_id && { company_id }),
        ...(job_id && { job_id }),
        job_title,
        placement_type,
        drive_type: drive_type ?? 'off_campus',
        ...(fulltime_package !== null && fulltime_package !== undefined && { fulltime_package }),
        ...(fulltime_designation && { fulltime_designation }),
        ...(fulltime_joining_date && { fulltime_joining_date }),
        ...(internship_stipend !== null && internship_stipend !== undefined && { internship_stipend }),
        ...(internship_duration && { internship_duration }),
        ...(internship_start_date && { internship_start_date }),
        ...(job_location && { job_location }),
        ...(offer_date && { offer_date }),
        ...(remarks && { remarks }),
    };

    // Insert the self-report row
    const result = await query(
        `INSERT INTO self_reported_placements
            (student_id, college_id, form_data, offer_letter_url, passout_year,
             verification_status)
         VALUES ($1, $2, $3, $4, $5, '${STATUS.VERIFICATION.PENDING}')
         RETURNING report_id, student_id, college_id, form_data,
                   offer_letter_url, passout_year, verification_status,
                   created_at, updated_at`,
        [studentId, collegeId, JSON.stringify(formData), offer_letter_url ?? null, passoutYear]
    );

    const report = result.rows[0];

    // Notify college admins (fire-and-forget)
    const studentFullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'A student';

    notifyAdmins({ query }, collegeId, {
        title: 'New Off-Campus Placement Report',
        body: `${studentFullName} reported placement at ${company_name}`,
        notification_type: STATUS.NOTIFICATION_TYPE.SELF_REPORT_SUBMITTED,
        entity_type: 'self_report',
        entity_id: report.report_id,
    }).catch(err => logger.warn(`${LOG.TRANSACTION} Self-report notify admins failed`, { error: err.message }));

    logger.info(`${LOG.TRANSACTION} Self-report submitted`, {
        reportId: report.report_id,
        studentId,
        collegeId,
        companyName: company_name,
        jobTitle: job_title,
    });

    return report;
}

// ============================================================================
// 2. GET MY SELF-REPORTS (paginated)
// ============================================================================

async function getMySelfReports(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const [countResult, dataResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM self_reported_placements
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
        query(
            `SELECT srp.report_id, srp.student_id, srp.college_id,
                    srp.form_data, srp.offer_letter_url,
                    srp.passout_year, srp.verification_status,
                    srp.rejection_reason, srp.reviewed_at,
                    srp.resulting_placement_id,
                    srp.created_at, srp.updated_at,
                    u.user_name AS reviewer_name,
                    -- Join placement info when approved
                    c.company_name AS placement_company_name,
                    pr.placement_status
             FROM self_reported_placements srp
             LEFT JOIN users u ON srp.reviewed_by = u.user_id
             LEFT JOIN placement_results pr ON srp.resulting_placement_id = pr.placement_id
             LEFT JOIN job_postings jp ON pr.job_id = jp.job_id
             LEFT JOIN companies c ON jp.company_id = c.company_id
             WHERE srp.student_id = $1 AND srp.college_id = $2
             ORDER BY srp.created_at DESC
             LIMIT $3 OFFSET $4`,
            [studentId, collegeId, limit, offset]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);
    const reports = dataResult.rows;

    // Resolve offer letter URLs
    await resolveFileUrls(reports, [
        { field: 'offer_letter_url', bucket: BUCKETS.PRIVATE },
    ]);

    return { reports, total, page, limit };
}

// ============================================================================
// 3. CANCEL SELF-REPORT (student can cancel own pending report)
// ============================================================================

async function cancelSelfReport(reportId, studentId, collegeId) {
    // Atomic delete — only succeeds if status is still 'pending'
    const result = await query(
        `DELETE FROM self_reported_placements
         WHERE report_id = $1
           AND student_id = $2
           AND college_id = $3
           AND verification_status = '${STATUS.VERIFICATION.PENDING}'
         RETURNING report_id, offer_letter_url`,
        [reportId, studentId, collegeId]
    );

    if (!result.rows.length) {
        // Check whether it exists at all (wrong owner vs already reviewed)
        const exists = await query(
            `SELECT verification_status FROM self_reported_placements
             WHERE report_id = $1 AND student_id = $2 AND college_id = $3
             LIMIT 1`,
            [reportId, studentId, collegeId]
        );

        if (!exists.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SELF_REPORT_NOT_FOUND), { status: 404 });
        }

        throw Object.assign(
            new Error(ERROR_MESSAGES.SELF_REPORT_CANCEL_PENDING_ONLY),
            { status: 400 }
        );
    }

    const deleted = result.rows[0];

    // Cleanup offer letter file if present (fire-and-forget)
    if (deleted.offer_letter_url) {
        cleanupOldFile(BUCKETS.PRIVATE, deleted.offer_letter_url, null)
            .catch(err => logger.warn(`${LOG.TRANSACTION} Self-report file cleanup failed`, { reportId, error: err.message }));
    }

    logger.info(`${LOG.TRANSACTION} Self-report cancelled by student`, {
        reportId,
        studentId,
        collegeId,
    });

    return { report_id: reportId };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    submitSelfReport,
    getMySelfReports,
    cancelSelfReport,
};
