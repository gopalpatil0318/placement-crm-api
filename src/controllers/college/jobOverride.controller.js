/**
 * ============================================================================
 * COLLEGE JOB OVERRIDE CONTROLLER — Route Handlers
 * ============================================================================
 *   GET   /api/college/get_job_override_requests/:jobId  → getJobOverrideRequests
 *   GET   /api/college/get_all_override_requests         → getAllOverrideRequests
 *   PATCH /api/college/review_override_request/:overrideId → reviewOverrideRequest
 *   POST  /api/college/bulk_review_overrides             → bulkReviewOverrides
 * ============================================================================
 */

const service = require('../../services/college/jobOverride.service');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

// ============================================================================
// 1. GET JOB OVERRIDE REQUESTS (for a specific job)
// ============================================================================

async function getJobOverrideRequests(req, res) {
    const result = await service.getJobOverrideRequests(
        req.params.jobId,
        req.user.college_id,
        req.validated
    );

    return sendPaginated(
        res,
        {
            job: result.job,
            summary: result.summary,
            override_requests: result.requests,
        },
        result.total,
        { page: result.page, limit: result.limit },
        'Job override requests retrieved successfully'
    );
}

// ============================================================================
// 2. GET ALL OVERRIDE REQUESTS (dashboard)
// ============================================================================

async function getAllOverrideRequests(req, res) {
    const result = await service.getAllOverrideRequests(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(
        res,
        {
            summary: result.summary,
            override_requests: result.requests,
        },
        result.total,
        { page: result.page, limit: result.limit },
        'Override requests retrieved successfully'
    );
}

// ============================================================================
// 3. REVIEW OVERRIDE REQUEST (single)
// ============================================================================

async function reviewOverrideRequest(req, res) {
    try {
        const result = await service.reviewOverrideRequest(
            req.params.overrideId,
            req.user.college_id,
            req.user.id,
            req.validated
        );

        return sendSuccess(res, result, `Override request ${result.override_status} successfully`);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. BULK REVIEW OVERRIDE REQUESTS
// ============================================================================

async function bulkReviewOverrides(req, res) {
    try {
        const result = await service.bulkReviewOverrideRequests(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        const message = `Bulk ${result.action}: ${result.processed} processed, ${result.skipped} skipped (already reviewed)`;
        return sendSuccess(res, result, message);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getJobOverrideRequests,
    getAllOverrideRequests,
    reviewOverrideRequest,
    bulkReviewOverrides,
};
