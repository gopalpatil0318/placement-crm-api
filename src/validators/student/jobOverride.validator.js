/**
 * ============================================================================
 * STUDENT JOB OVERRIDE VALIDATORS
 * ============================================================================
 *   - requestOverrideSchema        POST /request_job_override/:jobId
 *   - listMyOverridesSchema        GET  /get_my_override_requests (query)
 *   - jobIdParamSchema             Route params
 * ============================================================================
 */

const Joi = require('joi');
const { OVERRIDE_STATUSES } = require('../../config/constants');

// ============================================================================
// REQUEST OVERRIDE
// ============================================================================

const requestOverrideSchema = Joi.object({
    request_reason: Joi.string()
        .trim()
        .min(20)
        .max(2000)
        .required()
        .messages({
            'string.empty': 'Request reason is required',
            'string.min': 'Request reason must be at least 20 characters. Please provide enough context for the college to review your request.',
            'string.max': 'Request reason cannot exceed 2000 characters',
            'any.required': 'Request reason is required',
        }),
});

// ============================================================================
// LIST MY OVERRIDE REQUESTS (query params)
// ============================================================================

const listMyOverridesSchema = Joi.object({
    status: Joi.string()
        .valid(...OVERRIDE_STATUSES)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${OVERRIDE_STATUSES.join(', ')}`,
        }),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc'),

    page: Joi.number()
        .integer()
        .min(1)
        .optional()
        .default(1),

    limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .optional()
        .default(10),
});

// ============================================================================
// PARAMS
// ============================================================================

const jobIdParamSchema = Joi.object({
    jobId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid job ID format',
            'any.required': 'Job ID is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    requestOverrideSchema,
    listMyOverridesSchema,
    jobIdParamSchema,
};
