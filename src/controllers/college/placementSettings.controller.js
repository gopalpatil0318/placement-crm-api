/**
 * ============================================================================
 * PLACEMENT SETTINGS CONTROLLER — Route Handlers for Policy Settings
 * ============================================================================
 *   GET  /api/college/get_placement_settings    → getSettings
 *   PUT  /api/college/upsert_placement_settings → upsertSettings
 * ============================================================================
 */

const settingsService = require('../../services/college/placementSettings.service');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

// ============================================================================
// 1. GET SETTINGS
// ============================================================================

async function getSettings(req, res) {
    try {
        const result = await settingsService.getSettings(
            req.user.college_id,
            Number(req.validated.passout_year)
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.SETTINGS_RETRIEVED);
    } catch (err) {
        logger.error('getSettings failed', { error: err.message, collegeId: req.user.college_id });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. UPSERT SETTINGS
// ============================================================================

async function upsertSettings(req, res) {
    try {
        const result = await settingsService.upsertSettings(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT_SETTING,
            resourceId: result.setting_id,
            summary: `Saved placement settings for ${result.passout_year}`,
            newValue: result,
            metadata: { passout_year: result.passout_year },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.SETTINGS_SAVED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

module.exports = { getSettings, upsertSettings };
