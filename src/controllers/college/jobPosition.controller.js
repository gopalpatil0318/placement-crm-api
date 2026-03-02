/**
 * ============================================================================
 * JOB POSITION CONTROLLER — Route Handlers for Position Management
 * ============================================================================
 *   POST  /api/college/add_job_position/:jobId
 *   PUT   /api/college/update_position/:positionId
 *   PATCH /api/college/update_position_status/:positionId
 * ============================================================================
 */

const positionService = require('../../services/college/jobPosition.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

// ============================================================================
// 1. ADD POSITION
// ============================================================================

async function addPosition(req, res) {
    try {
        const result = await positionService.addPosition(
            req.params.jobId,
            req.user.college_id,
            req.validated
        );

        return sendCreated(res, result, 'Position added successfully');
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. UPDATE POSITION
// ============================================================================

async function updatePosition(req, res) {
    try {
        const result = await positionService.updatePosition(
            req.params.positionId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, 'Position updated successfully');
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. UPDATE POSITION STATUS
// ============================================================================

async function updatePositionStatus(req, res) {
    try {
        const { position_status } = req.validated;

        const result = await positionService.updatePositionStatus(
            req.params.positionId,
            req.user.college_id,
            position_status
        );

        const statusMessages = {
            active: 'Position activated successfully',
            inactive: 'Position deactivated successfully',
            filled: 'Position marked as filled',
        };

        return sendSuccess(res, result, statusMessages[position_status] || 'Position status updated');
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
    addPosition,
    updatePosition,
    updatePositionStatus,
};
