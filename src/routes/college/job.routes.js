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
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    createJobSchema,
    listJobsSchema,
    updateJobSchema,
    updateJobStatusSchema,
} = require('../../validators/college/job.validator');

// All job routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_job',
    validate(createJobSchema),
    asyncHandler(controller.createJob)
);

router.get(
    '/get_all_jobs',
    validate(listJobsSchema, 'query'),
    asyncHandler(controller.getAllJobs)
);

router.get(
    '/get_job/:jobId',
    asyncHandler(controller.getJob)
);

router.put(
    '/update_job/:jobId',
    validate(updateJobSchema),
    asyncHandler(controller.updateJob)
);

router.patch(
    '/update_job_status/:jobId',
    validate(updateJobStatusSchema),
    asyncHandler(controller.updateJobStatus)
);

module.exports = router;
