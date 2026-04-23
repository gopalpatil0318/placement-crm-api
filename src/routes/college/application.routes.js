/**
 * ============================================================================
 * APPLICATION MANAGEMENT ROUTES — College-Side Application Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   GET   /get_job_applications/:jobId              List all applications
 *   GET   /get_application/:applicationId           Single application detail
 *   PATCH /update_application_status/:applicationId  Change status
 *   POST  /bulk_update_application_status           Bulk status update
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/application.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    listApplicationsSchema,
    updateAppStatusSchema,
    bulkUpdateAppStatusSchema,
    setWaitlistSchema,
    jobIdParamSchema,
    applicationIdParamSchema,
} = require('../../validators/college/application.validator');

// All application routes require authentication
router.use(authenticate);

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/get_job_applications/:jobId',
    requirePermission(PERMISSIONS.APPLICATIONS_VIEW),
    validate(jobIdParamSchema, 'params'),
    validate(listApplicationsSchema, 'query'),
    asyncHandler(controller.getJobApplications)
);

router.get(
    '/get_application/:applicationId',
    requirePermission(PERMISSIONS.APPLICATIONS_VIEW),
    validate(applicationIdParamSchema, 'params'),
    asyncHandler(controller.getApplication)
);

router.patch(
    '/update_application_status/:applicationId',
    requirePermission(PERMISSIONS.APPLICATIONS_MANAGE),
    apiLimiter,
    validate(applicationIdParamSchema, 'params'),
    validate(updateAppStatusSchema),
    asyncHandler(controller.updateApplicationStatus)
);

router.post(
    '/bulk_update_application_status',
    requirePermission(PERMISSIONS.APPLICATIONS_MANAGE),
    apiLimiter,
    validate(bulkUpdateAppStatusSchema),
    asyncHandler(controller.bulkUpdateApplicationStatus)
);

// ── Waitlist Management ─────────────────────────────────────────────────────

router.post(
    '/set_waitlist/:jobId',
    requirePermission(PERMISSIONS.APPLICATIONS_MANAGE),
    apiLimiter,
    validate(jobIdParamSchema, 'params'),
    validate(setWaitlistSchema),
    asyncHandler(controller.setWaitlist)
);

router.get(
    '/get_waitlisted/:jobId',
    requirePermission(PERMISSIONS.APPLICATIONS_VIEW),
    validate(jobIdParamSchema, 'params'),
    asyncHandler(controller.getWaitlistedApplications)
);

router.post(
    '/promote_waitlist/:jobId',
    requirePermission(PERMISSIONS.APPLICATIONS_MANAGE),
    apiLimiter,
    validate(jobIdParamSchema, 'params'),
    asyncHandler(controller.manualPromoteWaitlist)
);

module.exports = router;
