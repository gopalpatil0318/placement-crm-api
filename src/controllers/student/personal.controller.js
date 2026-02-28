/**
 * ============================================================================
 * STUDENT PERSONAL INFO CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   PUT   /api/student/save_personal_info  — Upsert (create or update)
 *   GET   /api/student/get_personal_info   — Get own personal info
 * ============================================================================
 */

const personalService = require('../../services/student/personal.service');
const { sendSuccess } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { SUCCESS_MESSAGES, LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. SAVE PERSONAL INFO (Upsert)
// ============================================================================

async function savePersonalInfo(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} PUT /api/student/save_personal_info`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await personalService.savePersonalInfo(
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PUT /api/student/save_personal_info`, {
        student_id: req.user.id,
        is_new: result.is_new,
        duration_ms: duration,
    });

    const message = result.is_new
        ? 'Personal information saved successfully'
        : SUCCESS_MESSAGES.PROFILE_UPDATED;

    const statusCode = result.is_new ? HTTP_STATUS.CREATED : HTTP_STATUS.OK;

    return sendSuccess(res, result.personal_info, message, statusCode);
}

// ============================================================================
// 2. GET PERSONAL INFO
// ============================================================================

async function getPersonalInfo(req, res) {
    const result = await personalService.getPersonalInfo(
        req.user.id,
        req.user.college_id
    );

    // Return empty object with message if not filled yet
    if (!result) {
        return sendSuccess(res, null, 'Personal information not yet filled. Please complete your profile');
    }

    return sendSuccess(res, result, 'Personal information retrieved successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    savePersonalInfo,
    getPersonalInfo,
};
