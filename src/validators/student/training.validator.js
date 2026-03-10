/**
 * ============================================================================
 * STUDENT TRAINING VALIDATOR — Joi Schemas for Training Programs (Own)
 * ============================================================================
 * Endpoints:
 *   GET  /get_available_training                        — listAvailableTrainingsSchema (query)
 *   POST /enroll_in_training/:programId                 — (no body needed)
 *   GET  /get_enrolled_training                         — listEnrolledTrainingsSchema (query)
 *   POST /submit_training_feedback/:enrollmentId        — submitFeedbackSchema (body)
 * ============================================================================
 */

const Joi = require('joi');

// Valid program types (matching DB CHECK constraint)
const PROGRAM_TYPES = [
    'aptitude', 'coding', 'soft_skills', 'interview_prep',
    'resume_building', 'technical', 'group_discussion', 'other',
];

// ============================================================================
// GET /get_available_training — Query params
// ============================================================================

const listAvailableTrainingsSchema = Joi.object({
    program_type: Joi.string()
        .valid(...PROGRAM_TYPES)
        .optional()
        .messages({
            'any.only': `Program type must be one of: ${PROGRAM_TYPES.join(', ')}`,
        }),

    search: Joi.string()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Search query cannot exceed 100 characters',
        }),

    sort_by: Joi.string()
        .valid('program_name', 'start_date', 'end_date', 'enrollment_deadline', 'created_at')
        .optional()
        .default('created_at'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc'),

    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// GET /get_enrolled_training — Query params
// ============================================================================

const listEnrolledTrainingsSchema = Joi.object({
    completion_status: Joi.string()
        .valid('enrolled', 'in_progress', 'completed', 'dropped', 'failed')
        .optional()
        .messages({
            'any.only': 'Completion status must be one of: enrolled, in_progress, completed, dropped, failed',
        }),

    sort_by: Joi.string()
        .valid('enrolled_at', 'completion_percentage', 'sessions_attended', 'program_name')
        .optional()
        .default('enrolled_at'),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc'),

    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(10),
});

// ============================================================================
// POST /submit_training_feedback/:enrollmentId — Body
// ============================================================================

const submitFeedbackSchema = Joi.object({
    student_rating: Joi.number()
        .integer()
        .min(1)
        .max(5)
        .required()
        .messages({
            'number.base': 'Rating must be a number',
            'number.min': 'Rating must be at least 1',
            'number.max': 'Rating cannot exceed 5',
            'any.required': 'Rating is required',
        }),

    student_feedback: Joi.string()
        .min(10)
        .max(2000)
        .required()
        .messages({
            'string.empty': 'Feedback text is required',
            'string.min': 'Feedback must be at least 10 characters',
            'string.max': 'Feedback cannot exceed 2000 characters',
            'any.required': 'Feedback text is required',
        }),
});

// ============================================================================
// PARAM — :programId
// ============================================================================

const programIdParamSchema = Joi.object({
    programId: Joi.string().uuid().required(),
});

// ============================================================================
// PARAM — :enrollmentId
// ============================================================================

const enrollmentIdParamSchema = Joi.object({
    enrollmentId: Joi.string().uuid().required(),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    listAvailableTrainingsSchema,
    listEnrolledTrainingsSchema,
    submitFeedbackSchema,
    programIdParamSchema,
    enrollmentIdParamSchema,
};
