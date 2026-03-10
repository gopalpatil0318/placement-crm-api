/**
 * ============================================================================
 * COLLEGE NOTIFICATION CONTROLLER — Notification Route Handlers (College-Side)
 * ============================================================================
 * Endpoints:
 *   POST /api/college/send_notification                              #96
 *   POST /api/college/send_bulk_notification                         #97
 *   GET  /api/college/get_sent_notifications                         #98
 * ============================================================================
 */

const notificationService = require('../../services/college/notification.service');
const { sendSuccess, sendError, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    LOG,
} = require('../../config/constants');

// ============================================================================
// 1. SEND NOTIFICATION (#96)
// ============================================================================

async function sendNotification(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/college/send_notification`, {
        user_id: req.user.id,
        college_id: req.user.college_id,
        notification_type: req.validated.notification_type,
        recipient_count: req.validated.recipient_ids.length,
    });

    try {
        const result = await notificationService.sendNotification(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} POST /api/college/send_notification`, {
            user_id: req.user.id,
            sent_count: result.sent_count,
            duration_ms: duration,
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.NOTIFICATION_SENT);
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} POST /api/college/send_notification`, {
            error: err.message,
            stack: err.stack,
            user_id: req.user.id,
            duration_ms: duration,
        });

        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. SEND BULK NOTIFICATION (#97)
// ============================================================================

async function sendBulkNotification(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/college/send_bulk_notification`, {
        user_id: req.user.id,
        college_id: req.user.college_id,
        notification_type: req.validated.notification_type,
        recipient_type: req.validated.filters.recipient_type,
    });

    try {
        const result = await notificationService.sendBulkNotification(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} POST /api/college/send_bulk_notification`, {
            user_id: req.user.id,
            sent_count: result.sent_count,
            skipped_count: result.skipped_count,
            total_eligible: result.total_eligible,
            duration_ms: duration,
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.BULK_NOTIFICATION_SENT);
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} POST /api/college/send_bulk_notification`, {
            error: err.message,
            stack: err.stack,
            user_id: req.user.id,
            duration_ms: duration,
        });

        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET SENT NOTIFICATIONS (#98)
// ============================================================================

async function getSentNotifications(req, res) {
    try {
        const { notifications, total, page, limit, summary } =
            await notificationService.getSentNotifications(
                req.user.college_id,
                req.validated
            );

        return sendPaginated(
            res,
            { notifications, summary },
            total,
            { page, limit },
            'Sent notifications retrieved successfully'
        );
    } catch (err) {
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    sendNotification,
    sendBulkNotification,
    getSentNotifications,
};
