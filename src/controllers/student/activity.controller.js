/**
 * ============================================================================
 * STUDENT ACTIVITY CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/add_activity                  — Add activity
 *   GET    /api/student/get_all_activities             — List own activities
 *   PUT    /api/student/update_activity/:activityId    — Update activity
 *   DELETE /api/student/delete_activity/:activityId    — Delete activity
 * ============================================================================
 */

const activityService = require('../../services/student/activity.service');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { ERROR_MESSAGES, LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. ADD ACTIVITY
// ============================================================================

async function addActivity(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/add_activity`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    try {
        const result = await activityService.addActivity(
            req.user.id,
            req.user.college_id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} POST /api/student/add_activity`, {
            student_id: req.user.id,
            activity_id: result.activity_id,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Activity added successfully', HTTP_STATUS.CREATED);
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} POST /api/student/add_activity`, {
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
// 2. GET ALL ACTIVITIES
// ============================================================================

async function getAllActivities(req, res) {
    const result = await activityService.getAllActivities(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Activities retrieved successfully');
}

// ============================================================================
// 3. UPDATE ACTIVITY
// ============================================================================

async function updateActivity(req, res) {
    const startTime = Date.now();
    const { activityId } = req.params;

    logger.info(`${LOG.API_START} PUT /api/student/update_activity/${activityId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    try {
        const result = await activityService.updateActivity(
            activityId,
            req.user.id,
            req.user.college_id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} PUT /api/student/update_activity/${activityId}`, {
            student_id: req.user.id,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Activity updated successfully');
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} PUT /api/student/update_activity/${activityId}`, {
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
// 4. DELETE ACTIVITY
// ============================================================================

async function deleteActivity(req, res) {
    const startTime = Date.now();
    const { activityId } = req.params;

    logger.info(`${LOG.API_START} DELETE /api/student/delete_activity/${activityId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    try {
        const result = await activityService.deleteActivity(
            activityId,
            req.user.id,
            req.user.college_id
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} DELETE /api/student/delete_activity/${activityId}`, {
            student_id: req.user.id,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Activity deleted successfully');
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} DELETE /api/student/delete_activity/${activityId}`, {
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
    addActivity,
    getAllActivities,
    updateActivity,
    deleteActivity,
};
