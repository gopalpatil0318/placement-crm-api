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

/**
 * @type {{
 *   getJobOverrideRequests: (...args: any[]) => Promise<any>,
 *   getAllOverrideRequests: (...args: any[]) => Promise<any>,
 *   reviewOverrideRequest: (...args: any[]) => Promise<any>,
 *   bulkReviewOverrideRequests: (...args: any[]) => Promise<any>
 * }}
 */
const service = require('../../services/college/jobOverride.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const { SUCCESS_MESSAGES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');

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
        SUCCESS_MESSAGES.OVERRIDE_REQUESTS_RETRIEVED
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
        SUCCESS_MESSAGES.ALL_OVERRIDE_REQUESTS_RETRIEVED
    );
}

// ============================================================================
// 3. REVIEW OVERRIDE REQUEST (single)
// ============================================================================

async function reviewOverrideRequest(req, res) {
    const result = await service.reviewOverrideRequest(
        req.params.overrideId,
        req.user.college_id,
        req.user.id,
        req.validated
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.OVERRIDE,
        resourceId: req.params.overrideId,
        summary: `Reviewed override request — ${req.validated.review_action}`,
        newValue: { review_action: req.validated.review_action, review_remarks: req.validated.review_remarks ?? null },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.OVERRIDE_REVIEWED);
}

// ============================================================================
// 4. BULK REVIEW OVERRIDE REQUESTS
// ============================================================================

async function bulkReviewOverrides(req, res) {
    const result = await service.bulkReviewOverrideRequests(
        req.user.college_id,
        req.user.id,
        req.validated
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.OVERRIDE,
        summary: `Bulk reviewed ${result.summary?.processed ?? 0} override requests`,
        metadata: result.summary,
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.BULK_OVERRIDE_REVIEWED);
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
