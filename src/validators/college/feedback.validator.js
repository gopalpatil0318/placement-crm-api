/**
 * ============================================================================
 * COLLEGE FEEDBACK & INTERVIEW QUESTIONS VALIDATORS
 * ============================================================================
 * Joi schemas for APIs #99–#102
 * ============================================================================
 */

const Joi = require('joi');

// ── GET /get_all_feedback ──────────────────────────────────────────────────
const getAllFeedbackSchema = Joi.object({
  is_approved: Joi.boolean()
    .messages({ 'boolean.base': 'is_approved must be true or false' }),

  company_id: Joi.string().uuid()
    .messages({ 'string.guid': 'Invalid company ID format' }),

  job_id: Joi.string().uuid()
    .messages({ 'string.guid': 'Invalid job ID format' }),

  rating: Joi.number().integer().min(1).max(5)
    .messages({
      'number.min': 'Rating must be between 1 and 5',
      'number.max': 'Rating must be between 1 and 5',
    }),

  search: Joi.string().max(100).trim()
    .messages({ 'string.max': 'Search query too long (max 100 chars)' }),

  sort_by: Joi.string().valid('created_at', 'rating').default('created_at')
    .messages({ 'any.only': 'Sort by must be created_at or rating' }),

  sort_order: Joi.string().valid('asc', 'desc').default('desc')
    .messages({ 'any.only': 'Sort order must be asc or desc' }),

  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// ── PATCH /approve_feedback/:feedbackId ────────────────────────────────────
const approveFeedbackSchema = Joi.object({
  is_approved: Joi.boolean().required()
    .messages({
      'any.required': 'is_approved is required',
      'boolean.base': 'is_approved must be true or false',
    }),
});

// ── GET /get_all_interview_questions ───────────────────────────────────────
const getAllInterviewQuestionsSchema = Joi.object({
  is_approved: Joi.boolean()
    .messages({ 'boolean.base': 'is_approved must be true or false' }),

  company_id: Joi.string().uuid()
    .messages({ 'string.guid': 'Invalid company ID format' }),

  job_id: Joi.string().uuid()
    .messages({ 'string.guid': 'Invalid job ID format' }),

  topic: Joi.string().max(100).trim()
    .messages({ 'string.max': 'Topic filter too long (max 100 chars)' }),

  search: Joi.string().max(100).trim()
    .messages({ 'string.max': 'Search query too long (max 100 chars)' }),

  sort_by: Joi.string().valid('created_at', 'topic').default('created_at')
    .messages({ 'any.only': 'Sort by must be created_at or topic' }),

  sort_order: Joi.string().valid('asc', 'desc').default('desc')
    .messages({ 'any.only': 'Sort order must be asc or desc' }),

  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// ── PATCH /approve_interview_question/:questionId ─────────────────────────
const approveInterviewQuestionSchema = Joi.object({
  is_approved: Joi.boolean().required()
    .messages({
      'any.required': 'is_approved is required',
      'boolean.base': 'is_approved must be true or false',
    }),
});

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

const feedbackIdParamSchema = Joi.object({
    feedbackId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid feedback ID format',
        'any.required': 'Feedback ID is required',
    }),
});

const questionIdParamSchema = Joi.object({
    questionId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid question ID format',
        'any.required': 'Question ID is required',
    }),
});

module.exports = {
  getAllFeedbackSchema,
  approveFeedbackSchema,
  getAllInterviewQuestionsSchema,
  approveInterviewQuestionSchema,
  feedbackIdParamSchema,
  questionIdParamSchema,
};
