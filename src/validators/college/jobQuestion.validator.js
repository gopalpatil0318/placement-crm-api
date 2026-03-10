/**
 * ============================================================================
 * APPLICATION QUESTION VALIDATORS — Joi Schemas for Job Question Management
 * ============================================================================
 *   - addQuestionSchema              POST   /add_job_question/:jobId
 *   - listQuestionsSchema            GET    /get_job_questions/:jobId
 *   - updateQuestionSchema           PUT    /update_question/:questionId
 * ============================================================================
 */

const Joi = require('joi');

const QUESTION_TYPES = ['mcq_single', 'mcq_multiple', 'text', 'essay', 'yes_no'];
const MCQ_TYPES = ['mcq_single', 'mcq_multiple'];

// ============================================================================
// CUSTOM VALIDATION — MCQ options validation
// ============================================================================

/**
 * If question_type is mcq_single or mcq_multiple, question_options is required
 * and must be an array of at least 2 option strings.
 * If question_type is text, essay, or yes_no, question_options must be null/absent.
 */
const questionOptionsRule = (value, helpers) => {
    const { question_type } = helpers.state.ancestors[0];

    if (MCQ_TYPES.includes(question_type)) {
        // MCQ types MUST have options
        if (!value || !Array.isArray(value) || value.length < 2) {
            return helpers.error('custom.mcqOptionsRequired');
        }
        // Validate each option is a non-empty string
        for (let i = 0; i < value.length; i++) {
            if (typeof value[i] !== 'string' || value[i].trim().length === 0) {
                return helpers.error('custom.mcqOptionInvalid', { index: i + 1 });
            }
        }
        // Check for duplicate options (case-insensitive)
        const lowerOptions = value.map(o => o.trim().toLowerCase());
        const uniqueOptions = new Set(lowerOptions);
        if (uniqueOptions.size !== lowerOptions.length) {
            return helpers.error('custom.mcqOptionsDuplicate');
        }
    } else if (question_type) {
        // Non-MCQ types should NOT have options (set to null)
        if (value && Array.isArray(value) && value.length > 0) {
            return helpers.error('custom.nonMcqNoOptions');
        }
    }

    return value;
};

// ============================================================================
// ADD QUESTION
// ============================================================================

const addQuestionSchema = Joi.object({
    question_text: Joi.string()
        .min(5)
        .max(2000)
        .required()
        .messages({
            'string.empty': 'Question text is required',
            'string.min': 'Question text must be at least 5 characters',
            'string.max': 'Question text cannot exceed 2000 characters',
            'any.required': 'Question text is required',
        }),

    question_type: Joi.string()
        .valid(...QUESTION_TYPES)
        .required()
        .messages({
            'any.only': `Question type must be one of: ${QUESTION_TYPES.join(', ')}`,
            'any.required': 'Question type is required',
        }),

    question_options: Joi.alternatives()
        .conditional('question_type', {
            is: Joi.string().valid(...MCQ_TYPES),
            then: Joi.array()
                .items(Joi.string().trim().min(1).max(500))
                .min(2)
                .max(20)
                .required()
                .messages({
                    'array.min': 'MCQ questions must have at least 2 options',
                    'array.max': 'MCQ questions cannot have more than 20 options',
                    'any.required': 'Options are required for MCQ questions',
                }),
            otherwise: Joi.any()
                .valid(null)
                .optional()
                .default(null)
                .messages({
                    'any.only': 'Options should not be provided for non-MCQ question types',
                }),
        })
        .custom(questionOptionsRule)
        .messages({
            'custom.mcqOptionsRequired': 'MCQ questions must have at least 2 options',
            'custom.mcqOptionInvalid': 'Option {{#index}} must be a non-empty string',
            'custom.mcqOptionsDuplicate': 'Duplicate options are not allowed',
            'custom.nonMcqNoOptions': 'Options should not be provided for text, essay, or yes/no questions',
        }),

    is_required: Joi.boolean()
        .optional()
        .default(true)
        .messages({
            'boolean.base': 'is_required must be a boolean (true/false)',
        }),
});

// ============================================================================
// LIST QUESTIONS (query params — no params needed, just jobId in URL)
// ============================================================================

const listQuestionsSchema = Joi.object({
    // No query params needed — all questions for a job are returned ordered
});

// ============================================================================
// UPDATE QUESTION
// ============================================================================

const updateQuestionSchema = Joi.object({
    question_text: Joi.string()
        .min(5)
        .max(2000)
        .optional()
        .messages({
            'string.min': 'Question text must be at least 5 characters',
            'string.max': 'Question text cannot exceed 2000 characters',
        }),

    question_type: Joi.string()
        .valid(...QUESTION_TYPES)
        .optional()
        .messages({
            'any.only': `Question type must be one of: ${QUESTION_TYPES.join(', ')}`,
        }),

    question_options: Joi.alternatives()
        .conditional('question_type', {
            is: Joi.string().valid(...MCQ_TYPES),
            then: Joi.array()
                .items(Joi.string().trim().min(1).max(500))
                .min(2)
                .max(20)
                .required()
                .messages({
                    'array.min': 'MCQ questions must have at least 2 options',
                    'array.max': 'MCQ questions cannot have more than 20 options',
                    'any.required': 'Options are required when changing to MCQ type',
                }),
            otherwise: Joi.any()
                .valid(null)
                .optional()
                .default(null),
        })
        .custom(questionOptionsRule)
        .messages({
            'custom.mcqOptionsRequired': 'MCQ questions must have at least 2 options',
            'custom.mcqOptionInvalid': 'Option {{#index}} must be a non-empty string',
            'custom.mcqOptionsDuplicate': 'Duplicate options are not allowed',
            'custom.nonMcqNoOptions': 'Options should not be provided for non-MCQ question types',
        }),

    is_required: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_required must be a boolean (true/false)',
        }),

    question_order: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .optional()
        .messages({
            'number.min': 'Question order must be at least 1',
            'number.max': 'Question order cannot exceed 100',
            'number.integer': 'Question order must be a whole number',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS — UUID validation for route parameters
// ============================================================================

const jobIdParamSchema = Joi.object({
    jobId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid job ID format',
        'any.required': 'Job ID is required',
    }),
});

const questionIdParamSchema = Joi.object({
    questionId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid question ID format',
        'any.required': 'Question ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addQuestionSchema,
    listQuestionsSchema,
    updateQuestionSchema,
    jobIdParamSchema,
    questionIdParamSchema,
};
