/**
 * ============================================================================
 * APPLICATION MANAGEMENT VALIDATORS — Joi Schemas for Application Management
 * ============================================================================
 *   - listApplicationsSchema      GET    /get_job_applications/:jobId
 *   - updateAppStatusSchema       PATCH  /update_application_status/:applicationId
 *   - bulkUpdateAppStatusSchema   POST   /bulk_update_application_status
 * ============================================================================
 */

const Joi = require('joi');

const APPLICATION_STATUSES = ['pending', 'under_review', 'shortlisted', 'rejected', 'selected', 'offered', 'withdrawn'];
const ADMIN_SETTABLE_STATUSES = ['under_review', 'shortlisted', 'rejected', 'selected', 'offered'];

// ============================================================================
// LIST APPLICATIONS (query params for filtering, sorting, pagination)
// ============================================================================

const listApplicationsSchema = Joi.object({
    // Filtering
    application_status: Joi.string()
        .valid(...APPLICATION_STATUSES)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${APPLICATION_STATUSES.join(', ')}`,
        }),

    is_eligible: Joi.string()
        .valid('true', 'false')
        .optional()
        .messages({
            'any.only': 'is_eligible must be true or false',
        }),

    search: Joi.string()
        .max(200)
        .optional()
        .allow('')
        .messages({
            'string.max': 'Search term cannot exceed 200 characters',
        }),

    position_id: Joi.string()
        .uuid()
        .optional()
        .messages({
            'string.guid': 'Invalid position ID format',
        }),

    applied_after: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.format': 'applied_after must be a valid ISO date',
        }),

    applied_before: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.format': 'applied_before must be a valid ISO date',
        }),

    // Sorting
    sort_by: Joi.string()
        .valid('applied_at', 'last_updated_at', 'student_name', 'application_status')
        .optional()
        .default('applied_at')
        .messages({
            'any.only': 'sort_by must be one of: applied_at, last_updated_at, student_name, application_status',
        }),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc')
        .messages({
            'any.only': 'sort_order must be asc or desc',
        }),

    // Pagination
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// UPDATE APPLICATION STATUS (single)
// ============================================================================

const updateAppStatusSchema = Joi.object({
    application_status: Joi.string()
        .valid(...ADMIN_SETTABLE_STATUSES)
        .required()
        .messages({
            'any.only': `Application status must be one of: ${ADMIN_SETTABLE_STATUSES.join(', ')}`,
            'any.required': 'Application status is required',
        }),

    remarks: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Remarks cannot exceed 1000 characters',
        }),
});

// ============================================================================
// BULK UPDATE APPLICATION STATUS
// ============================================================================

const bulkUpdateAppStatusSchema = Joi.object({
    application_ids: Joi.array()
        .items(Joi.string().uuid().messages({ 'string.guid': 'Each application ID must be a valid UUID' }))
        .min(1)
        .max(100)
        .required()
        .messages({
            'array.min': 'At least one application ID is required',
            'array.max': 'Cannot update more than 100 applications at once',
            'any.required': 'application_ids is required',
        }),

    application_status: Joi.string()
        .valid(...ADMIN_SETTABLE_STATUSES)
        .required()
        .messages({
            'any.only': `Application status must be one of: ${ADMIN_SETTABLE_STATUSES.join(', ')}`,
            'any.required': 'Application status is required',
        }),

    remarks: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Remarks cannot exceed 1000 characters',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listApplicationsSchema,
    updateAppStatusSchema,
    bulkUpdateAppStatusSchema,
};
