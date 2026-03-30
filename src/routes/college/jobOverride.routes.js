/**
 * ============================================================================
 * COLLEGE JOB OVERRIDE ROUTES — Endpoints
 * ============================================================================
 * Base path: /api/college (mounted in routes/index.js)
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO, TPC)
 *
 *   GET   /get_job_override_requests/:jobId  Override requests for a specific job
 *   GET   /get_all_override_requests         Dashboard view (all jobs)
 *   PATCH /review_override_request/:overrideId  Approve or reject one request
 *   POST  /bulk_review_overrides             Bulk approve or reject
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/jobOverride.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    listJobOverridesSchema,
    listAllOverridesSchema,
    reviewOverrideSchema,
    bulkReviewOverrideSchema,
    jobIdParamSchema,
    overrideIdParamSchema,
} = require('../../validators/college/jobOverride.validator');

// All routes require COLLEGEADMIN, TPO, or TPC
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO, ROLES.TPC));
router.use(apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

// List override requests for a specific job
router.get(
    '/get_job_override_requests/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(listJobOverridesSchema, 'query'),
    asyncHandler(controller.getJobOverrideRequests)
);

// Dashboard — all override requests across all jobs
router.get(
    '/get_all_override_requests',
    validate(listAllOverridesSchema, 'query'),
    asyncHandler(controller.getAllOverrideRequests)
);

// Review a single override request (approve or reject)
router.patch(
    '/review_override_request/:overrideId',
    validate(overrideIdParamSchema, 'params'),
    validate(reviewOverrideSchema),
    asyncHandler(controller.reviewOverrideRequest)
);

// Bulk review override requests
router.post(
    '/bulk_review_overrides',
    validate(bulkReviewOverrideSchema),
    asyncHandler(controller.bulkReviewOverrides)
);

module.exports = router;
