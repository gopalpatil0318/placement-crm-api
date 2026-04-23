/**
 * ============================================================================
 * COLLEGE SKILL ROUTES — Skills Master Endpoints
 * ============================================================================
 * Base: /api/college
 *
 * #103  POST   /create_skill              → Create skill in master list
 * #104  GET    /get_all_skills            → List skills (search, filter by category)
 * #105  DELETE /delete_skill/:skillId     → Delete skill (cascade-deletes student_skills)
 * #106  PUT    /update_skill/:skillId     → Update skill name and/or category
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/skill.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    createSkillSchema,
    listSkillsSchema,
    skillIdParamSchema,
    updateSkillSchema,
} = require('../../validators/college/skill.validator');

// All routes: authenticate + rate limit
router.use(authenticate, apiLimiter);

// #103 — Create skill
router.post(
    '/create_skill',
    requirePermission(PERMISSIONS.SKILLS_MANAGE),
    validate(createSkillSchema),
    asyncHandler(controller.createSkill)
);

// #104 — Get all skills
router.get(
    '/get_all_skills',
    requirePermission(PERMISSIONS.SKILLS_VIEW),
    validate(listSkillsSchema, 'query'),
    asyncHandler(controller.getAllSkills)
);

// #105 — Delete skill
router.delete(
    '/delete_skill/:skillId',
    requirePermission(PERMISSIONS.SKILLS_MANAGE),
    validate(skillIdParamSchema, 'params'),
    asyncHandler(controller.deleteSkill)
);

// #106 — Update skill
router.put(
    '/update_skill/:skillId',
    requirePermission(PERMISSIONS.SKILLS_MANAGE),
    validate(skillIdParamSchema, 'params'),
    validate(updateSkillSchema),
    asyncHandler(controller.updateSkill)
);

module.exports = router;
