/**
 * ============================================================================
 * VERIFICATION VALIDATORS — Joi Schemas for Verification APIs
 * ============================================================================
 *   - pendingListSchema          GET  pending lists (query params)
 *   - verifyActionSchema         PATCH single verify (body)
 *   - bulkVerifySchema           PATCH bulk verify (body)
 *   - studentIdParamSchema       :studentId param
 *   - experienceIdParamSchema    :experienceId param
 *   - achievementIdParamSchema   :achievementId param
 *   - certificateIdParamSchema   :certificateId param
 * ============================================================================
 */

const Joi = require('joi');
const { STATUS } = require('../../config/constants');

// ============================================================================
// PENDING LIST QUERY (shared by all 4 pending list endpoints)
// ============================================================================

const pendingListSchema = Joi.object({
    page: Joi.number().positive().optional().default(1),
    limit: Joi.number().positive().max(100).optional().default(20),
    search: Joi.string().trim().max(100).optional(),
    dept_id: Joi.string().uuid().optional().messages({
        'string.guid': 'Invalid department ID format',
    }),
    student_passout_year: Joi.number().integer().min(2020).max(2040).optional(),
    sort_by: Joi.string().trim().valid('created_at', 'updated_at', 'first_name', 'last_name').optional().default('created_at'),
    sort_order: Joi.string().trim().valid('ASC', 'DESC', 'asc', 'desc').optional().default('DESC'),
});

// ============================================================================
// SINGLE VERIFY ACTION (approve or reject)
// ============================================================================

const verifyActionSchema = Joi.object({
    action: Joi.string()
        .valid(STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED)
        .required()
        .messages({
            'any.only': 'Action must be "approved" or "rejected"',
            'any.required': 'Action is required',
        }),
    rejection_reason: Joi.string()
        .trim()
        .max(500)
        .when('action', {
            is: STATUS.VERIFICATION.REJECTED,
            then: Joi.required(),
            otherwise: Joi.optional().allow(null, ''),
        })
        .messages({
            'any.required': 'Rejection reason is required when rejecting',
            'string.max': 'Rejection reason must not exceed 500 characters',
        }),
});

// ============================================================================
// BULK VERIFY (approve or reject multiple IDs)
// ============================================================================

const bulkVerifySchema = Joi.object({
    ids: Joi.array()
        .items(Joi.string().uuid().messages({ 'string.guid': 'Each ID must be a valid UUID' }))
        .min(1)
        .max(100)
        .required()
        .messages({
            'array.min': 'At least one ID is required',
            'array.max': 'Maximum 100 items allowed per bulk operation',
            'any.required': 'IDs array is required',
        }),
    action: Joi.string()
        .valid(STATUS.VERIFICATION.APPROVED, STATUS.VERIFICATION.REJECTED)
        .required()
        .messages({
            'any.only': 'Action must be "approved" or "rejected"',
            'any.required': 'Action is required',
        }),
    rejection_reason: Joi.string()
        .trim()
        .max(500)
        .when('action', {
            is: STATUS.VERIFICATION.REJECTED,
            then: Joi.required(),
            otherwise: Joi.optional().allow(null, ''),
        })
        .messages({
            'any.required': 'Rejection reason is required when rejecting',
            'string.max': 'Rejection reason must not exceed 500 characters',
        }),
});

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

const studentIdParamSchema = Joi.object({
    studentId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid student ID format',
        'any.required': 'Student ID is required',
    }),
});

const experienceIdParamSchema = Joi.object({
    experienceId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid experience ID format',
        'any.required': 'Experience ID is required',
    }),
});

const achievementIdParamSchema = Joi.object({
    achievementId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid achievement ID format',
        'any.required': 'Achievement ID is required',
    }),
});

const certificateIdParamSchema = Joi.object({
    certificateId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid certificate ID format',
        'any.required': 'Certificate ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    pendingListSchema,
    verifyActionSchema,
    bulkVerifySchema,
    studentIdParamSchema,
    experienceIdParamSchema,
    achievementIdParamSchema,
    certificateIdParamSchema,
};
