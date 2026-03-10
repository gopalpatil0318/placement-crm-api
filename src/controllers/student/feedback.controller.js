/**
 * ============================================================================
 * STUDENT FEEDBACK & INTERVIEW QUESTIONS CONTROLLER
 * ============================================================================
 * HTTP handlers for APIs #172–#175
 * ============================================================================
 */

const feedbackService = require('../../services/student/feedback.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES, LOG } = require('../../config/constants');
const logger = require('../../config/logger');

// ── #172 POST /submit_feedback ─────────────────────────────────────────────
const submitFeedback = async (req, res) => {
  const startTime = Date.now();

  logger.info(`${LOG.API_START} submitFeedback`, {
    student_id: req.user.id,
    college_id: req.user.college_id,
    job_id: req.validated.job_id,
  });

  const result = await feedbackService.submitFeedback(
    req.user.id,
    req.user.college_id,
    req.validated
  );

  logger.info(`${LOG.API_END} submitFeedback`, {
    student_id: req.user.id,
    feedback_id: result.feedback_id,
    duration_ms: Date.now() - startTime,
  });

  return sendCreated(res, result, SUCCESS_MESSAGES.FEEDBACK_SUBMITTED);
};

// ── #173 GET /get_my_feedback ──────────────────────────────────────────────
const getMyFeedback = async (req, res) => {
  const result = await feedbackService.getMyFeedback(
    req.user.id,
    req.user.college_id,
    req.validated
  );

  return sendPaginated(
    res,
    result.feedback,
    result.total,
    { page: result.page, limit: result.limit },
    SUCCESS_MESSAGES.FETCHED_SUCCESSFULLY
  );
};

// ── #174 POST /submit_interview_question ──────────────────────────────────
const submitInterviewQuestion = async (req, res) => {
  const startTime = Date.now();

  logger.info(`${LOG.API_START} submitInterviewQuestion`, {
    student_id: req.user.id,
    college_id: req.user.college_id,
    job_id: req.validated.job_id,
  });

  const result = await feedbackService.submitInterviewQuestion(
    req.user.id,
    req.user.college_id,
    req.validated
  );

  logger.info(`${LOG.API_END} submitInterviewQuestion`, {
    student_id: req.user.id,
    question_id: result.question_id,
    duration_ms: Date.now() - startTime,
  });

  return sendCreated(res, result, SUCCESS_MESSAGES.INTERVIEW_QUESTION_SUBMITTED);
};

// ── #175 GET /browse_interview_questions ──────────────────────────────────
const browseInterviewQuestions = async (req, res) => {
  const result = await feedbackService.browseInterviewQuestions(
    req.user.college_id,
    req.validated
  );

  return sendPaginated(
    res,
    result.questions,
    result.total,
    { page: result.page, limit: result.limit },
    SUCCESS_MESSAGES.FETCHED_SUCCESSFULLY
  );
};

module.exports = {
  submitFeedback,
  getMyFeedback,
  submitInterviewQuestion,
  browseInterviewQuestions,
};
