/**
 * ============================================================================
 * STUDENT NOTIFICATION VALIDATOR — Joi Schemas for Notification Endpoints
 * ============================================================================
 * Endpoints:
 *   GET   /get_my_notifications                       — listMyNotificationsSchema (query)
 *   GET   /get_unread_notification_count               — (no validation)
 *   PATCH /mark_notification_read/:notificationId      — (no body)
 *   PATCH /mark_all_notifications_read                 — (no body)
 * ============================================================================
 */

const Joi = require('joi');
const { STATUS } = require('../../config/constants');

const NOTIFICATION_TYPES = Object.values(STATUS.NOTIFICATION_TYPE);

// ============================================================================
// GET /get_my_notifications — Query params
// ============================================================================

const listMyNotificationsSchema = Joi.object({
    is_read: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_read must be true or false',
        }),

    notification_type: Joi.string()
        .valid(...NOTIFICATION_TYPES)
        .optional()
        .messages({
            'any.only': `Notification type must be one of: ${NOTIFICATION_TYPES.join(', ')}`,
        }),

    sort_by: Joi.string()
        .valid('created_at')
        .optional()
        .default('created_at'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc'),

    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
});

// ============================================================================
// PARAM — :notificationId
// ============================================================================

const notificationIdParamSchema = Joi.object({
    notificationId: Joi.string().uuid().required(),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listMyNotificationsSchema,
    notificationIdParamSchema,
};
