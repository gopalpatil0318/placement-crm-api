/**
 * ============================================================================
 * ELIGIBLE NOT APPLIED & DENIALS VALIDATORS — Joi Schemas
 * ============================================================================
 *   GET  /api/college/get_eligible_not_applied/:jobId  → listEligibleNotAppliedSchema
 *   POST /api/college/notify_eligible_students/:jobId  → notifyEligibleSchema
 *   GET  /api/college/get_job_denials/:jobId            → listDenialsSchema
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// LIST ELIGIBLE NOT APPLIED (query params)
// ============================================================================

const listEligibleNotAppliedSchema = Joi.object({
    search: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    dept_name: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    sort_by: Joi.string()
        .valid('student_name', 'student_email', 'overall_cgpa', 'dept_name')
        .optional()
        .default('overall_cgpa'),

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
        .default(10),
});

// ============================================================================
// NOTIFY ELIGIBLE STUDENTS
// ============================================================================

const notifyEligibleSchema = Joi.object({
    title: Joi.string()
        .trim()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Notification title is required',
            'string.min': 'Notification title must be at least 2 characters',
            'string.max': 'Notification title cannot exceed 200 characters',
            'any.required': 'Notification title is required',
        }),

    body: Joi.string()
        .trim()
        .min(2)
        .max(2000)
        .required()
        .messages({
            'string.empty': 'Notification body is required',
            'string.min': 'Notification body must be at least 2 characters',
            'string.max': 'Notification body cannot exceed 2000 characters',
            'any.required': 'Notification body is required',
        }),

    student_ids: Joi.array()
        .items(
            Joi.string().uuid().messages({
                'string.guid': 'Each student ID must be a valid UUID',
            })
        )
        .optional()
        .default([])
        .messages({
            'array.base': 'student_ids must be an array of UUIDs',
        }),
});

// ============================================================================
// LIST JOB DENIALS (query params)
// ============================================================================

const listDenialsSchema = Joi.object({
    search: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    sort_by: Joi.string()
        .valid('denied_at', 'student_name', 'denial_reason')
        .optional()
        .default('denied_at'),

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
        .default(10),
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

const jobIdParamSchema = Joi.object({
    jobId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid job ID format',
        'any.required': 'Job ID is required',
    }),
});

module.exports = {
    listEligibleNotAppliedSchema,
    notifyEligibleSchema,
    listDenialsSchema,
    jobIdParamSchema,
};
