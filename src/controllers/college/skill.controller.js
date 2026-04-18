/**
 * ============================================================================
 * COLLEGE SKILL CONTROLLER — Skills Master HTTP Handlers
 * ============================================================================
 *   #103  createSkill   POST   /api/college/create_skill
 *   #104  getAllSkills   GET    /api/college/get_all_skills
 *   #105  deleteSkill   DELETE /api/college/delete_skill/:skillId
 *   #106  updateSkill   PUT    /api/college/update_skill/:skillId
 * ============================================================================
 */

const skillService = require('../../services/college/skill.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    LOG,
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
    SKILL_CATEGORY_LABELS,
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

    // Audit: skill created
    const categoryLabel = SKILL_CATEGORY_LABELS[skill.skill_category] || skill.skill_category;
    logAudit(query, {
        collegeId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.SKILL,
        resourceId: skill.skill_id,
        summary: `Created skill "${skill.skill_name}" in category "${categoryLabel}"`,
        newValue: {
            skill_name: skill.skill_name,
            skill_category: skill.skill_category,
            category_label: categoryLabel,
        },
        metadata: { skill_name: skill.skill_name, skill_category: skill.skill_category },
        ipAddress: getClientIp(req),
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
        SUCCESS_MESSAGES.SKILLS_RETRIEVED
    );
}

// ============================================================================
// #105 — DELETE SKILL
// ============================================================================

async function deleteSkill(req, res) {
    const startTime = Date.now();
    const collegeId = req.user.college_id;
    const { skillId } = req.validated;

    logger.info(`${LOG.API_START} DELETE /college/delete_skill/${skillId}`, {
        userId: req.user.id,
        collegeId,
        skillId,
    });

    const deleted = await skillService.deleteSkill(skillId, collegeId);

    logger.info(`${LOG.API_END} DELETE /college/delete_skill/${skillId}`, {
        skillId: deleted.skill_id,
        skillName: deleted.skill_name,
        collegeId,
        duration_ms: Date.now() - startTime,
    });

    // Audit: skill deleted
    const categoryLabel = SKILL_CATEGORY_LABELS[deleted.skill_category] || deleted.skill_category;
    logAudit(query, {
        collegeId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.DELETE,
        resourceType: AUDIT_RESOURCE_TYPES.SKILL,
        resourceId: deleted.skill_id,
        summary: `Deleted skill "${deleted.skill_name}" from category "${categoryLabel}"`,
        oldValue: {
            skill_name: deleted.skill_name,
            skill_category: deleted.skill_category,
            category_label: categoryLabel,
        },
        metadata: { skill_name: deleted.skill_name, skill_category: deleted.skill_category },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, deleted, SUCCESS_MESSAGES.SKILL_DELETED);
}

// ============================================================================
// #106 — UPDATE SKILL
// ============================================================================

async function updateSkill(req, res) {
    const startTime = Date.now();
    const collegeId = req.user.college_id;
    const { skillId } = req.params;

    logger.info(`${LOG.API_START} PUT /college/update_skill/${skillId}`, {
        userId: req.user.id,
        collegeId,
        skillId,
    });

    const result = await skillService.updateSkill(skillId, collegeId, req.validated);

    logger.info(`${LOG.API_END} PUT /college/update_skill/${skillId}`, {
        skillId: result.skill_id,
        skillName: result.skill_name,
        collegeId,
        duration_ms: Date.now() - startTime,
    });

    // Audit: skill updated (with old → new diff)
    if (result._old && Object.keys(result._old).length > 0) {
        const oldSnapshot = { ...result._old };
        const newSnapshot = {};

        // Always include skill_name for context (so admins know which skill changed)
        newSnapshot.skill_name = result.skill_name;
        if (oldSnapshot.skill_name === undefined) {
            oldSnapshot.skill_name = result.skill_name;
        }
        if (oldSnapshot.skill_category !== undefined) {
            oldSnapshot.category_label = SKILL_CATEGORY_LABELS[oldSnapshot.skill_category] || oldSnapshot.skill_category;
            newSnapshot.skill_category = result.skill_category;
            newSnapshot.category_label = SKILL_CATEGORY_LABELS[result.skill_category] || result.skill_category;
        }

        // Build descriptive summary
        const changes = [];
        if (oldSnapshot.skill_name !== undefined) {
            changes.push(`name "${oldSnapshot.skill_name}" → "${result.skill_name}"`);
        }
        if (oldSnapshot.skill_category !== undefined) {
            const oldCatLabel = SKILL_CATEGORY_LABELS[oldSnapshot.skill_category] || oldSnapshot.skill_category;
            const newCatLabel = SKILL_CATEGORY_LABELS[result.skill_category] || result.skill_category;
            changes.push(`category "${oldCatLabel}" → "${newCatLabel}"`);
        }

        logAudit(query, {
            collegeId,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.SKILL,
            resourceId: result.skill_id,
            summary: `Updated skill "${result.skill_name}": ${changes.join(', ')}`,
            oldValue: oldSnapshot,
            newValue: newSnapshot,
            metadata: { skill_name: result.skill_name, changes_made: changes },
            ipAddress: getClientIp(req),
        });
    }

    delete result._old;
    return sendSuccess(res, result, SUCCESS_MESSAGES.SKILL_UPDATED);
}

module.exports = {
    createSkill,
    getAllSkills,
    deleteSkill,
    updateSkill,
};
