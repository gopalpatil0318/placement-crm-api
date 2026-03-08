/**
 * ============================================================================
 * PLACEMENT POLICY VALIDATORS — Joi Schemas for Policy Management
 * ============================================================================
 *   POST  /api/college/create_policy                  → createPolicySchema
 *   GET   /api/college/get_all_policies               → listPoliciesSchema
 *   PUT   /api/college/update_policy/:policyId        → updatePolicySchema
 *   PATCH /api/college/toggle_policy_status/:policyId → togglePolicyStatusSchema
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// CREATE POLICY
// ============================================================================

const createPolicySchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2000)
        .max(2100)
        .required()
        .messages({
            'number.base': 'Passout year must be a number',
            'number.integer': 'Passout year must be a whole number',
            'number.min': 'Passout year must be 2000 or later',
            'number.max': 'Passout year cannot exceed 2100',
            'any.required': 'Passout year is required',
        }),

    policy_title: Joi.string()
        .trim()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Policy title is required',
            'string.min': 'Policy title must be at least 2 characters',
            'string.max': 'Policy title cannot exceed 200 characters',
            'any.required': 'Policy title is required',
        }),

    policy_description: Joi.string()
        .trim()
        .min(2)
        .max(2000)
        .required()
        .messages({
            'string.empty': 'Policy description is required',
            'string.min': 'Policy description must be at least 2 characters',
            'string.max': 'Policy description cannot exceed 2000 characters',
            'any.required': 'Policy description is required',
        }),
});

// ============================================================================
// LIST POLICIES (query params)
// ============================================================================

const listPoliciesSchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2000)
        .max(2100)
        .optional(),

    is_active: Joi.string()
        .valid('true', 'false')
        .optional(),

    search: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    sort_by: Joi.string()
        .valid('created_at', 'policy_title', 'passout_year', 'updated_at')
        .optional()
        .default('created_at'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc'),

    page: Joi.number()
        .integer()
        .min(1)
        .optional()
        .default(1),

    limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .optional()
        .default(10),
});

// ============================================================================
// UPDATE POLICY
// ============================================================================

const updatePolicySchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2000)
        .max(2100)
        .optional()
        .messages({
            'number.base': 'Passout year must be a number',
            'number.integer': 'Passout year must be a whole number',
            'number.min': 'Passout year must be 2000 or later',
            'number.max': 'Passout year cannot exceed 2100',
        }),

    policy_title: Joi.string()
        .trim()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Policy title must be at least 2 characters',
            'string.max': 'Policy title cannot exceed 200 characters',
        }),

    policy_description: Joi.string()
        .trim()
        .min(2)
        .max(2000)
        .optional()
        .messages({
            'string.min': 'Policy description must be at least 2 characters',
            'string.max': 'Policy description cannot exceed 2000 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// TOGGLE POLICY STATUS
// ============================================================================

const togglePolicyStatusSchema = Joi.object({
    is_active: Joi.boolean()
        .required()
        .messages({
            'boolean.base': 'is_active must be a boolean (true or false)',
            'any.required': 'is_active is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createPolicySchema,
    listPoliciesSchema,
    updatePolicySchema,
    togglePolicyStatusSchema,
};
