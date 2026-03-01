/**
 * ============================================================================
 * STUDENT SKILL ROUTES — Master Skills + Student Skill Sync
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST   /add_skill             authenticate + apiLimiter + validate
 *   DELETE /delete_skill/:skillId  authenticate + requireRole (college) + apiLimiter
 *   GET    /get_all_skills         authenticate
 *   PUT    /sync_my_skills         authenticate + apiLimiter + validate
 *   GET    /get_my_skills          authenticate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/skill.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    addSkillSchema,
    syncMySkillsSchema,
} = require('../../validators/student/skill.validator');

// ============================================================================
// MASTER SKILL ROUTES (catalog management)
// ============================================================================

// Add a new skill to the catalog (both student + college users can add)
router.post(
    '/add_skill',
    authenticate,
    apiLimiter,
    validate(addSkillSchema),
    asyncHandler(controller.addSkill)
);

// Delete a skill from catalog (college users only — cascades to student_skills)
router.delete(
    '/delete_skill/:skillId',
    authenticate,
    requireRole(ROLES.COLLEGEADMIN, ROLES.TPO, ROLES.HOD, ROLES.TPC),
    apiLimiter,
    asyncHandler(controller.deleteSkill)
);

// List all available skills for the college (for skill picker dropdown)
router.get(
    '/get_all_skills',
    authenticate,
    asyncHandler(controller.getAllSkills)
);

// ============================================================================
// STUDENT SKILL ROUTES (personal skill management)
// ============================================================================

// Smart sync — send full array, backend handles add/remove/update
router.put(
    '/sync_my_skills',
    authenticate,
    apiLimiter,
    validate(syncMySkillsSchema),
    asyncHandler(controller.syncMySkills)
);

// Get student's own skills
router.get(
    '/get_my_skills',
    authenticate,
    asyncHandler(controller.getMySkills)
);

module.exports = router;
