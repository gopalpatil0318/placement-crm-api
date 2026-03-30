/**
 * ============================================================================
 * PLACEMENT RESULT VALIDATORS — Joi Schemas for Placement Records
 * ============================================================================
 *   - createPlacementSchema       POST   /create_placement
 *   - listPlacementsSchema        GET    /get_all_placements
 *   - updatePlacementSchema       PUT    /update_placement/:placementId
 *   - verifyOfferLetterSchema     PATCH  /verify_offer_letter/:placementId
 *   - updatePlacementStatusSchema PATCH  /update_placement_status/:placementId
 * ============================================================================
 */

const Joi = require('joi');
const {
    PLACEMENT_TYPES,
    PLACEMENT_STATUSES,
    ACCEPTANCE_STATUSES,
} = require('../../config/constants');

// ============================================================================
// CREATE PLACEMENT
// ============================================================================

const createPlacementSchema = Joi.object({
    application_id: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid application ID format',
            'any.required': 'Application ID is required',
        }),

    placement_type: Joi.string()
        .valid(...PLACEMENT_TYPES)
        .required()
        .messages({
            'any.only': `Placement type must be one of: ${PLACEMENT_TYPES.join(', ')}`,
            'any.required': 'Placement type is required',
        }),

    // Full-time fields (required when type is full-time or both)
    fulltime_package: Joi.number()
        .precision(2)
        .min(0)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Package cannot be negative',
        }),

    fulltime_designation: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Designation cannot exceed 200 characters',
        }),

    fulltime_joining_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Joining date must be a valid ISO date',
        }),

    // Internship fields (required when type is internship or both)
    internship_stipend: Joi.number()
        .precision(2)
        .min(0)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Stipend cannot be negative',
        }),

    internship_duration: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Duration cannot exceed 100 characters',
        }),

    internship_start_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Start date must be a valid ISO date',
        }),

    // Offer letter
    offer_letter_url: Joi.string()
        .uri()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Offer letter URL must be a valid URL',
            'string.max': 'URL cannot exceed 2000 characters',
        }),
})
    .custom((value, helpers) => {
        const type = value.placement_type;

        // Validate full-time fields present when type is full-time or both
        if ((type === 'full-time' || type === 'both') && !value.fulltime_package) {
            return helpers.error('any.custom', { message: 'Full-time package is required for full-time or both placement type' });
        }

        // Validate internship fields present when type is internship or both
        if ((type === 'internship' || type === 'both') && !value.internship_stipend && value.internship_stipend !== 0) {
            return helpers.error('any.custom', { message: 'Internship stipend is required for internship or both placement type' });
        }

        return value;
    });

// ============================================================================
// LIST PLACEMENTS (query params)
// ============================================================================

const listPlacementsSchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2000)
        .max(2100)
        .optional(),

    company_id: Joi.string()
        .uuid()
        .optional(),

    job_id: Joi.string()
        .uuid()
        .optional(),

    placement_status: Joi.string()
        .valid(...PLACEMENT_STATUSES)
        .optional(),

    placement_type: Joi.string()
        .valid(...PLACEMENT_TYPES)
        .optional(),

    acceptance_status: Joi.string()
        .valid(...ACCEPTANCE_STATUSES)
        .optional(),

    offer_letter_verified: Joi.string()
        .valid('true', 'false')
        .optional(),

    search: Joi.string()
        .max(200)
        .trim()
        .optional()
        .allow(''),

    sort_by: Joi.string()
        .valid('created_at', 'fulltime_package', 'student_name', 'placement_status', 'passout_year', 'company_name')
        .optional()
        .default('created_at'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc'),

    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// UPDATE PLACEMENT
// ============================================================================

const updatePlacementSchema = Joi.object({
    fulltime_package: Joi.number()
        .precision(2)
        .min(0)
        .optional()
        .allow(null),

    fulltime_designation: Joi.string()
        .max(200)
        .optional()
        .allow(null, ''),

    fulltime_joining_date: Joi.date()
        .iso()
        .optional()
        .allow(null),

    internship_stipend: Joi.number()
        .precision(2)
        .min(0)
        .optional()
        .allow(null),

    internship_duration: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    internship_start_date: Joi.date()
        .iso()
        .optional()
        .allow(null),

    offer_letter_url: Joi.string()
        .uri()
        .max(2000)
        .optional()
        .allow(null, ''),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// VERIFY OFFER LETTER
// ============================================================================

const verifyOfferLetterSchema = Joi.object({
    offer_letter_verified: Joi.boolean()
        .required()
        .messages({
            'boolean.base': 'offer_letter_verified must be a boolean',
            'any.required': 'offer_letter_verified is required',
        }),

    remarks: Joi.string()
        .max(1000)
        .optional()
        .allow(null, ''),
});

// ============================================================================
// UPDATE PLACEMENT STATUS
// ============================================================================

const updatePlacementStatusSchema = Joi.object({
    placement_status: Joi.string()
        .valid(...PLACEMENT_STATUSES)
        .required()
        .messages({
            'any.only': `Status must be one of: ${PLACEMENT_STATUSES.join(', ')}`,
            'any.required': 'Placement status is required',
        }),

    acceptance_status: Joi.string()
        .valid(...ACCEPTANCE_STATUSES)
        .optional()
        .allow(null),

    remarks: Joi.string()
        .max(1000)
        .optional()
        .allow(null, ''),
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

const placementIdParamSchema = Joi.object({
    placementId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid placement ID format',
        'any.required': 'Placement ID is required',
    }),
});

module.exports = {
    createPlacementSchema,
    listPlacementsSchema,
    updatePlacementSchema,
    verifyOfferLetterSchema,
    updatePlacementStatusSchema,
    placementIdParamSchema,
};
