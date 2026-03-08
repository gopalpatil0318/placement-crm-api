/**
 * ============================================================================
 * ELIGIBLE NOT APPLIED & DENIALS CONTROLLER — Route Handlers
 * ============================================================================
 *   GET  /api/college/get_eligible_not_applied/:jobId  → getEligibleNotApplied
 *   POST /api/college/notify_eligible_students/:jobId  → notifyEligibleStudents
 *   GET  /api/college/get_job_denials/:jobId            → getJobDenials
 * ============================================================================
 */

const service = require('../../services/college/eligibleDenial.service');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// 1. GET ELIGIBLE NOT APPLIED
// ============================================================================

async function getEligibleNotApplied(req, res) {
    try {
        const result = await service.getEligibleNotApplied(
            req.params.jobId,
            req.user.college_id,
            req.validated
        );

        return sendPaginated(
            res,
            {
                job: result.job,
                criteria: result.criteria,
                eligible_not_applied_count: result.eligible_not_applied_count,
                total_applied: result.total_applied,
                students: result.students,
            },
            result.eligible_not_applied_count,
            { page: result.page, limit: result.limit },
            'Eligible students who have not applied retrieved successfully'
        );
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. NOTIFY ELIGIBLE STUDENTS
// ============================================================================

async function notifyEligibleStudents(req, res) {
    try {
        const result = await service.notifyEligibleStudents(
            req.params.jobId,
            req.user.college_id,
            req.user.id,
            req.validated
        );

        return sendCreated(res, result, SUCCESS_MESSAGES.NOTIFICATION_SENT);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET JOB DENIALS
// ============================================================================

async function getJobDenials(req, res) {
    try {
        const result = await service.getJobDenials(
            req.params.jobId,
            req.user.college_id,
            req.validated
        );

        return sendPaginated(
            res,
            {
                job: result.job,
                denials: result.denials,
            },
            result.total,
            { page: result.page, limit: result.limit },
            'Job denials retrieved successfully'
        );
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getEligibleNotApplied,
    notifyEligibleStudents,
    getJobDenials,
};
