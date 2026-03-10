/**
 * ============================================================================
 * STUDENT NOTIFICATION CONTROLLER — Notification Route Handlers (Student-Side)
 * ============================================================================
 * Endpoints:
 *   GET   /api/student/get_my_notifications                          #168
 *   GET   /api/student/get_unread_notification_count                  #169
 *   PATCH /api/student/mark_notification_read/:notificationId         #170
 *   PATCH /api/student/mark_all_notifications_read                    #171
 * ============================================================================
 */

const notificationService = require('../../services/student/notification.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    SUCCESS_MESSAGES,
    LOG,
} = require('../../config/constants');

// ============================================================================
// 1. GET MY NOTIFICATIONS (#168)
// ============================================================================

async function getMyNotifications(req, res) {
    const { notifications, total, page, limit } =
        await notificationService.getMyNotifications(
            req.user.id,
            req.user.college_id,
            req.validated
        );

    return sendPaginated(res, notifications, total, { page, limit }, 'Notifications retrieved successfully');
}

// ============================================================================
// 2. GET UNREAD NOTIFICATION COUNT (#169)
// ============================================================================

async function getUnreadNotificationCount(req, res) {
    const result = await notificationService.getUnreadCount(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Unread count retrieved');
}

// ============================================================================
// 3. MARK NOTIFICATION READ (#170)
// ============================================================================

async function markNotificationRead(req, res) {
    const startTime = Date.now();
    const { notificationId } = req.params;

    logger.info(`${LOG.API_START} PATCH /api/student/mark_notification_read/${notificationId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await notificationService.markAsRead(
        notificationId,
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PATCH /api/student/mark_notification_read/${notificationId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.NOTIFICATIONS_MARKED_READ);
}

// ============================================================================
// 4. MARK ALL NOTIFICATIONS READ (#171)
// ============================================================================

async function markAllNotificationsRead(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} PATCH /api/student/mark_all_notifications_read`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await notificationService.markAllAsRead(
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PATCH /api/student/mark_all_notifications_read`, {
        student_id: req.user.id,
        marked_count: result.marked_count,
        duration_ms: duration,
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.NOTIFICATIONS_MARKED_READ);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getMyNotifications,
    getUnreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
};
