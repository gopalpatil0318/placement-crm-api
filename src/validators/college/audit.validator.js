/**
 * ============================================================================
 * AUDIT LOG VALIDATORS — Joi Schemas for Audit Trail Queries (B23)
 * ============================================================================
 *   - getAuditLogsSchema        GET  /audit_logs
 *   - auditIdParamSchema        GET  /audit_logs/:auditId
 * ============================================================================
 */

const Joi = require('joi');
const { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');

const VALID_ACTIONS = Object.values(AUDIT_ACTIONS);
const VALID_RESOURCE_TYPES = Object.values(AUDIT_RESOURCE_TYPES);

const getAuditLogsSchema = Joi.object({
    // Filtering
    action: Joi.string()
        .valid(...VALID_ACTIONS)
        .optional()
        .messages({
            'any.only': `Action must be one of: ${VALID_ACTIONS.join(', ')}`,
        }),

    resource_type: Joi.string()
        .valid(...VALID_RESOURCE_TYPES)
        .optional()
        .messages({
            'any.only': `Resource type must be one of: ${VALID_RESOURCE_TYPES.join(', ')}`,
        }),

    user_id: Joi.string()
        .uuid()
        .optional()
        .messages({
            'string.guid': 'Invalid user ID format',
        }),

    resource_id: Joi.string()
        .uuid()
        .optional()
        .messages({
            'string.guid': 'Invalid resource ID format',
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

    search: Joi.string()
        .trim()
        .max(200)
        .optional()
        .allow('')
        .messages({
            'string.max': 'Search term cannot exceed 200 characters',
        }),

    // Pagination
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
});

const auditIdParamSchema = Joi.object({
    auditId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid audit ID format',
        'any.required': 'Audit ID is required',
    }),
});

module.exports = {
    getAuditLogsSchema,
    auditIdParamSchema,
};
