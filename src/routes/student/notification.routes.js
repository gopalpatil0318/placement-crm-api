/**
 * ============================================================================
 * STUDENT NOTIFICATION ROUTES — Notification Endpoints (Student-Side)
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET   /get_my_notifications                       authenticate + validate(query)
 *   GET   /get_unread_notification_count               authenticate
 *   PATCH /mark_notification_read/:notificationId      authenticate + apiLimiter
 *   PATCH /mark_all_notifications_read                 authenticate + apiLimiter
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/notification.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    listMyNotificationsSchema,
    notificationIdParamSchema,
} = require('../../validators/student/notification.validator');

// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

// List own notifications
router.get(
    '/get_my_notifications',
    authenticate,
    validate(listMyNotificationsSchema, 'query'),
    asyncHandler(controller.getMyNotifications)
);

// Get unread notification count (for badge)
router.get(
    '/get_unread_notification_count',
    authenticate,
    asyncHandler(controller.getUnreadNotificationCount)
);

// Mark single notification as read
router.patch(
    '/mark_notification_read/:notificationId',
    authenticate,
    apiLimiter,
    validate(notificationIdParamSchema, 'params'),
    asyncHandler(controller.markNotificationRead)
);

// Mark all notifications as read
router.patch(
    '/mark_all_notifications_read',
    authenticate,
    apiLimiter,
    asyncHandler(controller.markAllNotificationsRead)
);

module.exports = router;
