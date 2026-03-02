/**
 * ============================================================================
 * JOB CRITERIA VALIDATORS — Joi Schemas for Eligibility Criteria Management
 * ============================================================================
 *   - setCriteriaSchema              POST /set_job_criteria/:jobId
 *   - updateCriteriaSchema           PUT  /update_job_criteria/:jobId
 *   - getEligibleStudentsSchema      GET  /get_eligible_students/:jobId (query)
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// SET CRITERIA (all optional — only provided fields become filters)
// ============================================================================

const setCriteriaSchema = Joi.object({
    min_overall_cgpa: Joi.number()
        .min(0)
        .max(10)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'CGPA cannot be negative',
            'number.max': 'CGPA cannot exceed 10',
        }),

    max_live_kts: Joi.number()
        .integer()
        .min(0)
        .max(20)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Live KTs cannot be negative',
            'number.max': 'Live KTs cannot exceed 20',
        }),

    min_tenth_percentage: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Percentage cannot be negative',
            'number.max': 'Percentage cannot exceed 100',
        }),

    min_twelfth_percentage: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .allow(null),

    min_diploma_percentage: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .allow(null),

    allowed_genders: Joi.array()
        .items(Joi.string().valid('Male', 'Female', 'Other'))
        .optional()
        .allow(null)
        .messages({
            'any.only': 'Gender must be Male, Female, or Other',
        }),

    allowed_departments: Joi.array()
        .items(Joi.string().max(150))
        .optional()
        .allow(null),

    allowed_gap_statuses: Joi.array()
        .items(Joi.string())
        .optional()
        .allow(null),

    min_existing_package: Joi.number()
        .min(0)
        .optional()
        .allow(null),

    max_existing_package: Joi.number()
        .min(0)
        .optional()
        .allow(null),

    exclude_already_placed: Joi.boolean()
        .optional()
        .default(false),
}).min(1).messages({
    'object.min': 'At least one eligibility criterion must be provided',
});

// ============================================================================
// UPDATE CRITERIA (same schema, at least 1 field)
// ============================================================================

const updateCriteriaSchema = setCriteriaSchema;

// ============================================================================
// GET ELIGIBLE STUDENTS (query params)
// ============================================================================

const getEligibleStudentsSchema = Joi.object({
    search: Joi.string()
        .max(100)
        .optional(),

    dept_name: Joi.string()
        .max(150)
        .optional(),

    page: Joi.number()
        .positive()
        .optional()
        .default(1),

    limit: Joi.number()
        .positive()
        .max(100)
        .optional()
        .default(50),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setCriteriaSchema,
    updateCriteriaSchema,
    getEligibleStudentsSchema,
};
