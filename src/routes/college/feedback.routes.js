/**
 * ============================================================================
 * COLLEGE FEEDBACK & INTERVIEW QUESTIONS ROUTES
 * ============================================================================
 * Routes for APIs #99–#102
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/feedback.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
  getAllFeedbackSchema,
  approveFeedbackSchema,
  getAllInterviewQuestionsSchema,
  approveInterviewQuestionSchema,
  feedbackIdParamSchema,
  questionIdParamSchema,
} = require('../../validators/college/feedback.validator');

// All routes require college admin or TPO + rate limiting
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// #99  — List all feedback
router.get(
  '/get_all_feedback',
  validate(getAllFeedbackSchema, 'query'),
  asyncHandler(controller.getAllFeedback)
);

// #100 — Approve / Reject feedback
router.patch(
  '/approve_feedback/:feedbackId',
  validate(feedbackIdParamSchema, 'params'),
  validate(approveFeedbackSchema),
  asyncHandler(controller.approveFeedback)
);

// #101 — List all interview questions
router.get(
  '/get_all_interview_questions',
  validate(getAllInterviewQuestionsSchema, 'query'),
  asyncHandler(controller.getAllInterviewQuestions)
);

// #102 — Approve / Reject interview question
router.patch(
  '/approve_interview_question/:questionId',
  validate(questionIdParamSchema, 'params'),
  validate(approveInterviewQuestionSchema),
  asyncHandler(controller.approveInterviewQuestion)
);

module.exports = router;
