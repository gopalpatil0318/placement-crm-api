/**
 * ============================================================================
 * COLLEGE FEEDBACK & INTERVIEW QUESTIONS CONTROLLER
 * ============================================================================
 * HTTP handlers for APIs #99–#102
 * ============================================================================
 */

const feedbackService = require('../../services/college/feedback.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES } = require('../../config/constants');

// ── #99  GET /get_all_feedback ─────────────────────────────────────────────
const getAllFeedback = async (req, res) => {
  const result = await feedbackService.getAllFeedback(
    req.user.college_id,
    req.validated
  );

  return sendPaginated(
    res,
    result.feedback,
    result.total,
    { page: result.page, limit: result.limit },
    SUCCESS_MESSAGES.FEEDBACK_RETRIEVED
  );
};

// ── #100 PATCH /approve_feedback/:feedbackId ───────────────────────────────
const approveFeedback = async (req, res) => {
  const result = await feedbackService.approveFeedback(
    req.user.college_id,
    req.params.feedbackId,
    req.validated.is_approved
  );

  const message = req.validated.is_approved
    ? SUCCESS_MESSAGES.FEEDBACK_APPROVED
    : SUCCESS_MESSAGES.FEEDBACK_REJECTED;

  return sendSuccess(res, result, message);
};

// ── #101 GET /get_all_interview_questions ──────────────────────────────────
const getAllInterviewQuestions = async (req, res) => {
  const result = await feedbackService.getAllInterviewQuestions(
    req.user.college_id,
    req.validated
  );

  return sendPaginated(
    res,
    result.questions,
    result.total,
    { page: result.page, limit: result.limit },
    SUCCESS_MESSAGES.INTERVIEW_QUESTIONS_RETRIEVED
  );
};

// ── #102 PATCH /approve_interview_question/:questionId ────────────────────
const approveInterviewQuestion = async (req, res) => {
  const result = await feedbackService.approveInterviewQuestion(
    req.user.college_id,
    req.params.questionId,
    req.validated.is_approved
  );

  const message = req.validated.is_approved
    ? SUCCESS_MESSAGES.INTERVIEW_QUESTION_APPROVED
    : SUCCESS_MESSAGES.INTERVIEW_QUESTION_REJECTED;

  return sendSuccess(res, result, message);
};

module.exports = {
  getAllFeedback,
  approveFeedback,
  getAllInterviewQuestions,
  approveInterviewQuestion,
};
