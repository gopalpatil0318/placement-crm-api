/**
 * ============================================================================
 * STUDENT PLACEMENT VALIDATOR — Joi Schemas for Placement Results (Own)
 * ============================================================================
 * Endpoints:
 *   GET   /get_my_placements                   — listMyPlacementsSchema (query)
 *   PATCH /accept_placement/:placementId       — (params only, no body)
 *   PATCH /reject_placement/:placementId       — rejectPlacementSchema (body)
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// GET /get_my_placements — Query params
// ============================================================================

const listMyPlacementsSchema = Joi.object({
    // Filters
    placement_status: Joi.string()
        .valid('offered', 'accepted', 'rejected', 'joined', 'cancelled')
        .optional(),
    placement_type: Joi.string()
        .valid('full-time', 'internship', 'both')
        .optional(),
    acceptance_status: Joi.string()
        .valid('accepted', 'rejected', 'pending')
        .optional(),

    // Sorting
    sort_by: Joi.string()
        .valid('created_at', 'fulltime_package', 'placement_status', 'company_name')
        .optional()
        .default('created_at'),
    sort_order: Joi.string().valid('asc', 'desc').optional().default('desc'),

    // Pagination
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// PATCH /reject_placement/:placementId — Body
// ============================================================================

const rejectPlacementSchema = Joi.object({
    rejection_reason: Joi.string().min(3).max(1000).required().messages({
        'string.empty': 'Rejection reason is required',
        'string.min': 'Rejection reason must be at least 3 characters',
        'any.required': 'Rejection reason is required',
    }),
});

// ============================================================================
// PARAM SCHEMA — placementId
// ============================================================================

const placementIdParamSchema = Joi.object({
    placementId: Joi.string().uuid().required().messages({
        'string.guid': 'Placement ID must be a valid UUID',
        'any.required': 'Placement ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listMyPlacementsSchema,
    rejectPlacementSchema,
    placementIdParamSchema,
};
