/**
 * ============================================================================
 * COLLEGE SKILL CONTROLLER — Skills Master HTTP Handlers
 * ============================================================================
 *   #103  createSkill   POST  /api/college/create_skill
 *   #104  getAllSkills   GET   /api/college/get_all_skills
 * ============================================================================
 */

const skillService = require('../../services/college/skill.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    LOG,
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// #103 — CREATE SKILL
// ============================================================================

async function createSkill(req, res) {
    const startTime = Date.now();
    const collegeId = req.user.college_id;

    logger.info(`${LOG.API_START} POST /college/create_skill`, {
        userId: req.user.id,
        collegeId,
    });

    const skill = await skillService.createSkill(collegeId, req.validated);

    logger.info(`${LOG.API_END} POST /college/create_skill`, {
        skillId: skill.skill_id,
        skillName: skill.skill_name,
        collegeId,
        duration_ms: Date.now() - startTime,
    });

    return sendCreated(res, skill, SUCCESS_MESSAGES.SKILL_CREATED);
}

// ============================================================================
// #104 — GET ALL SKILLS
// ============================================================================

async function getAllSkills(req, res) {
    const collegeId = req.user.college_id;

    const result = await skillService.getAllSkills(collegeId, req.validated);

    return sendPaginated(
        res,
        { skills: result.skills, categories: result.categories },
        result.total,
        { page: result.page, limit: result.limit },
        'Skills retrieved successfully'
    );
}

module.exports = {
    createSkill,
    getAllSkills,
};
