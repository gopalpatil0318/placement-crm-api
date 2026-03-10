/**
 * ============================================================================
 * STUDENT JOB OVERRIDE CONTROLLER — Route Handlers
 * ============================================================================
 *   GET  /api/student/check_override_eligibility/:jobId  → checkOverrideEligibility
 *   POST /api/student/request_job_override/:jobId        → requestOverride
 *   GET  /api/student/get_my_override_requests           → getMyOverrideRequests
 * ============================================================================
 */

const service = require('../../services/student/jobOverride.service');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

// ============================================================================
// 1. CHECK OVERRIDE ELIGIBILITY
// ============================================================================

async function checkOverrideEligibility(req, res) {
    const result = await service.checkJobEligibilityForOverride(
        req.params.jobId,
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Override eligibility check completed');
}

// ============================================================================
// 2. REQUEST OVERRIDE
// ============================================================================

async function requestOverride(req, res) {
    try {
        const result = await service.requestOverride(
            req.params.jobId,
            req.user.id,
            req.user.college_id,
            req.validated
        );

        return sendCreated(res, result, 'Eligibility override request submitted successfully');
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET MY OVERRIDE REQUESTS
// ============================================================================

async function getMyOverrideRequests(req, res) {
    const result = await service.getMyOverrideRequests(
        req.user.id,
        req.user.college_id,
        req.validated
    );

    return sendPaginated(
        res,
        result.requests,
        result.total,
        { page: result.page, limit: result.limit },
        'Override requests retrieved successfully'
    );
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    checkOverrideEligibility,
    requestOverride,
    getMyOverrideRequests,
};
