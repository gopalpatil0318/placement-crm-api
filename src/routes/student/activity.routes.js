/**
 * ============================================================================
 * STUDENT ACTIVITY ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST   /add_activity                  authenticate + apiLimiter + validate
 *   GET    /get_all_activities             authenticate
 *   PUT    /update_activity/:activityId    authenticate + apiLimiter + validate
 *   DELETE /delete_activity/:activityId    authenticate + apiLimiter
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/activity.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    addActivitySchema,
    updateActivitySchema,
    activityIdParamSchema,
} = require('../../validators/student/activity.validator');

// ============================================================================
// ACTIVITY ROUTES
// ============================================================================

// Add activity (max 10)
router.post(
    '/add_activity',
    authenticate,
    apiLimiter,
    validate(addActivitySchema),
    asyncHandler(controller.addActivity)
);

// List own activities
router.get(
    '/get_all_activities',
    authenticate,
    asyncHandler(controller.getAllActivities)
);

// Update activity
router.put(
    '/update_activity/:activityId',
    authenticate,
    apiLimiter,
    validate(activityIdParamSchema, 'params'),
    validate(updateActivitySchema),
    asyncHandler(controller.updateActivity)
);

// Delete activity
router.delete(
    '/delete_activity/:activityId',
    authenticate,
    apiLimiter,
    validate(activityIdParamSchema, 'params'),
    asyncHandler(controller.deleteActivity)
);

module.exports = router;
