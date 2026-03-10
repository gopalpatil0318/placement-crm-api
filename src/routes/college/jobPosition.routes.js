/**
 * ============================================================================
 * JOB POSITION ROUTES — Position Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /add_job_position/:jobId              Add position + validate
 *   PUT   /update_position/:positionId          Update + validate
 *   PATCH /update_position_status/:positionId   Change status + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/jobPosition.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    addPositionSchema,
    updatePositionSchema,
    updatePositionStatusSchema,
    jobIdParamSchema,
    positionIdParamSchema,
} = require('../../validators/college/jobPosition.validator');

// All position routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_job_position/:jobId',
    validate(jobIdParamSchema, 'params'),
    validate(addPositionSchema),
    asyncHandler(controller.addPosition)
);

router.put(
    '/update_position/:positionId',
    validate(positionIdParamSchema, 'params'),
    validate(updatePositionSchema),
    asyncHandler(controller.updatePosition)
);

router.patch(
    '/update_position_status/:positionId',
    validate(positionIdParamSchema, 'params'),
    validate(updatePositionStatusSchema),
    asyncHandler(controller.updatePositionStatus)
);

module.exports = router;
