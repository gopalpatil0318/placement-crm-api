/**
 * ============================================================================
 * STUDENT RESTRICTION VALIDATOR — Joi Schemas for Restrictions (Own)
 * ============================================================================
 * Endpoints:
 *   GET  /get_my_restrictions                          — listMyRestrictionsSchema (query)
 *   POST /appeal_restriction/:restrictionId            — appealRestrictionSchema (body)
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// GET /get_my_restrictions — Query params
// ============================================================================

const listMyRestrictionsSchema = Joi.object({
    // Filters
    is_active: Joi.string().valid('true', 'false').optional(),
    restriction_type: Joi.string()
        .valid('bar_from_placements', 'bar_from_company', 'probation', 'warning', 'temporary_suspension')
        .optional(),

    // Sorting
    sort_by: Joi.string()
        .valid('created_at', 'applied_on', 'valid_until', 'restriction_type')
        .optional()
        .default('created_at'),
    sort_order: Joi.string().valid('asc', 'desc').optional().default('desc'),

    // Pagination
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// POST /appeal_restriction/:restrictionId — Body
// ============================================================================

const appealRestrictionSchema = Joi.object({
    appeal_notes: Joi.string().min(10).max(2000).required().messages({
        'string.empty': 'Appeal notes are required',
        'string.min': 'Appeal notes must be at least 10 characters — please explain your appeal clearly',
        'any.required': 'Appeal notes are required',
    }),
});

// ============================================================================
// PARAM — :restrictionId
// ============================================================================

const restrictionIdParamSchema = Joi.object({
    restrictionId: Joi.string().uuid().required(),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listMyRestrictionsSchema,
    appealRestrictionSchema,
    restrictionIdParamSchema,
};
