/**
 * ============================================================================
 * STUDENT FEEDBACK & INTERVIEW QUESTIONS ROUTES
 * ============================================================================
 * Routes for APIs #172–#175
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/feedback.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
  submitFeedbackSchema,
  getMyFeedbackSchema,
  submitInterviewQuestionSchema,
  submitInterviewQuestionsSchema,
  browseInterviewQuestionsSchema,
} = require('../../validators/student/feedback.validator');

// All routes require student authentication + rate limiting
router.use(authenticate, apiLimiter);

// #172 — Submit placement feedback
router.post(
  '/submit_feedback',
  validate(submitFeedbackSchema),
  asyncHandler(controller.submitFeedback)
);

// #173 — View own submitted feedback
router.get(
  '/get_my_feedback',
  validate(getMyFeedbackSchema, 'query'),
  asyncHandler(controller.getMyFeedback)
);

// #174 — Submit interview question
router.post(
  '/submit_interview_question',
  validate(submitInterviewQuestionSchema),
  asyncHandler(controller.submitInterviewQuestion)
);

// #175 — Browse approved interview questions
router.get(
  '/browse_interview_questions',
  validate(browseInterviewQuestionsSchema, 'query'),
  asyncHandler(controller.browseInterviewQuestions)
);

// #176 — Get applied companies & jobs (for submit form dropdowns)
router.get(
  '/applied_job_options',
  asyncHandler(controller.getAppliedJobOptions)
);

// #177 — Batch submit interview questions
router.post(
  '/submit_interview_questions',
  validate(submitInterviewQuestionsSchema),
  asyncHandler(controller.submitInterviewQuestions)
);

// #178 — Get companies with approved interview questions
router.get(
  '/interview_question_companies',
  asyncHandler(controller.getInterviewQuestionCompanies)
);

module.exports = router;
