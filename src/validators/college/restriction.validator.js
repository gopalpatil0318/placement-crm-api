/**
 * ============================================================================
 * RESTRICTION VALIDATORS — Joi Schemas for Student Restriction Management
 * ============================================================================
 *   - addRestrictionSchema             POST  /add_student_restriction/:studentId
 *   - listRestrictionsSchema           GET   /get_all_restrictions (query)
 *   - listStudentRestrictionsSchema    GET   /get_student_restrictions/:studentId (query)
 *   - updateRestrictionSchema          PATCH /update_restriction/:restrictionId
 * ============================================================================
 */

const Joi = require('joi');
const { RESTRICTION_TYPES } = require('../../config/constants');

// ============================================================================
// ADD RESTRICTION
// ============================================================================

const addRestrictionSchema = Joi.object({
    restriction_type: Joi.string()
        .valid(...RESTRICTION_TYPES)
        .required()
        .messages({
            'any.only': `Restriction type must be one of: ${RESTRICTION_TYPES.join(', ')}`,
            'any.required': 'Restriction type is required',
        }),

    reason: Joi.string()
        .min(5)
        .max(1000)
        .required()
        .messages({
            'string.empty': 'Reason is required',
            'string.min': 'Reason must be at least 5 characters',
            'string.max': 'Reason cannot exceed 1000 characters',
            'any.required': 'Reason for restriction is required',
        }),

    details: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Details cannot exceed 2000 characters',
        }),

    valid_until: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Valid until must be a valid date in ISO format (YYYY-MM-DD)',
        }),
});

// ============================================================================
// LIST ALL RESTRICTIONS (query params) — passout_year required
// ============================================================================

const listRestrictionsSchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .required()
        .messages({
            'number.base': 'Passout year must be a number',
            'number.min': 'Passout year must be 2020 or later',
            'number.max': 'Passout year cannot exceed 2040',
            'any.required': 'Passout year is required to filter restrictions',
        }),

    restriction_type: Joi.string()
        .valid(...RESTRICTION_TYPES)
        .optional()
        .messages({
            'any.only': `Restriction type must be one of: ${RESTRICTION_TYPES.join(', ')}`,
        }),

    is_active: Joi.boolean()
        .optional(),

    search: Joi.string()
        .max(100)
        .trim()
        .optional()
        .messages({
            'string.max': 'Search query cannot exceed 100 characters',
        }),

    page: Joi.number()
        .positive()
        .optional()
        .default(1),

    limit: Joi.number()
        .positive()
        .max(100)
        .optional()
        .default(20),
});

// ============================================================================
// LIST STUDENT RESTRICTIONS (query params) — optional is_active filter
// ============================================================================

const listStudentRestrictionsSchema = Joi.object({
    is_active: Joi.boolean()
        .optional(),
});

// ============================================================================
// UPDATE / RESOLVE RESTRICTION
// ============================================================================

const updateRestrictionSchema = Joi.object({
    is_active: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_active must be true or false',
        }),

    valid_until: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Valid until must be a valid date in ISO format (YYYY-MM-DD)',
        }),

    details: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Details cannot exceed 2000 characters',
        }),

    reason: Joi.string()
        .min(5)
        .max(1000)
        .optional()
        .messages({
            'string.min': 'Reason must be at least 5 characters',
            'string.max': 'Reason cannot exceed 1000 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS — UUID validation for route parameters
// ============================================================================

const studentIdParamSchema = Joi.object({
    studentId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid student ID format',
        'any.required': 'Student ID is required',
    }),
});

const restrictionIdParamSchema = Joi.object({
    restrictionId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid restriction ID format',
        'any.required': 'Restriction ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addRestrictionSchema,
    listRestrictionsSchema,
    listStudentRestrictionsSchema,
    updateRestrictionSchema,
    studentIdParamSchema,
    restrictionIdParamSchema,
};
