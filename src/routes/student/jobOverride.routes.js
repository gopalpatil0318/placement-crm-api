/**
 * ============================================================================
 * STUDENT JOB OVERRIDE ROUTES — Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 *   GET  /check_override_eligibility/:jobId   Check if override can be requested
 *   POST /request_job_override/:jobId         Submit an override request
 *   GET  /get_my_override_requests            List student's own override requests
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/jobOverride.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    requestOverrideSchema,
    listMyOverridesSchema,
    jobIdParamSchema,
} = require('../../validators/student/jobOverride.validator');

// ============================================================================
// MIDDLEWARE
// ============================================================================

router.use(apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

// Check if student can request an override for this job
router.get(
    '/check_override_eligibility/:jobId',
    authenticate,
    validate(jobIdParamSchema, 'params'),
    asyncHandler(controller.checkOverrideEligibility)
);

// Submit an eligibility override request
router.post(
    '/request_job_override/:jobId',
    authenticate,
    validate(jobIdParamSchema, 'params'),
    validate(requestOverrideSchema),
    asyncHandler(controller.requestOverride)
);

// List student's own override requests (with status filter)
router.get(
    '/get_my_override_requests',
    authenticate,
    validate(listMyOverridesSchema, 'query'),
    asyncHandler(controller.getMyOverrideRequests)
);

module.exports = router;
