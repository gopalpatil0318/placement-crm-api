/**
 * ============================================================================
 * COLLEGE SELF-REPORT REVIEW CONTROLLER — Admin Review Route Handlers
 * ============================================================================
 * Endpoints:
 *   GET   /api/college/self-reports                        — List reports queue
 *   GET   /api/college/self-reports/stats                  — Stats by passout year
 *   GET   /api/college/self-reports/:reportId              — Get single report
 *   PATCH /api/college/self-reports/:reportId/review       — Approve or reject
 * ============================================================================
 */

const selfReportService = require('../../services/college/selfReport.service');
const { sendSuccess, sendPaginated, sendError } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    HTTP_STATUS,
    LOG,
    ERROR_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

// ============================================================================
// 1. LIST SELF-REPORTS (admin queue)
// ============================================================================

async function getPendingSelfReports(req, res) {
    const { reports, total, page, limit } =
        await selfReportService.getPendingSelfReports(
            req.user.college_id,
            req.validated
        );

    return sendPaginated(
        res,
        { reports },
        total,
        { page, limit },
        'Self-reports retrieved successfully'
    );
}

// ============================================================================
// 2. SELF-REPORT STATS
// ============================================================================

async function getSelfReportStats(req, res) {
    const stats = await selfReportService.getSelfReportStats(
        req.user.college_id,
        req.validated.passout_year
    );

    return sendSuccess(res, { stats }, 'Self-report stats retrieved successfully');
}

// ============================================================================
// 3. GET SINGLE SELF-REPORT
// ============================================================================

async function getSelfReportById(req, res) {
    const report = await selfReportService.getSelfReportById(
        req.params.reportId,
        req.user.college_id
    );

    return sendSuccess(res, { report }, 'Self-report retrieved successfully');
}

// ============================================================================
// 4. REVIEW SELF-REPORT (approve or reject — single endpoint)
// ============================================================================

async function reviewSelfReport(req, res) {
    const startTime = Date.now();
    const { reportId } = req.params;
    const { action, company_id, job_id, rejection_reason } = req.validated;

    logger.info(`${LOG.API_START} PATCH /api/college/self-reports/${reportId}/review`, {
        user_id: req.user.id,
        college_id: req.user.college_id,
        action,
    });

    try {
        const result = await selfReportService.reviewSelfReport(
            reportId,
            req.user.college_id,
            req.user.id,
            req.user.name,
            action,
            { company_id, job_id, rejection_reason }
        );

        // Audit log
        const isApprove = action === 'approve';
        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.SELF_REPORT,
            resourceId: reportId,
            summary: isApprove
                ? `Approved self-report for ${result.student_name} at ${result.company_name}`
                : `Rejected self-report for ${result.student_name} at ${result.company_name}`,
            newValue: isApprove
                ? { verification_status: 'approved', placement_id: result.placement?.placement_id }
                : { verification_status: 'rejected', rejection_reason },
            metadata: isApprove
                ? { resulting_placement_id: result.placement?.placement_id, company_id, approved_by: req.user.name }
                : { rejection_reason, rejected_by: req.user.name },
            ipAddress: getClientIp(req),
        });

        const duration = Date.now() - startTime;
        logger.info(`${LOG.API_END} PATCH /api/college/self-reports/${reportId}/review`, {
            user_id: req.user.id,
            action,
            duration_ms: duration,
        });

        return sendSuccess(
            res,
            result,
            isApprove ? 'Self-report approved and placement recorded' : 'Self-report rejected'
        );
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getPendingSelfReports,
    getSelfReportStats,
    getSelfReportById,
    reviewSelfReport,
};
