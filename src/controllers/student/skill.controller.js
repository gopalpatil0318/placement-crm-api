/**
 * ============================================================================
 * STUDENT SKILL CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   POST   /api/student/add_skill           — Add skill to catalog (any auth)
 *   DELETE /api/student/delete_skill/:skillId — Delete skill (college only)
 *   GET    /api/student/get_all_skills       — List all available skills
 *   PUT    /api/student/sync_my_skills       — Smart sync student skills
 *   GET    /api/student/get_my_skills        — Get student's own skills
 * ============================================================================
 */

const skillService = require('../../services/student/skill.service');
const { sendSuccess } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    SUCCESS_MESSAGES,
    LOG,
    HTTP_STATUS,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
    SKILL_CATEGORY_LABELS,
} = require('../../config/constants');

// ============================================================================
// 1. ADD SKILL (to master catalog — student or college user)
// ============================================================================

async function addSkill(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/add_skill`, {
        user_id: req.user.id,
        role: req.user.role,
        college_id: req.user.college_id,
    });

    const result = await skillService.addSkill(
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/add_skill`, {
        skill_id: result.skill_id,
        duration_ms: duration,
    });

    // Audit: skill added to catalog
    const categoryLabel = SKILL_CATEGORY_LABELS[result.skill_category] || result.skill_category;
    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.SKILL,
        resourceId: result.skill_id,
        summary: `Added skill "${result.skill_name}" in category "${categoryLabel}" (via student portal)`,
        newValue: {
            skill_name: result.skill_name,
            skill_category: result.skill_category,
            category_label: categoryLabel,
        },
        metadata: { skill_name: result.skill_name, added_by: req.user.role },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.SKILL_CREATED, HTTP_STATUS.CREATED);
}

// ============================================================================
// 2. DELETE SKILL (college user only)
// ============================================================================

async function deleteSkill(req, res) {
    const startTime = Date.now();
    const { skillId } = req.params;

    logger.info(`${LOG.API_START} DELETE /api/student/delete_skill/${skillId}`, {
        user_id: req.user.id,
        role: req.user.role,
        college_id: req.user.college_id,
    });

    const result = await skillService.deleteSkill(skillId, req.user.college_id);

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} DELETE /api/student/delete_skill/${skillId}`, {
        skill_name: result.skill_name,
        duration_ms: duration,
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.SKILL_REMOVED);
}

// ============================================================================
// 3. GET ALL SKILLS (master catalog for skill picker)
// ============================================================================

async function getAllSkills(req, res) {
    const result = await skillService.getAllSkills(req.user.college_id);

    return sendSuccess(res, result, 'Skills retrieved successfully');
}

// ============================================================================
// 4. SYNC MY SKILLS (smart array sync)
// ============================================================================

async function syncMySkills(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} PUT /api/student/sync_my_skills`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
        incoming_count: req.validated.skills.length,
    });

    const result = await skillService.syncMySkills(
        req.user.id,
        req.user.college_id,
        req.validated.skills
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PUT /api/student/sync_my_skills`, {
        student_id: req.user.id,
        sync_summary: result.sync_summary,
        duration_ms: duration,
    });

    return sendSuccess(res, result, 'Skills synced successfully');
}

// ============================================================================
// 5. GET MY SKILLS
// ============================================================================

async function getMySkills(req, res) {
    const result = await skillService.getMySkills(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Your skills retrieved successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addSkill,
    deleteSkill,
    getAllSkills,
    syncMySkills,
    getMySkills,
};
