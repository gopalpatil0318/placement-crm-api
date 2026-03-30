/**
 * ============================================================================
 * COLLEGE SKILL ROUTES — Skills Master Endpoints
 * ============================================================================
 * Base: /api/college
 *
 * #103  POST   /create_skill       → Create skill in master list
 * #104  GET    /get_all_skills     → List skills (search, filter by category)
 * #105  DELETE /delete_skill/:skillId → Delete skill (cascade-deletes student_skills)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/skill.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    createSkillSchema,
    listSkillsSchema,
    skillIdParamSchema,
} = require('../../validators/college/skill.validator');

// All routes: authenticate + college admin/TPO + rate limit
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// #103 — Create skill
router.post(
    '/create_skill',
    validate(createSkillSchema),
    asyncHandler(controller.createSkill)
);

// #104 — Get all skills
router.get(
    '/get_all_skills',
    validate(listSkillsSchema, 'query'),
    asyncHandler(controller.getAllSkills)
);

// #105 — Delete skill
router.delete(
    '/delete_skill/:skillId',
    validate(skillIdParamSchema, 'params'),
    asyncHandler(controller.deleteSkill)
);

module.exports = router;
