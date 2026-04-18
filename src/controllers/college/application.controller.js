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
const { promoteFromWaitlist } = require('../../utils/waitlistPromoter');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
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

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.APPLICATION,
            resourceId: req.params.applicationId,
            summary: `Changed application status to "${application_status}"`,
            newValue: { application_status, remarks: remarks ?? null },
            ipAddress: getClientIp(req),
        });

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

        // Build change details from per-application transitions
        const oldStatuses = (result.transitions || []).map(t => `${t.student_name}: ${t.old_status}`);
        const oldValue = oldStatuses.length > 0 ? { application_status: oldStatuses.length === 1 ? oldStatuses[0] : oldStatuses } : null;
        const newValue = result.summary?.updated > 0 ? { application_status, remarks: remarks ?? null } : null;

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.BULK_UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.APPLICATION,
            summary: `Bulk updated ${result.summary?.updated ?? application_ids.length} applications to "${application_status}"`,
            oldValue,
            newValue,
            metadata: { ...result.summary, application_status },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, `${SUCCESS_MESSAGES.BULK_UPDATE_COMPLETE}: ${result.summary.updated} updated, ${result.summary.skipped} skipped`);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 5. SET WAITLIST RANKS
// ============================================================================

async function setWaitlist(req, res) {
    try {
        const { rankings } = req.validated;

        const result = await appService.setWaitlist(
            req.params.jobId,
            req.user.college_id,
            rankings
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.APPLICATION,
            summary: `Assigned waitlist ranks for ${result.summary.updated} applications`,
            metadata: result.summary,
            ipAddress: getClientIp(req),
        });

        return sendSuccess(
            res,
            result,
            `Waitlist updated: ${result.summary.updated} ranked, ${result.summary.skipped} skipped`
        );
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 6. GET WAITLISTED APPLICATIONS
// ============================================================================

async function getWaitlistedApplications(req, res) {
    try {
        const result = await appService.getWaitlistedApplications(
            req.params.jobId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.JOB_APPLICATIONS_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 7. MANUAL PROMOTE FROM WAITLIST
// ============================================================================

async function manualPromoteWaitlist(req, res) {
    try {
        const result = await promoteFromWaitlist(
            req.params.jobId,
            req.user.college_id
        );

        if (!result.promoted) {
            return sendSuccess(res, result, 'No waitlisted candidates to promote');
        }

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.APPLICATION,
            resourceId: result.application_id,
            summary: 'Manual waitlist promotion — rank #1 promoted to selected',
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, 'Waitlisted candidate promoted to selected');
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
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
    setWaitlist,
    getWaitlistedApplications,
    manualPromoteWaitlist,
};
