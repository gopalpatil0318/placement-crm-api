/**
 * ============================================================================
 * JOB POSITION VALIDATORS — Joi Schemas for Position Management
 * ============================================================================
 *   - addPositionSchema              POST  /add_job_position/:jobId
 *   - updatePositionSchema           PUT   /update_position/:positionId
 *   - updatePositionStatusSchema     PATCH /update_position_status/:positionId
 * ============================================================================
 */

const Joi = require('joi');

const POSITION_STATUSES = ['active', 'inactive', 'filled'];

// ============================================================================
// ADD POSITION
// ============================================================================

const addPositionSchema = Joi.object({
    position_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Position name is required',
            'string.min': 'Position name must be at least 2 characters',
            'string.max': 'Position name cannot exceed 200 characters',
            'any.required': 'Position name is required',
        }),

    position_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Position description cannot exceed 1000 characters',
        }),

    vacancies: Joi.number()
        .integer()
        .min(1)
        .max(9999)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Vacancies must be at least 1',
            'number.max': 'Vacancies cannot exceed 9999',
        }),
});

// ============================================================================
// UPDATE POSITION
// ============================================================================

const updatePositionSchema = Joi.object({
    position_name: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Position name must be at least 2 characters',
            'string.max': 'Position name cannot exceed 200 characters',
        }),

    position_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Position description cannot exceed 1000 characters',
        }),

    vacancies: Joi.number()
        .integer()
        .min(1)
        .max(9999)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Vacancies must be at least 1',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// UPDATE POSITION STATUS
// ============================================================================

const updatePositionStatusSchema = Joi.object({
    position_status: Joi.string()
        .valid(...POSITION_STATUSES)
        .required()
        .messages({
            'any.only': `Position status must be one of: ${POSITION_STATUSES.join(', ')}`,
            'any.required': 'Position status is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addPositionSchema,
    updatePositionSchema,
    updatePositionStatusSchema,
};
