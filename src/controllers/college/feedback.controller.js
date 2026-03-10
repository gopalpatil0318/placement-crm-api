/**
 * ============================================================================
 * COLLEGE FEEDBACK & INTERVIEW QUESTIONS CONTROLLER
 * ============================================================================
 * HTTP handlers for APIs #99–#102
 * ============================================================================
 */

const feedbackService = require('../../services/college/feedback.service');
const { sendSuccess, sendPaginated, sendError } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES, ERROR_MESSAGES, HTTP_STATUS, LOG } = require('../../config/constants');
const logger = require('../../config/logger');

// ── #99  GET /get_all_feedback ─────────────────────────────────────────────
const getAllFeedback = async (req, res) => {
  try {
    const result = await feedbackService.getAllFeedback(
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
  } catch (err) {
    logger.error(`${LOG.API_ERROR} getAllFeedback`, {
      error: err.message,
      college_id: req.user.college_id,
    });
    return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

// ── #100 PATCH /approve_feedback/:feedbackId ───────────────────────────────
const approveFeedback = async (req, res) => {
  const startTime = Date.now();
  try {
    logger.info(`${LOG.API_START} approveFeedback`, {
      feedback_id: req.params.feedbackId,
      user_id: req.user.id,
      college_id: req.user.college_id,
    });

    const result = await feedbackService.approveFeedback(
      req.user.college_id,
      req.params.feedbackId,
      req.validated.is_approved
    );

    const message = req.validated.is_approved
      ? SUCCESS_MESSAGES.FEEDBACK_APPROVED
      : SUCCESS_MESSAGES.FEEDBACK_REJECTED;

    logger.info(`${LOG.API_END} approveFeedback`, {
      feedback_id: req.params.feedbackId,
      is_approved: req.validated.is_approved,
      duration_ms: Date.now() - startTime,
    });

    return sendSuccess(res, result, message);
  } catch (err) {
    logger.error(`${LOG.API_ERROR} approveFeedback`, {
      error: err.message,
      feedback_id: req.params.feedbackId,
      duration_ms: Date.now() - startTime,
    });
    if (err.status === 404) {
      return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
    }
    return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

// ── #101 GET /get_all_interview_questions ──────────────────────────────────
const getAllInterviewQuestions = async (req, res) => {
  try {
    const result = await feedbackService.getAllInterviewQuestions(
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
  } catch (err) {
    logger.error(`${LOG.API_ERROR} getAllInterviewQuestions`, {
      error: err.message,
      college_id: req.user.college_id,
    });
    return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

// ── #102 PATCH /approve_interview_question/:questionId ────────────────────
const approveInterviewQuestion = async (req, res) => {
  const startTime = Date.now();
  try {
    logger.info(`${LOG.API_START} approveInterviewQuestion`, {
      question_id: req.params.questionId,
      user_id: req.user.id,
      college_id: req.user.college_id,
    });

    const result = await feedbackService.approveInterviewQuestion(
      req.user.college_id,
      req.params.questionId,
      req.validated.is_approved
    );

    const message = req.validated.is_approved
      ? SUCCESS_MESSAGES.INTERVIEW_QUESTION_APPROVED
      : SUCCESS_MESSAGES.INTERVIEW_QUESTION_REJECTED;

    logger.info(`${LOG.API_END} approveInterviewQuestion`, {
      question_id: req.params.questionId,
      is_approved: req.validated.is_approved,
      duration_ms: Date.now() - startTime,
    });

    return sendSuccess(res, result, message);
  } catch (err) {
    logger.error(`${LOG.API_ERROR} approveInterviewQuestion`, {
      error: err.message,
      question_id: req.params.questionId,
      duration_ms: Date.now() - startTime,
    });
    if (err.status === 404) {
      return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
    }
    return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
};

module.exports = {
  getAllFeedback,
  approveFeedback,
  getAllInterviewQuestions,
  approveInterviewQuestion,
};
