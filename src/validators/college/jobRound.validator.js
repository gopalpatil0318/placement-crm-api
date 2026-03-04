/**
 * ============================================================================
 * JOB ROUND VALIDATORS — Joi Schemas for Selection Round Management
 * ============================================================================
 *   - addRoundSchema              POST  /add_job_round/:jobId
 *   - updateRoundSchema           PUT   /update_round/:roundId
 *   - updateRoundStatusSchema     PATCH /update_round_status/:roundId
 * ============================================================================
 */

const Joi = require('joi');

const ROUND_TYPES = ['aptitude', 'technical', 'hr', 'group_discussion', 'coding', 'other'];
const ROUND_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

// ============================================================================
// ADD ROUND
// ============================================================================

const addRoundSchema = Joi.object({
    round_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Round name is required',
            'string.min': 'Round name must be at least 2 characters',
            'string.max': 'Round name cannot exceed 200 characters',
            'any.required': 'Round name is required',
        }),

    round_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Round description cannot exceed 1000 characters',
        }),

    round_type: Joi.string()
        .valid(...ROUND_TYPES)
        .optional()
        .allow(null, '')
        .messages({
            'any.only': `Round type must be one of: ${ROUND_TYPES.join(', ')}`,
        }),

    round_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Round date must be a valid ISO date (e.g., 2026-03-15T10:00:00)',
        }),

    round_venue: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Round venue cannot exceed 500 characters',
        }),
});

// ============================================================================
// UPDATE ROUND
// ============================================================================

const updateRoundSchema = Joi.object({
    round_name: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Round name must be at least 2 characters',
            'string.max': 'Round name cannot exceed 200 characters',
        }),

    round_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Round description cannot exceed 1000 characters',
        }),

    round_type: Joi.string()
        .valid(...ROUND_TYPES)
        .optional()
        .allow(null, '')
        .messages({
            'any.only': `Round type must be one of: ${ROUND_TYPES.join(', ')}`,
        }),

    round_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Round date must be a valid ISO date',
        }),

    round_venue: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Round venue cannot exceed 500 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// UPDATE ROUND STATUS
// ============================================================================

const updateRoundStatusSchema = Joi.object({
    round_status: Joi.string()
        .valid(...ROUND_STATUSES)
        .required()
        .messages({
            'any.only': `Round status must be one of: ${ROUND_STATUSES.join(', ')}`,
            'any.required': 'Round status is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addRoundSchema,
    updateRoundSchema,
    updateRoundStatusSchema,
};
