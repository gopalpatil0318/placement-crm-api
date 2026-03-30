/**
 * ============================================================================
 * STUDENT JOB VALIDATOR — Joi Schemas for Job Browsing & Applications
 * ============================================================================
 * Endpoints:
 *   GET   /get_available_jobs                         — listAvailableJobsSchema (query)
 *   GET   /get_job_details/:jobId                     — (params only, no body/query)
 *   GET   /check_job_eligibility/:jobId               — (params only)
 *   POST  /apply_for_job/:jobId                       — applyForJobSchema (body)
 *   POST  /deny_job/:jobId                            — denyJobSchema (body)
 *   GET   /get_my_applications                        — listMyApplicationsSchema (query)
 *   GET   /get_application_details/:applicationId     — (params only)
 *   PATCH /withdraw_application/:applicationId        — withdrawApplicationSchema (body)
 * ============================================================================
 */

const Joi = require('joi');
const { JOB_TYPES, STATUS } = require('../../config/constants');

// ============================================================================
// GET /get_available_jobs — Query params
// ============================================================================

const listAvailableJobsSchema = Joi.object({
    // Filters
    search: Joi.string().max(200).optional().allow(''),
    job_type: Joi.string().valid(...JOB_TYPES).optional(),
    company_name: Joi.string().max(200).optional().allow(''),

    // Sorting
    sort_by: Joi.string()
        .valid('application_deadline', 'created_at', 'job_title', 'company_name', 'salary_min')
        .optional()
        .default('application_deadline'),
    sort_order: Joi.string().valid('asc', 'desc').optional().default('asc'),

    // Pagination
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(200).optional().default(10),
});

// ============================================================================
// POST /apply_for_job/:jobId — Body
// ============================================================================

const applyForJobSchema = Joi.object({
    position_id: Joi.string().uuid().optional().allow(null),
    answers: Joi.array()
        .items(
            Joi.object({
                question_id: Joi.string().uuid().required(),
                answer_text: Joi.string().max(5000).optional().allow(null, ''),
                answer_options: Joi.array().items(Joi.string().max(500)).max(50).optional().allow(null),
                answer_boolean: Joi.boolean().optional().allow(null),
            })
        )
        .max(100)
        .optional()
        .default([]),
});

// ============================================================================
// POST /deny_job/:jobId — Body
// ============================================================================

const denyJobSchema = Joi.object({
    denial_reason: Joi.string().min(3).max(500).required().messages({
        'string.empty': 'Denial reason is required',
        'string.min': 'Denial reason must be at least 3 characters',
        'any.required': 'Denial reason is required',
    }),
    additional_comments: Joi.string().max(2000).optional().allow(null, ''),
});

// ============================================================================
// GET /get_my_applications — Query params
// ============================================================================

const listMyApplicationsSchema = Joi.object({
    // Filters
    application_status: Joi.string()
        .valid(...Object.values(STATUS.APPLICATION))
        .optional(),

    // Sorting
    sort_by: Joi.string()
        .valid('applied_at', 'last_updated_at', 'application_status', 'job_title')
        .optional()
        .default('applied_at'),
    sort_order: Joi.string().valid('asc', 'desc').optional().default('desc'),

    // Pagination
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(200).optional().default(10),
});

// ============================================================================
// PATCH /withdraw_application/:applicationId — Body
// ============================================================================

const withdrawApplicationSchema = Joi.object({
    withdrawal_reason: Joi.string().max(1000).optional().allow(null, ''),
});

// ============================================================================
// PARAM SCHEMAS — jobId, applicationId
// ============================================================================

const jobIdParamSchema = Joi.object({
    jobId: Joi.string().uuid().required().messages({
        'string.guid': 'Job ID must be a valid UUID',
        'any.required': 'Job ID is required',
    }),
});

const applicationIdParamSchema = Joi.object({
    applicationId: Joi.string().uuid().required().messages({
        'string.guid': 'Application ID must be a valid UUID',
        'any.required': 'Application ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listAvailableJobsSchema,
    applyForJobSchema,
    denyJobSchema,
    listMyApplicationsSchema,
    withdrawApplicationSchema,
    jobIdParamSchema,
    applicationIdParamSchema,
};
