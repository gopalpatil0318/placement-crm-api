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
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    listApplicationsSchema,
    updateAppStatusSchema,
    bulkUpdateAppStatusSchema,
} = require('../../validators/college/application.validator');

// All application routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO));

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/get_job_applications/:jobId',
    validate(listApplicationsSchema, 'query'),
    asyncHandler(controller.getJobApplications)
);

router.get(
    '/get_application/:applicationId',
    asyncHandler(controller.getApplication)
);

router.patch(
    '/update_application_status/:applicationId',
    apiLimiter,
    validate(updateAppStatusSchema),
    asyncHandler(controller.updateApplicationStatus)
);

router.post(
    '/bulk_update_application_status',
    apiLimiter,
    validate(bulkUpdateAppStatusSchema),
    asyncHandler(controller.bulkUpdateApplicationStatus)
);

module.exports = router;
