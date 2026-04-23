/**
 * ============================================================================
 * JOB ROUTES — Job Posting Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /create_job                    Create (transaction) + validate
 *   GET   /get_all_jobs                  List + validate(query)
 *   GET   /get_job/:jobId                Get full details
 *   PUT   /update_job/:jobId             Update core fields + validate
 *   PATCH /update_job_status/:jobId      Change status + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/job.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    createJobSchema,
    listJobsSchema,
    updateJobSchema,
    updateJobStatusSchema,
    jobIdParamSchema,
} = require('../../validators/college/job.validator');

// All job routes require authentication
router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_job',
    requirePermission(PERMISSIONS.JOBS_CREATE),
    validate(createJobSchema),
    asyncHandler(controller.createJob)
);

router.get(
    '/get_all_jobs',
    requirePermission(PERMISSIONS.JOBS_VIEW),
    validate(listJobsSchema, 'query'),
    asyncHandler(controller.getAllJobs)
);

router.get(
    '/get_job/:jobId',
    requirePermission(PERMISSIONS.JOBS_VIEW),
    validate(jobIdParamSchema, 'params'),
    asyncHandler(controller.getJob)
);

router.put(
    '/update_job/:jobId',
    requirePermission(PERMISSIONS.JOBS_UPDATE),
    validate(jobIdParamSchema, 'params'),
    validate(updateJobSchema),
    asyncHandler(controller.updateJob)
);

router.patch(
    '/update_job_status/:jobId',
    requirePermission(PERMISSIONS.JOBS_MANAGE_STATUS),
    validate(jobIdParamSchema, 'params'),
    validate(updateJobStatusSchema),
    asyncHandler(controller.updateJobStatus)
);

module.exports = router;
