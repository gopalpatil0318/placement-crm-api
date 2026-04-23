/**
 * ============================================================================
 * COLLEGE SELF-REPORT REVIEW VALIDATOR — Joi Schemas for Admin Review
 * ============================================================================
 * Endpoints:
 *   GET   /api/college/self-reports                        — listSchema (query)
 *   GET   /api/college/self-reports/stats                  — statsSchema (query)
 *   GET   /api/college/self-reports/:reportId              — reportIdParamSchema (params)
 *   PATCH /api/college/self-reports/:reportId/review       — reviewSchema (params+body)
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// GET /self-reports — Query params (paginated admin queue)
// ============================================================================

const listSelfReportsSchema = Joi.object({
    verification_status: Joi.string()
        .valid('pending', 'approved', 'rejected')
        .optional(),

    search: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional(),

    page: Joi.number().integer().min(1).max(10000).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// GET /self-reports/stats — Query params
// ============================================================================

const selfReportStatsSchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .required()
        .messages({
            'any.required': 'Passout year is required for stats',
        }),
});

// ============================================================================
// PARAM SCHEMA — reportId UUID
// ============================================================================

const reportIdParamSchema = Joi.object({
    reportId: Joi.string().uuid().required().messages({
        'string.guid': 'Report ID must be a valid UUID',
        'any.required': 'Report ID is required',
    }),
});

// ============================================================================
// PATCH /self-reports/:reportId/review — Body (approve or reject)
// ============================================================================

const reviewSelfReportSchema = Joi.object({
    action: Joi.string()
        .valid('approve', 'reject')
        .required()
        .messages({
            'any.only': 'Action must be either approve or reject',
            'any.required': 'Action is required',
        }),

    company_id: Joi.string()
        .uuid()
        .optional()
        .allow(null)
        .messages({
            'string.guid': 'Invalid company ID format',
        }),

    job_id: Joi.string()
        .uuid()
        .optional()
        .allow(null)
        .messages({
            'string.guid': 'Invalid job ID format',
        }),

    rejection_reason: Joi.string()
        .min(5)
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.min': 'Rejection reason must be at least 5 characters',
        }),
}).custom((value, helpers) => {
    if (value.action === 'approve' && !value.company_id) {
        return helpers.error('any.custom', {
            message: 'Company ID is required when approving a self-report',
        });
    }
    if (value.action === 'reject' && (!value.rejection_reason || value.rejection_reason.trim().length < 5)) {
        return helpers.error('any.custom', {
            message: 'Rejection reason (min 5 characters) is required when rejecting a self-report',
        });
    }
    return value;
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listSelfReportsSchema,
    selfReportStatsSchema,
    reportIdParamSchema,
    reviewSelfReportSchema,
};
