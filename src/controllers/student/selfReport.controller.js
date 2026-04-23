/**
 * ============================================================================
 * STUDENT SELF-REPORT CONTROLLER — Off-Campus Placement Self-Reporting
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/self-report          — Submit a self-report
 *   GET    /api/student/self-report           — List own self-reports
 *   DELETE /api/student/self-report/:reportId — Cancel pending report
 * ============================================================================
 */

const selfReportService = require('../../services/student/selfReport.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');

// ============================================================================
// 1. SUBMIT SELF-REPORT
// ============================================================================

async function submitSelfReport(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/self-report`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const report = await selfReportService.submitSelfReport(
        req.user.id,
        req.user.college_id,
        req.user.passout_year,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/self-report`, {
        student_id: req.user.id,
        report_id: report.report_id,
        duration_ms: duration,
    });

    return sendCreated(res, { report }, 'Self-report submitted successfully');
}

// ============================================================================
// 2. LIST MY SELF-REPORTS
// ============================================================================

async function getMySelfReports(req, res) {
    const { reports, total, page, limit } =
        await selfReportService.getMySelfReports(
            req.user.id,
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
// 3. CANCEL SELF-REPORT
// ============================================================================

async function cancelSelfReport(req, res) {
    const startTime = Date.now();
    const { reportId } = req.params;

    logger.info(`${LOG.API_START} DELETE /api/student/self-report/${reportId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await selfReportService.cancelSelfReport(
        reportId,
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} DELETE /api/student/self-report/${reportId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Self-report cancelled successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    submitSelfReport,
    getMySelfReports,
    cancelSelfReport,
};
