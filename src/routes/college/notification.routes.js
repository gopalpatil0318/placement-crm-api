/**
 * ============================================================================
 * COLLEGE NOTIFICATION ROUTES — Notification Endpoints (College-Side)
 * ============================================================================
 * Base path: /api/college (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST /send_notification              authenticate + requireRole + apiLimiter + validate
 *   POST /send_bulk_notification          authenticate + requireRole + apiLimiter + validate
 *   GET  /get_sent_notifications          authenticate + requireRole + validate(query)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/notification.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    sendNotificationSchema,
    sendBulkNotificationSchema,
    listSentNotificationsSchema,
} = require('../../validators/college/notification.validator');

// All notification routes require authentication + rate limiting
router.use(authenticate, apiLimiter);

// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

// Send notification to specific recipients
router.post(
    '/send_notification',
    requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
    validate(sendNotificationSchema),
    asyncHandler(controller.sendNotification)
);

// Send bulk notification with filters
router.post(
    '/send_bulk_notification',
    requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
    validate(sendBulkNotificationSchema),
    asyncHandler(controller.sendBulkNotification)
);

// List sent notifications
router.get(
    '/get_sent_notifications',
    requirePermission(PERMISSIONS.NOTIFICATIONS_VIEW),
    validate(listSentNotificationsSchema, 'query'),
    asyncHandler(controller.getSentNotifications)
);

module.exports = router;
