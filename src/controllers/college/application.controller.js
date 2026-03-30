/**
 * ============================================================================
 * APPLICATION MANAGEMENT CONTROLLER — College-Side Application Handlers
 * ============================================================================
 *   GET   /api/college/get_job_applications/:jobId
 *   GET   /api/college/get_application/:applicationId
 *   PATCH /api/college/update_application_status/:applicationId
 *   POST  /api/college/bulk_update_application_status
 * ============================================================================
 */

const appService = require('../../services/college/application.service');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// 1. GET JOB APPLICATIONS
// ============================================================================

async function getJobApplications(req, res) {
    try {
        const { applications, total, page, limit, job_title, company_name, status_summary } =
            await appService.getJobApplications(
                req.params.jobId,
                req.user.college_id,
                req.validated
            );

        return sendPaginated(
            res,
            { applications, job_title, company_name, status_summary },
            total,
            { page, limit },
            SUCCESS_MESSAGES.JOB_APPLICATIONS_RETRIEVED
        );
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET SINGLE APPLICATION
// ============================================================================

async function getApplication(req, res) {
    try {
        const result = await appService.getApplication(
            req.params.applicationId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.APPLICATION_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. UPDATE APPLICATION STATUS
// ============================================================================

async function updateApplicationStatus(req, res) {
    try {
        const { application_status, remarks } = req.validated;

        const result = await appService.updateApplicationStatus(
            req.params.applicationId,
            req.user.college_id,
            application_status,
            remarks ?? null
        );

        const statusMessages = {
            under_review: SUCCESS_MESSAGES.APPLICATION_UNDER_REVIEW,
            shortlisted: SUCCESS_MESSAGES.APPLICATION_SHORTLISTED,
            rejected: SUCCESS_MESSAGES.APPLICATION_REJECTED,
            selected: SUCCESS_MESSAGES.CANDIDATE_SELECTED,
            offered: SUCCESS_MESSAGES.OFFER_EXTENDED,
        };

        return sendSuccess(
            res,
            result,
            statusMessages[application_status] ?? SUCCESS_MESSAGES.APPLICATION_STATUS_UPDATED
        );
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. BULK UPDATE APPLICATION STATUS
// ============================================================================

async function bulkUpdateApplicationStatus(req, res) {
    try {
        const { application_ids, application_status, remarks } = req.validated;

        const result = await appService.bulkUpdateApplicationStatus(
            req.user.college_id,
            application_ids,
            application_status,
            remarks ?? null
        );

        return sendSuccess(res, result, `${SUCCESS_MESSAGES.BULK_UPDATE_COMPLETE}: ${result.summary.updated} updated, ${result.summary.skipped} skipped`);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
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
