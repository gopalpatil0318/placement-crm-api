/**
 * ============================================================================
 * APPLICATION QUESTION CONTROLLER — Route Handlers for Question Management
 * ============================================================================
 *   POST   /api/college/add_job_question/:jobId
 *   GET    /api/college/get_job_questions/:jobId
 *   PUT    /api/college/update_question/:questionId
 *   DELETE /api/college/delete_question/:questionId
 * ============================================================================
 */

const questionService = require('../../services/college/jobQuestion.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// 1. ADD QUESTION
// ============================================================================

async function addQuestion(req, res) {
    try {
        const result = await questionService.addQuestion(
            req.params.jobId,
            req.user.college_id,
            req.validated
        );

        return sendCreated(res, result, 'Application question added successfully');
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET JOB QUESTIONS
// ============================================================================

async function getJobQuestions(req, res) {
    try {
        const result = await questionService.getJobQuestions(
            req.params.jobId,
            req.user.college_id
        );

        return sendSuccess(res, result, 'Job questions retrieved successfully');
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. UPDATE QUESTION
// ============================================================================

async function updateQuestion(req, res) {
    try {
        const result = await questionService.updateQuestion(
            req.params.questionId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, 'Question updated successfully');
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. DELETE QUESTION
// ============================================================================

async function deleteQuestion(req, res) {
    try {
        const result = await questionService.deleteQuestion(
            req.params.questionId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.DELETED_SUCCESSFULLY);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addQuestion,
    getJobQuestions,
    updateQuestion,
    deleteQuestion,
};
