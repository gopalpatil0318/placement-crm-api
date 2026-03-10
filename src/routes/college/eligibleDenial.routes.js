/**
 * ============================================================================
 * ELIGIBLE NOT APPLIED & DENIALS ROUTES — Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   GET  /get_eligible_not_applied/:jobId   Eligible students who didn't apply
 *   POST /notify_eligible_students/:jobId   Notify eligible students
 *   GET  /get_job_denials/:jobId            Students who denied this job
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/eligibleDenial.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    listEligibleNotAppliedSchema,
    notifyEligibleSchema,
    listDenialsSchema,
    jobIdParamSchema,
} = require('../../validators/college/eligibleDenial.validator');

// All routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO));

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/get_eligible_not_applied/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(listEligibleNotAppliedSchema, 'query'),
    asyncHandler(controller.getEligibleNotApplied)
);

router.post(
    '/notify_eligible_students/:jobId',
    apiLimiter,
    validate(jobIdParamSchema, 'params'),
    validate(notifyEligibleSchema),
    asyncHandler(controller.notifyEligibleStudents)
);

router.get(
    '/get_job_denials/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(listDenialsSchema, 'query'),
    asyncHandler(controller.getJobDenials)
);

module.exports = router;
