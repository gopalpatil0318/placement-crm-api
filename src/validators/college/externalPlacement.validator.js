/**
 * ============================================================================
 * EXTERNAL PLACEMENT VALIDATOR — Joi Schema for Record External Placement
 * ============================================================================
 *   POST /api/college/record_external_placement
 * ============================================================================
 */

const Joi = require('joi');
const { DRIVE_TYPES, PLACEMENT_TYPES } = require('../../config/constants');

const recordExternalPlacementSchema = Joi.object({
    student_id: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid student ID format',
            'any.required': 'Student is required',
        }),

    company_id: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid company ID format',
            'any.required': 'Company is required',
        }),

    job_id: Joi.string()
        .uuid()
        .optional()
        .allow(null)
        .messages({
            'string.guid': 'Invalid job ID format',
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

    job_location: Joi.string()
        .max(300)
        .optional()
        .default('External'),

    job_type: Joi.string()
        .valid('full-time', 'internship', 'both')
        .optional(),

    drive_type: Joi.string()
        .valid(...DRIVE_TYPES)
        .optional()
        .default('off_campus')
        .messages({
            'any.only': `Drive type must be one of: ${DRIVE_TYPES.join(', ')}`,
        }),

    placement_type: Joi.string()
        .valid(...PLACEMENT_TYPES)
        .required()
        .messages({
            'any.only': `Placement type must be one of: ${PLACEMENT_TYPES.join(', ')}`,
            'any.required': 'Placement type is required',
        }),

    fulltime_package: Joi.number()
        .min(0)
        .max(99999999)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Package must be at least 0',
        }),

    fulltime_designation: Joi.string()
        .max(200)
        .optional()
        .allow(null, ''),

    fulltime_joining_date: Joi.date()
        .iso()
        .optional()
        .allow(null),

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

    offer_letter_url: Joi.string()
        .max(2048)
        .optional()
        .allow(null, ''),

    joining_letter_url: Joi.string()
        .max(2048)
        .optional()
        .allow(null, ''),

    remarks: Joi.string()
        .max(2000)
        .optional()
        .allow(null, ''),

    passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional()
        .allow(null),
}).custom((value, helpers) => {
    const isFulltime = value.placement_type === 'full-time' || value.placement_type === 'both';
    const isInternship = value.placement_type === 'internship' || value.placement_type === 'both';

    if (isFulltime && (value.fulltime_package == null || value.fulltime_package === '')) {
        return helpers.error('any.custom', { message: 'Package is required for full-time placements' });
    }
    if (isInternship && (value.internship_stipend == null || value.internship_stipend === '')) {
        return helpers.error('any.custom', { message: 'Stipend is required for internship placements' });
    }
    return value;
});

module.exports = {
    recordExternalPlacementSchema,
};
