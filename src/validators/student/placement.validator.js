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
        .valid('offered', 'accepted', 'declined', 'revoked', 'expired', 'joined', 'cancelled')
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
    page: Joi.number().integer().min(1).max(10000).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// PATCH /reject_placement/:placementId — Body
// ============================================================================

const rejectPlacementSchema = Joi.object({
    rejection_reason: Joi.string().min(3).max(1000)
        .custom((v) => typeof v === 'string' ? v.replaceAll(/<[^>]*>/g, '') : v)
        .required().messages({
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
// PATCH /upload_placement_documents/:placementId — Body
// ============================================================================

const uploadDocumentsSchema = Joi.object({
    offer_letter_url: Joi.string().max(2000).optional().allow(null, ''),
    joining_letter_url: Joi.string().max(2000).optional().allow(null, ''),
}).or('offer_letter_url', 'joining_letter_url').messages({
    'object.missing': 'Provide at least one document URL (offer_letter_url or joining_letter_url)',
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listMyPlacementsSchema,
    rejectPlacementSchema,
    placementIdParamSchema,
    uploadDocumentsSchema,
};
