/**
 * ============================================================================
 * STUDENT ACTIVITY VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - addActivitySchema      POST /api/student/add_activity
 *   - updateActivitySchema   PUT  /api/student/update_activity/:activityId
 *
 * Mandatory (frontend ✅): activity_name
 * Optional  (frontend ○) : everything else
 * ============================================================================
 */

const Joi = require('joi');

// Enum values matching schema CHECK constraint
const VALID_ACTIVITY_TYPES = ['sports', 'cultural', 'technical', 'social', 'volunteer', 'arts', 'nss', 'ncc'];

// ============================================================================
// ADD ACTIVITY
// ============================================================================

const addActivitySchema = Joi.object({
    // ── MANDATORY ──
    activity_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Activity name is required',
            'string.min': 'Activity name must be at least 2 characters',
            'string.max': 'Activity name cannot exceed 200 characters',
            'any.required': 'Activity name is required',
        }),

    // ── OPTIONAL ──
    activity_description: Joi.string()
        .max(1500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 1500 characters',
        }),

    activity_type: Joi.string()
        .valid(...VALID_ACTIVITY_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Activity type must be one of: ${VALID_ACTIVITY_TYPES.join(', ')}`,
        }),

    organizing_body: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Organizing body cannot exceed 200 characters',
        }),

    role_position: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Role/position cannot exceed 100 characters',
        }),

    start_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Start date must be in YYYY-MM-DD format',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'End date must be in YYYY-MM-DD format',
        }),

    is_ongoing: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'is_ongoing must be true or false',
        }),

    hours_contributed: Joi.number()
        .integer()
        .min(1)
        .max(10000)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Hours must be at least 1',
            'number.max': 'Hours cannot exceed 10000',
            'number.integer': 'Hours must be a whole number',
        }),

    certificate_url: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Certificate path cannot exceed 500 characters',
        }),

    proof_urls: Joi.array()
        .items(Joi.string().max(500))
        .max(5)
        .optional()
        .allow(null)
        .default([])
        .messages({
            'array.max': 'Cannot add more than 5 proof URLs',
        }),
});

// ============================================================================
// UPDATE ACTIVITY (all fields optional, at least 1 required)
// ============================================================================

const updateActivitySchema = Joi.object({
    activity_name: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Activity name must be at least 2 characters',
            'string.max': 'Activity name cannot exceed 200 characters',
        }),

    activity_description: Joi.string()
        .max(1500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 1500 characters',
        }),

    activity_type: Joi.string()
        .valid(...VALID_ACTIVITY_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Activity type must be one of: ${VALID_ACTIVITY_TYPES.join(', ')}`,
        }),

    organizing_body: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Organizing body cannot exceed 200 characters',
        }),

    role_position: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Role/position cannot exceed 100 characters',
        }),

    start_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Start date must be in YYYY-MM-DD format',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'End date must be in YYYY-MM-DD format',
        }),

    is_ongoing: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_ongoing must be true or false',
        }),

    hours_contributed: Joi.number()
        .integer()
        .min(1)
        .max(10000)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Hours must be at least 1',
        }),

    certificate_url: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Certificate path cannot exceed 500 characters',
        }),

    proof_urls: Joi.array()
        .items(Joi.string().max(500))
        .max(5)
        .optional()
        .allow(null)
        .messages({
            'array.max': 'Cannot add more than 5 proof URLs',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// PARAM SCHEMA — activityId
// ============================================================================

const activityIdParamSchema = Joi.object({
    activityId: Joi.string().uuid().required().messages({
        'string.guid': 'Activity ID must be a valid UUID',
        'any.required': 'Activity ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addActivitySchema,
    updateActivitySchema,
    activityIdParamSchema,
};
