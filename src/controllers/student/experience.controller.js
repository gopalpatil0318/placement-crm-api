/**
 * ============================================================================
 * STUDENT EXPERIENCE CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/add_experience                    — Add experience
 *   GET    /api/student/get_all_experience                 — List own experience
 *   PUT    /api/student/update_experience/:experienceId    — Update experience
 *   DELETE /api/student/delete_experience/:experienceId    — Delete experience
 * ============================================================================
 */

const experienceService = require('../../services/student/experience.service');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { ERROR_MESSAGES, LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. ADD EXPERIENCE
// ============================================================================

async function addExperience(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/add_experience`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    try {
        const result = await experienceService.addExperience(
            req.user.id,
            req.user.college_id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} POST /api/student/add_experience`, {
            student_id: req.user.id,
            experience_id: result.experience_id,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Experience added successfully', HTTP_STATUS.CREATED);
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} POST /api/student/add_experience`, {
            error: err.message,
            stack: err.stack,
            student_id: req.user.id,
            duration_ms: duration,
        });

        if (err.status === 400) {
            return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        }
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL EXPERIENCE
// ============================================================================

async function getAllExperience(req, res) {
    const result = await experienceService.getAllExperience(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Experience retrieved successfully');
}

// ============================================================================
// 3. UPDATE EXPERIENCE
// ============================================================================

async function updateExperience(req, res) {
    const startTime = Date.now();
    const { experienceId } = req.params;

    logger.info(`${LOG.API_START} PUT /api/student/update_experience/${experienceId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    try {
        const result = await experienceService.updateExperience(
            experienceId,
            req.user.id,
            req.user.college_id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} PUT /api/student/update_experience/${experienceId}`, {
            student_id: req.user.id,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Experience updated successfully');
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} PUT /api/student/update_experience/${experienceId}`, {
            error: err.message,
            stack: err.stack,
            student_id: req.user.id,
            duration_ms: duration,
        });

        if (err.status === 400) {
            return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        }
        if (err.status === 404) {
            return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        }
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. DELETE EXPERIENCE
// ============================================================================

async function deleteExperience(req, res) {
    const startTime = Date.now();
    const { experienceId } = req.params;

    logger.info(`${LOG.API_START} DELETE /api/student/delete_experience/${experienceId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    try {
        const result = await experienceService.deleteExperience(
            experienceId,
            req.user.id,
            req.user.college_id
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} DELETE /api/student/delete_experience/${experienceId}`, {
            student_id: req.user.id,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Experience deleted successfully');
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} DELETE /api/student/delete_experience/${experienceId}`, {
            error: err.message,
            stack: err.stack,
            student_id: req.user.id,
            duration_ms: duration,
        });

        if (err.status === 404) {
            return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        }
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addExperience,
    getAllExperience,
    updateExperience,
    deleteExperience,
};
