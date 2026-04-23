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
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    addPositionSchema,
    updatePositionSchema,
    updatePositionStatusSchema,
    jobIdParamSchema,
    positionIdParamSchema,
} = require('../../validators/college/jobPosition.validator');

// All position routes require authentication
router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_job_position/:jobId',
    requirePermission(PERMISSIONS.JOBS_UPDATE),
    validate(jobIdParamSchema, 'params'),
    validate(addPositionSchema),
    asyncHandler(controller.addPosition)
);

router.put(
    '/update_position/:positionId',
    requirePermission(PERMISSIONS.JOBS_UPDATE),
    validate(positionIdParamSchema, 'params'),
    validate(updatePositionSchema),
    asyncHandler(controller.updatePosition)
);

router.patch(
    '/update_position_status/:positionId',
    requirePermission(PERMISSIONS.JOBS_UPDATE),
    validate(positionIdParamSchema, 'params'),
    validate(updatePositionStatusSchema),
    asyncHandler(controller.updatePositionStatus)
);

module.exports = router;
