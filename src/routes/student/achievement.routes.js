/**
 * ============================================================================
 * STUDENT ACHIEVEMENT ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST   /add_achievement                      authenticate + apiLimiter + validate
 *   GET    /get_all_achievements                  authenticate
 *   PUT    /update_achievement/:achievementId     authenticate + apiLimiter + validate
 *   DELETE /delete_achievement/:achievementId     authenticate + apiLimiter
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/achievement.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    addAchievementSchema,
    updateAchievementSchema,
} = require('../../validators/student/achievement.validator');

// ============================================================================
// ACHIEVEMENT ROUTES
// ============================================================================

// Add achievement (max 10)
router.post(
    '/add_achievement',
    authenticate,
    apiLimiter,
    validate(addAchievementSchema),
    asyncHandler(controller.addAchievement)
);

// List own achievements
router.get(
    '/get_all_achievements',
    authenticate,
    asyncHandler(controller.getAllAchievements)
);

// Update achievement
router.put(
    '/update_achievement/:achievementId',
    authenticate,
    apiLimiter,
    validate(updateAchievementSchema),
    asyncHandler(controller.updateAchievement)
);

// Delete achievement
router.delete(
    '/delete_achievement/:achievementId',
    authenticate,
    apiLimiter,
    asyncHandler(controller.deleteAchievement)
);

module.exports = router;
