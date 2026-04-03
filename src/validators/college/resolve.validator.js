/**
 * ============================================================================
 * RESOLVE VALIDATOR — Joi Schema for Public College Lookup
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// Subdomain Param
// GET /api/college/resolve/:subdomain
// ============================================================================

const resolveSubdomainParamSchema = Joi.object({
    subdomain: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z0-9-]+$/)
        .min(2)
        .max(50)
        .required()
        .messages({
            'string.empty': 'Subdomain is required',
            'string.pattern.base': 'Subdomain can only contain lowercase letters, numbers, and hyphens',
            'string.min': 'Subdomain must be at least 2 characters',
            'string.max': 'Subdomain cannot exceed 50 characters',
            'any.required': 'Subdomain is required',
        }),
});

module.exports = { resolveSubdomainParamSchema };
