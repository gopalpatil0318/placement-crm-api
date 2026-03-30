/**
 * ============================================================================
 * COLLEGE NOTIFICATION VALIDATOR — Joi Schemas for Notification Endpoints
 * ============================================================================
 * Endpoints:
 *   POST /send_notification               — sendNotificationSchema (body)
 *   POST /send_bulk_notification           — sendBulkNotificationSchema (body)
 *   GET  /get_sent_notifications           — listSentNotificationsSchema (query)
 * ============================================================================
 */

const Joi = require('joi');
const { STATUS, ROLES } = require('../../config/constants');

// All 13 notification types from schema CHECK constraint
const NOTIFICATION_TYPES = Object.values(STATUS.NOTIFICATION_TYPE);

// Related entity types (contextual, not in schema CHECK)
const RELATED_ENTITY_TYPES = [
    'job', 'application', 'round', 'placement',
    'restriction', 'training', 'enrollment', 'student', 'user',
];

// ============================================================================
// POST /send_notification — Body (targeted notification to specific recipients)
// ============================================================================

const sendNotificationSchema = Joi.object({
    recipient_type: Joi.string()
        .valid(...Object.values(STATUS.RECIPIENT_TYPE))
        .required()
        .messages({
            'any.only': 'Recipient type must be either student or user',
            'any.required': 'Recipient type is required',
        }),

    recipient_ids: Joi.array()
        .items(Joi.string().uuid())
        .min(1)
        .max(100)
        .required()
        .messages({
            'array.min': 'At least one recipient ID is required',
            'array.max': 'Cannot send to more than 100 recipients at once. Use bulk notification instead',
            'any.required': 'Recipient IDs are required',
        }),

    title: Joi.string()
        .trim()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.min': 'Title must be at least 2 characters',
            'string.max': 'Title cannot exceed 200 characters',
            'any.required': 'Notification title is required',
        }),

    body: Joi.string()
        .trim()
        .max(3000)
        .allow(null, '')
        .optional()
        .messages({
            'string.max': 'Body cannot exceed 3000 characters',
        }),

    notification_type: Joi.string()
        .valid(...NOTIFICATION_TYPES)
        .required()
        .messages({
            'any.only': `Notification type must be one of: ${NOTIFICATION_TYPES.join(', ')}`,
            'any.required': 'Notification type is required',
        }),

    related_entity_type: Joi.string()
        .valid(...RELATED_ENTITY_TYPES)
        .allow(null)
        .optional()
        .messages({
            'any.only': `Related entity type must be one of: ${RELATED_ENTITY_TYPES.join(', ')}`,
        }),

    related_entity_id: Joi.string()
        .uuid()
        .allow(null)
        .optional()
        .messages({
            'string.guid': 'Related entity ID must be a valid UUID',
        }),
});

// ============================================================================
// POST /send_bulk_notification — Body (mass notification with filters)
// ============================================================================

const sendBulkNotificationSchema = Joi.object({
    title: Joi.string()
        .trim()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.min': 'Title must be at least 2 characters',
            'string.max': 'Title cannot exceed 200 characters',
            'any.required': 'Notification title is required',
        }),

    body: Joi.string()
        .trim()
        .max(3000)
        .allow(null, '')
        .optional()
        .messages({
            'string.max': 'Body cannot exceed 3000 characters',
        }),

    notification_type: Joi.string()
        .valid(...NOTIFICATION_TYPES)
        .required()
        .messages({
            'any.only': `Notification type must be one of: ${NOTIFICATION_TYPES.join(', ')}`,
            'any.required': 'Notification type is required',
        }),

    related_entity_type: Joi.string()
        .valid(...RELATED_ENTITY_TYPES)
        .allow(null)
        .optional(),

    related_entity_id: Joi.string()
        .uuid()
        .allow(null)
        .optional(),

    filters: Joi.object({
        recipient_type: Joi.string()
            .valid(...Object.values(STATUS.RECIPIENT_TYPE))
            .required()
            .messages({
                'any.only': 'Recipient type must be either student or user',
                'any.required': 'Recipient type is required in filters',
            }),

        // Student-specific filters
        dept_ids: Joi.array()
            .items(Joi.string().uuid())
            .optional()
            .messages({
                'string.guid': 'Each department ID must be a valid UUID',
            }),

        passout_years: Joi.array()
            .items(Joi.number().integer().min(2020).max(2040))
            .optional()
            .messages({
                'number.min': 'Passout year must be 2020 or later',
                'number.max': 'Passout year cannot exceed 2040',
            }),

        student_status: Joi.string()
            .valid('active', 'inactive', 'graduated')
            .optional()
            .messages({
                'any.only': 'Student status must be one of: active, inactive, graduated',
            }),

        profile_status: Joi.string()
            .valid('approved', 'pending', 'rejected')
            .optional()
            .messages({
                'any.only': 'Profile status must be one of: approved, pending, rejected',
            }),

        is_profile_complete: Joi.boolean()
            .optional(),

        // User-specific filters
        user_roles: Joi.array()
            .items(Joi.string().valid(...Object.values(ROLES).filter(r => r !== ROLES.SYSADMIN)))
            .optional()
            .messages({
                'any.only': 'Invalid user role specified',
            }),

        // Universal
        exclude_ids: Joi.array()
            .items(Joi.string().uuid())
            .max(500)
            .optional()
            .messages({
                'array.max': 'Cannot exclude more than 500 IDs',
            }),
    }).required()
        .messages({
            'any.required': 'Filters object is required for bulk notification',
        }),
});

// ============================================================================
// GET /get_sent_notifications — Query params
// ============================================================================

const listSentNotificationsSchema = Joi.object({
    notification_type: Joi.string()
        .valid(...NOTIFICATION_TYPES)
        .optional()
        .messages({
            'any.only': `Notification type must be one of: ${NOTIFICATION_TYPES.join(', ')}`,
        }),

    recipient_type: Joi.string()
        .valid(...Object.values(STATUS.RECIPIENT_TYPE))
        .optional(),

    search: Joi.string()
        .trim()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Search query cannot exceed 100 characters',
        }),

    date_from: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.format': 'date_from must be a valid ISO date',
        }),

    date_to: Joi.date()
        .iso()
        .optional()
        .when('date_from', {
            is: Joi.exist(),
            then: Joi.date().min(Joi.ref('date_from')),
        })
        .messages({
            'date.format': 'date_to must be a valid ISO date',
            'date.min': 'date_to must be after date_from',
        }),

    sort_by: Joi.string()
        .valid('created_at', 'title', 'notification_type')
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
// EXPORTS
// ============================================================================

module.exports = {
    sendNotificationSchema,
    sendBulkNotificationSchema,
    listSentNotificationsSchema,
};
