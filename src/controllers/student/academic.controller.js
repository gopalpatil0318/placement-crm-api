/**
 * ============================================================================
 * STUDENT ACADEMIC INFO CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   PUT   /api/student/save_academic_info  — Upsert (create or update)
 *   GET   /api/student/get_academic_info   — Get own academic info
 * ============================================================================
 */

const academicService = require('../../services/student/academic.service');
const { sendSuccess } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { SUCCESS_MESSAGES, LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. SAVE ACADEMIC INFO (Upsert)
// ============================================================================

async function saveAcademicInfo(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} PUT /api/student/save_academic_info`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await academicService.saveAcademicInfo(
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PUT /api/student/save_academic_info`, {
        student_id: req.user.id,
        is_new: result.is_new,
        duration_ms: duration,
    });

    const message = result.is_new
        ? 'Academic information saved successfully'
        : SUCCESS_MESSAGES.PROFILE_UPDATED;

    const statusCode = result.is_new ? HTTP_STATUS.CREATED : HTTP_STATUS.OK;

    return sendSuccess(res, result.academic_info, message, statusCode);
}

// ============================================================================
// 2. GET ACADEMIC INFO
// ============================================================================

async function getAcademicInfo(req, res) {
    const result = await academicService.getAcademicInfo(
        req.user.id,
        req.user.college_id
    );

    if (!result) {
        return sendSuccess(res, null, 'Academic information not yet filled. Please complete your profile');
    }

    return sendSuccess(res, result, 'Academic information retrieved successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    saveAcademicInfo,
    getAcademicInfo,
};
