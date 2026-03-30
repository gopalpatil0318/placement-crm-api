/**
 * ============================================================================
 * STUDENT RESTRICTION CONTROLLER — Own Restrictions Route Handlers
 * ============================================================================
 * Endpoints:
 *   GET  /api/student/get_my_restrictions                       — List own restrictions
 *   POST /api/student/appeal_restriction/:restrictionId         — Submit appeal
 * ============================================================================
 */

const restrictionService = require('../../services/student/restriction.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    SUCCESS_MESSAGES,
    LOG,
} = require('../../config/constants');

// ============================================================================
// 1. GET MY RESTRICTIONS
// ============================================================================

async function getMyRestrictions(req, res) {
    const { restrictions, total, page, limit, summary } =
        await restrictionService.getMyRestrictions(
            req.user.id,
            req.user.college_id,
            req.validated
        );

    return sendPaginated(
        res,
        { restrictions, summary },
        total,
        { page, limit },
        SUCCESS_MESSAGES.MY_RESTRICTIONS_RETRIEVED
    );
}

// ============================================================================
// 2. APPEAL RESTRICTION
// ============================================================================

async function appealRestriction(req, res) {
    const startTime = Date.now();
    const { restrictionId } = req.params;

    logger.info(`${LOG.API_START} POST /api/student/appeal_restriction/${restrictionId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await restrictionService.appealRestriction(
        restrictionId,
        req.user.id,
        req.user.college_id,
        req.validated.appeal_notes
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/appeal_restriction/${restrictionId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.APPEAL_SUBMITTED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getMyRestrictions,
    appealRestriction,
};
