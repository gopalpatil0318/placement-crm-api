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
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    sendNotificationSchema,
    sendBulkNotificationSchema,
    listSentNotificationsSchema,
} = require('../../validators/college/notification.validator');

// All notification routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO));

// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

// Send notification to specific recipients
router.post(
    '/send_notification',
    apiLimiter,
    validate(sendNotificationSchema),
    asyncHandler(controller.sendNotification)
);

// Send bulk notification with filters
router.post(
    '/send_bulk_notification',
    apiLimiter,
    validate(sendBulkNotificationSchema),
    asyncHandler(controller.sendBulkNotification)
);

// List sent notifications
router.get(
    '/get_sent_notifications',
    validate(listSentNotificationsSchema, 'query'),
    asyncHandler(controller.getSentNotifications)
);

module.exports = router;
