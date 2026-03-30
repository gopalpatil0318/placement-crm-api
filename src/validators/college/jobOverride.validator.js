/**
 * ============================================================================
 * COLLEGE JOB OVERRIDE VALIDATORS
 * ============================================================================
 *   - listJobOverridesSchema          GET  /get_job_override_requests/:jobId (query)
 *   - listAllOverridesSchema          GET  /get_all_override_requests (query)
 *   - reviewOverrideSchema            PATCH /review_override_request/:overrideId
 *   - bulkReviewOverrideSchema        POST /bulk_review_override_requests
 *   - jobIdParamSchema                Route params
 *   - overrideIdParamSchema           Route params
 * ============================================================================
 */

const Joi = require('joi');
const { OVERRIDE_STATUSES, REVIEW_ACTIONS } = require('../../config/constants');

// ============================================================================
// LIST JOB OVERRIDE REQUESTS (query)
// ============================================================================

const listJobOverridesSchema = Joi.object({
    status: Joi.string()
        .valid(...OVERRIDE_STATUSES)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${OVERRIDE_STATUSES.join(', ')}`,
        }),

    dept_name: Joi.string()
        .max(150)
        .trim()
        .optional(),

    sort_by: Joi.string()
        .valid('requested_at', 'student_name', 'dept_name', 'override_status')
        .optional()
        .default('requested_at'),

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
        .max(100)
        .optional()
        .default(20),
});

// ============================================================================
// LIST ALL OVERRIDE REQUESTS — Dashboard (query)
// ============================================================================

const listAllOverridesSchema = Joi.object({
    status: Joi.string()
        .valid(...OVERRIDE_STATUSES)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${OVERRIDE_STATUSES.join(', ')}`,
        }),

    job_id: Joi.string()
        .uuid()
        .optional()
        .messages({
            'string.guid': 'Invalid job ID format',
        }),

    dept_name: Joi.string()
        .max(150)
        .trim()
        .optional(),

    passout_year: Joi.number()
        .integer()
        .min(2000)
        .max(2040)
        .optional(),

    date_from: Joi.date()
        .iso()
        .optional(),

    date_to: Joi.date()
        .iso()
        .min(Joi.ref('date_from'))
        .optional()
        .messages({
            'date.min': 'date_to must be after date_from',
        }),

    sort_by: Joi.string()
        .valid('requested_at', 'student_name', 'job_title', 'override_status')
        .optional()
        .default('requested_at'),

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
        .max(100)
        .optional()
        .default(20),
});

// ============================================================================
// REVIEW OVERRIDE REQUEST (single)
// ============================================================================

const reviewOverrideSchema = Joi.object({
    action: Joi.string()
        .valid(...REVIEW_ACTIONS)
        .required()
        .messages({
            'any.only': 'Action must be "approve" or "reject"',
            'any.required': 'Action is required',
        }),

    review_notes: Joi.string()
        .max(1000)
        .trim()
        .optional()
        .allow(null, ''),

    rejection_reason: Joi.when('action', {
        is: 'reject',
        then: Joi.string()
            .min(5)
            .max(500)
            .trim()
            .required()
            .messages({
                'string.empty': 'Rejection reason is required when rejecting',
                'string.min': 'Rejection reason must be at least 5 characters',
                'any.required': 'Rejection reason is required when rejecting',
            }),
        otherwise: Joi.string()
            .max(500)
            .trim()
            .optional()
            .allow(null, ''),
    }),
});

// ============================================================================
// BULK REVIEW OVERRIDE REQUESTS
// ============================================================================

const bulkReviewOverrideSchema = Joi.object({
    override_ids: Joi.array()
        .items(Joi.string().uuid())
        .min(1)
        .max(100)
        .required()
        .messages({
            'array.min': 'At least one override ID is required',
            'array.max': 'Cannot process more than 100 override requests at once',
            'any.required': 'Override IDs are required',
        }),

    action: Joi.string()
        .valid(...REVIEW_ACTIONS)
        .required()
        .messages({
            'any.only': 'Action must be "approve" or "reject"',
            'any.required': 'Action is required',
        }),

    review_notes: Joi.string()
        .max(1000)
        .trim()
        .optional()
        .allow(null, ''),

    rejection_reason: Joi.when('action', {
        is: 'reject',
        then: Joi.string()
            .min(5)
            .max(500)
            .trim()
            .required()
            .messages({
                'string.empty': 'Rejection reason is required when bulk-rejecting',
                'string.min': 'Rejection reason must be at least 5 characters',
                'any.required': 'Rejection reason is required when bulk-rejecting',
            }),
        otherwise: Joi.string()
            .max(500)
            .trim()
            .optional()
            .allow(null, ''),
    }),
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

const overrideIdParamSchema = Joi.object({
    overrideId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid override ID format',
            'any.required': 'Override ID is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listJobOverridesSchema,
    listAllOverridesSchema,
    reviewOverrideSchema,
    bulkReviewOverrideSchema,
    jobIdParamSchema,
    overrideIdParamSchema,
};
