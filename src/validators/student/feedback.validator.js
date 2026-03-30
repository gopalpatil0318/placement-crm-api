/**
 * ============================================================================
 * STUDENT FEEDBACK & INTERVIEW QUESTIONS VALIDATORS
 * ============================================================================
 * Joi schemas for APIs #172–#175
 * ============================================================================
 */

const Joi = require('joi');

// ── POST /submit_feedback ─────────────────────────────────────────────────
const submitFeedbackSchema = Joi.object({
  job_id: Joi.string().uuid().required()
    .messages({
      'any.required': 'Job ID is required',
      'string.guid': 'Invalid job ID format',
    }),

  company_id: Joi.string().uuid().required()
    .messages({
      'any.required': 'Company ID is required',
      'string.guid': 'Invalid company ID format',
    }),

  rating: Joi.number().integer().min(1).max(5).required()
    .messages({
      'any.required': 'Rating is required',
      'number.min': 'Rating must be between 1 and 5',
      'number.max': 'Rating must be between 1 and 5',
    }),

  feedback_text: Joi.string().max(3000).trim().allow(null, '')
    .messages({ 'string.max': 'Feedback text cannot exceed 3000 characters' }),

  is_anonymous: Joi.boolean().default(false),
});

// ── GET /get_my_feedback ──────────────────────────────────────────────────
const getMyFeedbackSchema = Joi.object({
  sort_by: Joi.string().valid('created_at', 'rating').default('created_at')
    .messages({ 'any.only': 'Sort by must be created_at or rating' }),

  sort_order: Joi.string().valid('asc', 'desc').default('desc')
    .messages({ 'any.only': 'Sort order must be asc or desc' }),

  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(20),
});

// ── POST /submit_interview_question ───────────────────────────────────────
const submitInterviewQuestionSchema = Joi.object({
  company_id: Joi.string().uuid().required()
    .messages({
      'any.required': 'Company ID is required',
      'string.guid': 'Invalid company ID format',
    }),

  job_id: Joi.string().uuid().required()
    .messages({
      'any.required': 'Job ID is required',
      'string.guid': 'Invalid job ID format',
    }),

  question_description: Joi.string().min(5).max(2000).trim().required()
    .messages({
      'any.required': 'Question description is required',
      'string.min': 'Question must be at least 5 characters',
      'string.max': 'Question cannot exceed 2000 characters',
    }),

  topic: Joi.string().max(100).trim().allow(null, '')
    .messages({ 'string.max': 'Topic cannot exceed 100 characters' }),

  sample_answer: Joi.string().max(3000).trim().allow(null, '')
    .messages({ 'string.max': 'Sample answer cannot exceed 3000 characters' }),
});

// ── GET /browse_interview_questions ───────────────────────────────────────
const browseInterviewQuestionsSchema = Joi.object({
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

module.exports = {
  submitFeedbackSchema,
  getMyFeedbackSchema,
  submitInterviewQuestionSchema,
  browseInterviewQuestionsSchema,
};
