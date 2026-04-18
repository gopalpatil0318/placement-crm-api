/**
 * ============================================================================
 * COMPANY TIER VALIDATORS — Joi Schemas
 * ============================================================================
 */

const Joi = require('joi');

const createTierSchema = Joi.object({
    passout_year: Joi.number().integer().min(2000).max(2100).required()
        .messages({ 'number.base': 'Passout year must be a number', 'any.required': 'Passout year is required' }),
    tier_name: Joi.string().trim().min(1).max(100).required()
        .messages({ 'string.empty': 'Tier name is required', 'any.required': 'Tier name is required' }),
    tier_level: Joi.number().integer().min(1).max(20).required()
        .messages({ 'number.base': 'Tier level must be a number', 'any.required': 'Tier level is required' }),
    min_package: Joi.number().min(0).required()
        .messages({ 'number.base': 'Minimum package must be a number', 'any.required': 'Minimum package is required' }),
    max_package: Joi.number().min(Joi.ref('min_package')).allow(null).optional()
        .messages({ 'number.min': 'Maximum package must be >= minimum package' }),
    description: Joi.string().trim().max(500).allow(null, '').optional(),
    is_active: Joi.boolean().optional().default(true),
}).options({ allowUnknown: false });

const updateTierSchema = Joi.object({
    tier_name: Joi.string().trim().min(1).max(100).optional(),
    tier_level: Joi.number().integer().min(1).max(20).optional(),
    min_package: Joi.number().min(0).optional(),
    max_package: Joi.number().allow(null).optional(),
    description: Joi.string().trim().max(500).allow(null, '').optional(),
    is_active: Joi.boolean().optional(),
}).min(1).options({ allowUnknown: false }).messages({
    'object.min': 'At least one field must be provided to update',
});

const listTiersSchema = Joi.object({
    passout_year: Joi.number().integer().min(2000).max(2100).optional(),
    is_active: Joi.string().valid('true', 'false').optional(),
});

const tierIdParamSchema = Joi.object({
    tierId: Joi.string().uuid().required().messages({ 'string.guid': 'Invalid tier ID format' }),
});

module.exports = { createTierSchema, updateTierSchema, listTiersSchema, tierIdParamSchema };
