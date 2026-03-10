/**
 * ============================================================================
 * STUDENT ACHIEVEMENT CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/add_achievement                      — Add achievement
 *   GET    /api/student/get_all_achievements                  — List own achievements
 *   PUT    /api/student/update_achievement/:achievementId     — Update achievement
 *   DELETE /api/student/delete_achievement/:achievementId     — Delete achievement
 * ============================================================================
 */

const achievementService = require('../../services/student/achievement.service');
const { sendSuccess } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. ADD ACHIEVEMENT
// ============================================================================

async function addAchievement(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/add_achievement`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await achievementService.addAchievement(
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/add_achievement`, {
        student_id: req.user.id,
        achievement_id: result.achievement_id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Achievement added successfully', HTTP_STATUS.CREATED);
}

// ============================================================================
// 2. GET ALL ACHIEVEMENTS
// ============================================================================

async function getAllAchievements(req, res) {
    const result = await achievementService.getAllAchievements(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Achievements retrieved successfully');
}

// ============================================================================
// 3. UPDATE ACHIEVEMENT
// ============================================================================

async function updateAchievement(req, res) {
    const startTime = Date.now();
    const { achievementId } = req.params;

    logger.info(`${LOG.API_START} PUT /api/student/update_achievement/${achievementId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await achievementService.updateAchievement(
        achievementId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PUT /api/student/update_achievement/${achievementId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Achievement updated successfully');
}

// ============================================================================
// 4. DELETE ACHIEVEMENT
// ============================================================================

async function deleteAchievement(req, res) {
    const startTime = Date.now();
    const { achievementId } = req.params;

    logger.info(`${LOG.API_START} DELETE /api/student/delete_achievement/${achievementId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await achievementService.deleteAchievement(
        achievementId,
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} DELETE /api/student/delete_achievement/${achievementId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Achievement deleted successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addAchievement,
    getAllAchievements,
    updateAchievement,
    deleteAchievement,
};
