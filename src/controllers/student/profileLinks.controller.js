/**
 * ============================================================================
 * STUDENT PROFILE LINKS CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   PUT  /api/student/save_profile_links   — Upsert profile links
 *   GET  /api/student/get_profile_links    — Get own profile links
 * ============================================================================
 */

const profileLinksService = require('../../services/student/profileLinks.service');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { ERROR_MESSAGES, LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. SAVE PROFILE LINKS (Upsert — create or update)
// ============================================================================

async function saveProfileLinks(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} PUT /api/student/save_profile_links`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    try {
        const result = await profileLinksService.saveProfileLinks(
            req.user.id,
            req.user.college_id,
            req.validated
        );

        const duration = Date.now() - startTime;
        const statusCode = result.is_new ? HTTP_STATUS.CREATED : HTTP_STATUS.OK;
        const message = result.is_new
            ? 'Profile links created successfully'
            : 'Profile links updated successfully';

        logger.info(`${LOG.API_END} PUT /api/student/save_profile_links`, {
            student_id: req.user.id,
            is_new: result.is_new,
            duration_ms: duration,
        });

        return sendSuccess(res, result.data, message, statusCode);
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} PUT /api/student/save_profile_links`, {
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
// 2. GET PROFILE LINKS
// ============================================================================

async function getProfileLinks(req, res) {
    const result = await profileLinksService.getProfileLinks(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Profile links retrieved successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    saveProfileLinks,
    getProfileLinks,
};
