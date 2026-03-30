/**
 * ============================================================================
 * STUDENT JOB OVERRIDE CONTROLLER — Route Handlers
 * ============================================================================
 *   GET  /api/student/check_override_eligibility/:jobId  → checkOverrideEligibility
 *   POST /api/student/request_job_override/:jobId        → requestOverride
 *   GET  /api/student/get_my_override_requests           → getMyOverrideRequests
 * ============================================================================
 */

/**
 * @type {{
 *   checkJobEligibilityForOverride: (...args: any[]) => Promise<any>,
 *   requestOverride: (...args: any[]) => Promise<any>,
 *   getMyOverrideRequests: (...args: any[]) => Promise<any>
 * }}
 */
const service = require('../../services/student/jobOverride.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES } = require('../../config/constants');

// ============================================================================
// 1. CHECK OVERRIDE ELIGIBILITY
// ============================================================================

async function checkOverrideEligibility(req, res) {
    const result = await service.checkJobEligibilityForOverride(
        req.params.jobId,
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.OVERRIDE_ELIGIBILITY_CHECKED);
}

// ============================================================================
// 2. REQUEST OVERRIDE
// ============================================================================

async function requestOverride(req, res) {
    const result = await service.requestOverride(
        req.params.jobId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    return sendCreated(res, result, SUCCESS_MESSAGES.OVERRIDE_REQUESTED);
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
        SUCCESS_MESSAGES.MY_OVERRIDES_RETRIEVED
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
