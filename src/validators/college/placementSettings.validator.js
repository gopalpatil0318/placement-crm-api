/**
 * ============================================================================
 * PLACEMENT SETTINGS VALIDATORS — Joi Schemas
 * ============================================================================
 */

const Joi = require('joi');

const upsertSettingsSchema = Joi.object({
    passout_year: Joi.number().integer().min(2000).max(2100).required()
        .messages({ 'number.base': 'Passout year must be a number', 'any.required': 'Passout year is required' }),
    max_active_offers: Joi.number().integer().min(1).max(10).optional().default(1),
    allow_dream_upgrade: Joi.boolean().optional().default(true),
    auto_withdrawal_rule: Joi.string().valid('none', 'same_tier', 'same_or_lower_tier', 'all').optional().default('same_or_lower_tier'),
    default_offer_days: Joi.number().integer().min(1).max(90).optional().default(7),
    exclude_placed_by_default: Joi.boolean().optional().default(true),
    auto_reject_on_round_fail: Joi.boolean().optional().default(true),
    allow_reapply_after_withdrawal: Joi.boolean().optional().default(false),
}).options({ allowUnknown: false });

const getSettingsSchema = Joi.object({
    passout_year: Joi.number().integer().min(2000).max(2100).required()
        .messages({ 'number.base': 'Passout year must be a number', 'any.required': 'Passout year is required' }),
});

module.exports = { upsertSettingsSchema, getSettingsSchema };
