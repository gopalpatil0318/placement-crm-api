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
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    setCriteriaSchema,
    updateCriteriaSchema,
    getEligibleStudentsSchema,
    jobIdParamSchema,
} = require('../../validators/college/jobCriteria.validator');

// All criteria routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/set_job_criteria/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(setCriteriaSchema),
    asyncHandler(controller.setCriteria)
);

router.put(
    '/update_job_criteria/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(updateCriteriaSchema),
    asyncHandler(controller.updateCriteria)
);

router.get(
    '/get_eligible_students/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(getEligibleStudentsSchema, 'query'),
    asyncHandler(controller.getEligibleStudents)
);

module.exports = router;
