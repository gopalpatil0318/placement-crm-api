/**
 * ============================================================================
 * JOB CRITERIA ROUTES — Eligibility Criteria Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST /set_job_criteria/:jobId           Set criteria + validate
 *   PUT  /update_job_criteria/:jobId        Update criteria + validate
 *   GET  /get_eligible_students/:jobId      Get eligible students + validate(query)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/jobCriteria.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    setCriteriaSchema,
    updateCriteriaSchema,
    getEligibleStudentsSchema,
    jobIdParamSchema,
} = require('../../validators/college/jobCriteria.validator');

// All criteria routes require authentication
router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/set_job_criteria/:jobId',
    requirePermission(PERMISSIONS.JOBS_UPDATE),
    validate(jobIdParamSchema, 'params'),
    validate(setCriteriaSchema),
    asyncHandler(controller.setCriteria)
);

router.put(
    '/update_job_criteria/:jobId',
    requirePermission(PERMISSIONS.JOBS_UPDATE),
    validate(jobIdParamSchema, 'params'),
    validate(updateCriteriaSchema),
    asyncHandler(controller.updateCriteria)
);

router.get(
    '/get_eligible_students/:jobId',
    requirePermission(PERMISSIONS.JOBS_VIEW),
    validate(jobIdParamSchema, 'params'),
    validate(getEligibleStudentsSchema, 'query'),
    asyncHandler(controller.getEligibleStudents)
);

router.get(
    '/get_job_criteria_history/:jobId',
    requirePermission(PERMISSIONS.JOBS_VIEW),
    validate(jobIdParamSchema, 'params'),
    asyncHandler(controller.getCriteriaHistory)
);

module.exports = router;
