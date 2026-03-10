/**
 * ============================================================================
 * STUDENT EXPERIENCE VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - addExperienceSchema      POST /api/student/add_experience
 *   - updateExperienceSchema   PUT  /api/student/update_experience/:experienceId
 * ============================================================================
 */

const Joi = require('joi');

// Enum values matching schema CHECK constraints
const VALID_EMPLOYMENT_TYPES = ['internship', 'full-time', 'part-time', 'freelance', 'contract'];
const VALID_WORK_MODES = ['on-site', 'remote', 'hybrid'];

// ============================================================================
// ADD EXPERIENCE
// ============================================================================

const addExperienceSchema = Joi.object({
    company_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Company name is required',
            'string.min': 'Company name must be at least 2 characters',
            'string.max': 'Company name cannot exceed 200 characters',
            'any.required': 'Company name is required',
        }),

    company_website: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Company website must be a valid URL',
            'string.max': 'URL cannot exceed 500 characters',
        }),

    position_title: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Position title is required',
            'string.min': 'Position title must be at least 2 characters',
            'string.max': 'Position title cannot exceed 200 characters',
            'any.required': 'Position title is required',
        }),

    employment_type: Joi.string()
        .valid(...VALID_EMPLOYMENT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Employment type must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}`,
        }),

    job_description: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Job description cannot exceed 2000 characters',
        }),

    responsibilities: Joi.array()
        .items(Joi.string().max(200))
        .max(15)
        .optional()
        .allow(null)
        .default([])
        .messages({
            'array.max': 'Cannot list more than 15 responsibilities',
        }),

    technologies_used: Joi.array()
        .items(Joi.string().max(50))
        .max(20)
        .optional()
        .allow(null)
        .default([])
        .messages({
            'array.max': 'Cannot list more than 20 technologies',
        }),

    work_location: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Work location cannot exceed 200 characters',
        }),

    work_mode: Joi.string()
        .valid(...VALID_WORK_MODES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Work mode must be one of: ${VALID_WORK_MODES.join(', ')}`,
        }),

    start_date: Joi.date()
        .iso()
        .required()
        .messages({
            'date.format': 'Start date must be in YYYY-MM-DD format',
            'any.required': 'Start date is required',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'End date must be in YYYY-MM-DD format',
        }),

    is_current: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'is_current must be true or false',
        }),

    duration_months: Joi.number()
        .integer()
        .min(0)
        .max(120)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Duration cannot be negative',
            'number.max': 'Duration cannot exceed 120 months',
            'number.integer': 'Duration must be a whole number',
        }),

    stipend_amount: Joi.number()
        .min(0)
        .max(99999999.99)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Stipend amount cannot be negative',
            'number.max': 'Stipend amount is too large',
        }),

    offer_letter_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Offer letter URL must be a valid URL',
        }),

    completion_certificate_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Certificate URL must be a valid URL',
        }),
});

// ============================================================================
// UPDATE EXPERIENCE (all fields optional, at least 1 required)
// ============================================================================

const updateExperienceSchema = Joi.object({
    company_name: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Company name must be at least 2 characters',
            'string.max': 'Company name cannot exceed 200 characters',
        }),

    company_website: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Company website must be a valid URL',
        }),

    position_title: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Position title must be at least 2 characters',
            'string.max': 'Position title cannot exceed 200 characters',
        }),

    employment_type: Joi.string()
        .valid(...VALID_EMPLOYMENT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Employment type must be one of: ${VALID_EMPLOYMENT_TYPES.join(', ')}`,
        }),

    job_description: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Job description cannot exceed 2000 characters',
        }),

    responsibilities: Joi.array()
        .items(Joi.string().max(200))
        .max(15)
        .optional()
        .allow(null)
        .messages({
            'array.max': 'Cannot list more than 15 responsibilities',
        }),

    technologies_used: Joi.array()
        .items(Joi.string().max(50))
        .max(20)
        .optional()
        .allow(null)
        .messages({
            'array.max': 'Cannot list more than 20 technologies',
        }),

    work_location: Joi.string()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Work location cannot exceed 200 characters',
        }),

    work_mode: Joi.string()
        .valid(...VALID_WORK_MODES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Work mode must be one of: ${VALID_WORK_MODES.join(', ')}`,
        }),

    start_date: Joi.date()
        .iso()
        .optional()
        .messages({
            'date.format': 'Start date must be in YYYY-MM-DD format',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'End date must be in YYYY-MM-DD format',
        }),

    is_current: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_current must be true or false',
        }),

    duration_months: Joi.number()
        .integer()
        .min(0)
        .max(120)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Duration cannot be negative',
            'number.max': 'Duration cannot exceed 120 months',
        }),

    stipend_amount: Joi.number()
        .min(0)
        .max(99999999.99)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Stipend amount cannot be negative',
        }),

    offer_letter_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Offer letter URL must be a valid URL',
        }),

    completion_certificate_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Certificate URL must be a valid URL',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// PARAM SCHEMAS (URL params — UUID validation)
// ============================================================================

const experienceIdParamSchema = Joi.object({
    experienceId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid experience ID format',
        'any.required': 'Experience ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addExperienceSchema,
    updateExperienceSchema,
    experienceIdParamSchema,
};
