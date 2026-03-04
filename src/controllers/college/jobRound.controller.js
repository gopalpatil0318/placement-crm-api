/**
 * ============================================================================
 * JOB ROUND CONTROLLER — Route Handlers for Selection Round Management
 * ============================================================================
 *   POST  /api/college/add_job_round/:jobId
 *   PUT   /api/college/update_round/:roundId
 *   PATCH /api/college/update_round_status/:roundId
 * ============================================================================
 */

const roundService = require('../../services/college/jobRound.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// 1. ADD ROUND
// ============================================================================

async function addRound(req, res) {
    try {
        const result = await roundService.addRound(
            req.params.jobId,
            req.user.college_id,
            req.validated
        );

        return sendCreated(res, result, SUCCESS_MESSAGES.ROUND_ADDED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. UPDATE ROUND
// ============================================================================

async function updateRound(req, res) {
    try {
        const result = await roundService.updateRound(
            req.params.roundId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.ROUND_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. UPDATE ROUND STATUS
// ============================================================================

async function updateRoundStatus(req, res) {
    try {
        const { round_status } = req.validated;

        const result = await roundService.updateRoundStatus(
            req.params.roundId,
            req.user.college_id,
            round_status
        );

        const statusMessages = {
            pending: 'Round reset to pending',
            in_progress: 'Round is now in progress',
            completed: 'Round marked as completed',
            cancelled: 'Round has been cancelled',
        };

        return sendSuccess(res, result, statusMessages[round_status] ?? SUCCESS_MESSAGES.ROUND_UPDATED);
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
    addRound,
    updateRound,
    updateRoundStatus,
};
