/**
 * ============================================================================
 * STUDENT JOB ROUTES — Job Browsing & Application Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET   /get_available_jobs                        authenticate + validate(query)
 *   GET   /get_job_details/:jobId                    authenticate
 *   GET   /check_job_eligibility/:jobId              authenticate
 *   POST  /apply_for_job/:jobId                      authenticate + apiLimiter + validate
 *   POST  /deny_job/:jobId                           authenticate + apiLimiter + validate
 *   GET   /get_my_applications                       authenticate + validate(query)
 *   GET   /get_application_details/:applicationId    authenticate
 *   PATCH /withdraw_application/:applicationId       authenticate + apiLimiter + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/job.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    listAvailableJobsSchema,
    applyForJobSchema,
    denyJobSchema,
    listMyApplicationsSchema,
    withdrawApplicationSchema,
    jobIdParamSchema,
    applicationIdParamSchema,
} = require('../../validators/student/job.validator');

// Rate limiting applied at router level (all endpoints)
router.use(apiLimiter);

// ============================================================================
// JOB BROWSING ROUTES
// ============================================================================

// List available jobs (published, within deadline, matching passout year)
router.get(
    '/get_available_jobs',
    authenticate,
    validate(listAvailableJobsSchema, 'query'),
    asyncHandler(controller.getAvailableJobs)
);

// Get full job details (positions, criteria, rounds, questions)
router.get(
    '/get_job_details/:jobId',
    authenticate,
    validate(jobIdParamSchema, 'params'),
    asyncHandler(controller.getJobDetails)
);

// Check own eligibility for a job
router.get(
    '/check_job_eligibility/:jobId',
    authenticate,
    validate(jobIdParamSchema, 'params'),
    asyncHandler(controller.checkJobEligibility)
);

// ============================================================================
// APPLICATION ROUTES
// ============================================================================

// Apply to a job (with question answers)
router.post(
    '/apply_for_job/:jobId',
    authenticate,
    validate(jobIdParamSchema, 'params'),
    validate(applyForJobSchema),
    asyncHandler(controller.applyForJob)
);

// Deny/opt-out of a job
router.post(
    '/deny_job/:jobId',
    authenticate,
    validate(jobIdParamSchema, 'params'),
    validate(denyJobSchema),
    asyncHandler(controller.denyJob)
);

// List own applications
router.get(
    '/get_my_applications',
    authenticate,
    validate(listMyApplicationsSchema, 'query'),
    asyncHandler(controller.getMyApplications)
);

// Get single application detail (with answers + round results)
router.get(
    '/get_application_details/:applicationId',
    authenticate,
    validate(applicationIdParamSchema, 'params'),
    asyncHandler(controller.getApplicationDetails)
);

// Withdraw application
router.patch(
    '/withdraw_application/:applicationId',
    authenticate,
    validate(applicationIdParamSchema, 'params'),
    validate(withdrawApplicationSchema),
    asyncHandler(controller.withdrawApplication)
);

module.exports = router;
