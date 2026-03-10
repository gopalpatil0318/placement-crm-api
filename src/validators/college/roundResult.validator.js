/**
 * ============================================================================
 * ROUND RESULT VALIDATORS — Joi Schemas for Student Round Results
 * ============================================================================
 *   - addRoundResultSchema          POST   /add_round_result/:roundId
 *   - bulkAddRoundResultsSchema     POST   /bulk_add_round_results/:roundId
 *   - listRoundResultsSchema        GET    /get_round_results/:roundId
 *   - updateRoundResultSchema       PUT    /update_round_result/:resultId
 * ============================================================================
 */

const Joi = require('joi');

const RESULT_STATUSES = ['pending', 'passed', 'failed', 'on_hold', 'absent'];

// ============================================================================
// ADD SINGLE ROUND RESULT
// ============================================================================

const addRoundResultSchema = Joi.object({
    application_id: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid application ID format',
            'any.required': 'Application ID is required',
        }),

    result_status: Joi.string()
        .valid(...RESULT_STATUSES)
        .optional()
        .default('pending')
        .messages({
            'any.only': `Result status must be one of: ${RESULT_STATUSES.join(', ')}`,
        }),

    score: Joi.number()
        .precision(2)
        .min(0)
        .max(100000)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Score cannot be negative',
            'number.max': 'Score cannot exceed 100000',
        }),

    remarks: Joi.string()
        .max(2000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Remarks cannot exceed 2000 characters',
        }),

    attended: Joi.boolean()
        .optional()
        .default(false)
        .messages({
            'boolean.base': 'attended must be a boolean',
        }),

    scheduled_at: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'scheduled_at must be a valid ISO date-time',
        }),

    completed_at: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'completed_at must be a valid ISO date-time',
        }),
});

// ============================================================================
// BULK ADD ROUND RESULTS
// ============================================================================

const bulkResultItem = Joi.object({
    application_id: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid application ID format',
            'any.required': 'Application ID is required',
        }),

    result_status: Joi.string()
        .valid(...RESULT_STATUSES)
        .optional()
        .default('pending')
        .messages({
            'any.only': `Result status must be one of: ${RESULT_STATUSES.join(', ')}`,
        }),

    score: Joi.number()
        .precision(2)
        .min(0)
        .max(100000)
        .optional()
        .allow(null),

    remarks: Joi.string()
        .max(2000)
        .optional()
        .allow(null, ''),

    attended: Joi.boolean()
        .optional()
        .default(false),

    scheduled_at: Joi.date()
        .iso()
        .optional()
        .allow(null),

    completed_at: Joi.date()
        .iso()
        .optional()
        .allow(null),
});

const bulkAddRoundResultsSchema = Joi.object({
    results: Joi.array()
        .items(bulkResultItem)
        .min(1)
        .max(200)
        .required()
        .messages({
            'array.min': 'At least one result is required',
            'array.max': 'Cannot add more than 200 results at once',
            'any.required': 'results array is required',
        }),
});

// ============================================================================
// LIST ROUND RESULTS (query params)
// ============================================================================

const listRoundResultsSchema = Joi.object({
    result_status: Joi.string()
        .valid(...RESULT_STATUSES)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${RESULT_STATUSES.join(', ')}`,
        }),

    attended: Joi.string()
        .valid('true', 'false')
        .optional(),

    search: Joi.string()
        .max(200)
        .optional()
        .allow(''),

    sort_by: Joi.string()
        .valid('student_name', 'score', 'result_status', 'scheduled_at', 'completed_at', 'created_at')
        .optional()
        .default('created_at'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('asc'),

    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
});

// ============================================================================
// UPDATE ROUND RESULT
// ============================================================================

const updateRoundResultSchema = Joi.object({
    result_status: Joi.string()
        .valid(...RESULT_STATUSES)
        .optional()
        .messages({
            'any.only': `Result status must be one of: ${RESULT_STATUSES.join(', ')}`,
        }),

    score: Joi.number()
        .precision(2)
        .min(0)
        .max(100000)
        .optional()
        .allow(null),

    remarks: Joi.string()
        .max(2000)
        .optional()
        .allow(null, ''),

    attended: Joi.boolean()
        .optional(),

    scheduled_at: Joi.date()
        .iso()
        .optional()
        .allow(null),

    completed_at: Joi.date()
        .iso()
        .optional()
        .allow(null),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

const roundIdParamSchema = Joi.object({
    roundId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid round ID format',
        'any.required': 'Round ID is required',
    }),
});

const resultIdParamSchema = Joi.object({
    resultId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid result ID format',
        'any.required': 'Result ID is required',
    }),
});

module.exports = {
    addRoundResultSchema,
    bulkAddRoundResultsSchema,
    listRoundResultsSchema,
    updateRoundResultSchema,
    roundIdParamSchema,
    resultIdParamSchema,
};
