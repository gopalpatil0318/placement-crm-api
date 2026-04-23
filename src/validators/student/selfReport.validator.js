/**
 * ============================================================================
 * STUDENT SELF-REPORT VALIDATOR — Joi Schemas for Off-Campus Self-Reporting
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/self-report          — submitSchema (body)
 *   GET    /api/student/self-report           — listSchema (query)
 *   DELETE /api/student/self-report/:reportId — reportIdParamSchema (params)
 * ============================================================================
 */

const Joi = require('joi');
const { PLACEMENT_TYPES } = require('../../config/constants');

const SELF_REPORT_DRIVE_TYPES = ['off_campus', 'pool_campus'];

// ============================================================================
// POST /self-report — Body
// ============================================================================

const submitSelfReportSchema = Joi.object({
    // Company — either existing UUID or new name (combobox: pick or type new)
    company_id: Joi.string()
        .uuid()
        .optional()
        .allow(null)
        .messages({
            'string.guid': 'Invalid company ID format',
        }),

    company_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Company name is required',
            'string.min': 'Company name must be at least 2 characters',
            'any.required': 'Company name is required',
        }),

    job_title: Joi.string()
        .min(3)
        .max(300)
        .required()
        .messages({
            'string.empty': 'Job title is required',
            'string.min': 'Job title must be at least 3 characters',
            'any.required': 'Job title is required',
        }),

    placement_type: Joi.string()
        .valid(...PLACEMENT_TYPES)
        .required()
        .messages({
            'any.only': `Placement type must be one of: ${PLACEMENT_TYPES.join(', ')}`,
            'any.required': 'Placement type is required',
        }),

    drive_type: Joi.string()
        .valid(...SELF_REPORT_DRIVE_TYPES)
        .optional()
        .default('off_campus')
        .messages({
            'any.only': `Drive type must be one of: ${SELF_REPORT_DRIVE_TYPES.join(', ')}`,
        }),

    // Full-time fields (required when placement_type is full-time or both)
    fulltime_package: Joi.number()
        .min(0)
        .max(99999999)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Package must be at least 0',
            'number.max': 'Package seems too high — please verify',
        }),

    fulltime_designation: Joi.string()
        .max(200)
        .optional()
        .allow(null, ''),

    fulltime_joining_date: Joi.date()
        .iso()
        .optional()
        .allow(null),

    // Internship fields (required when placement_type is internship or both)
    internship_stipend: Joi.number()
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

    // Common fields
    job_location: Joi.string()
        .max(300)
        .optional()
        .default('External'),

    offer_date: Joi.date()
        .iso()
        .max('now')
        .optional()
        .allow(null)
        .messages({
            'date.max': 'Offer date cannot be in the future',
        }),

    offer_letter_url: Joi.string()
        .max(500)
        .optional()
        .allow(null, ''),

    remarks: Joi.string()
        .max(1000)
        .optional()
        .allow(null, ''),

    job_id: Joi.string()
        .uuid()
        .optional()
        .allow(null)
        .messages({
            'string.guid': 'Invalid job ID format',
        }),
}).custom((value, helpers) => {
    const isFulltime = value.placement_type === 'full-time' || value.placement_type === 'both';
    const isInternship = value.placement_type === 'internship' || value.placement_type === 'both';

    if (isFulltime && (value.fulltime_package === null || value.fulltime_package === undefined)) {
        return helpers.error('any.custom', {
            message: 'Package is required for full-time placements',
        });
    }
    if (isInternship && (value.internship_stipend === null || value.internship_stipend === undefined)) {
        return helpers.error('any.custom', {
            message: 'Stipend is required for internship placements',
        });
    }
    return value;
});

// ============================================================================
// GET /self-report — Query params
// ============================================================================

const listSelfReportsSchema = Joi.object({
    page: Joi.number().integer().min(1).max(10000).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
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
// EXPORTS
// ============================================================================

module.exports = {
    submitSelfReportSchema,
    listSelfReportsSchema,
    reportIdParamSchema,
};
