/**
 * ============================================================================
 * VERIFICATION SETTINGS CONTROLLER — Route Handlers
 * ============================================================================
 *   GET   /api/college/get_verification_settings
 *   PATCH /api/college/update_verification_settings
 * ============================================================================
 */

const settingsService = require('../../services/college/verificationSettings.service');
const { sendSuccess } = require('../../utils/responseHelper');

// ============================================================================
// 1. GET VERIFICATION SETTINGS
// ============================================================================

async function getVerificationSettings(req, res) {
    const collegeId = req.user.college_id;
    const settings = await settingsService.getVerificationSettings(collegeId);
    sendSuccess(res, settings, 'Verification settings retrieved');
}

// ============================================================================
// 2. UPDATE VERIFICATION SETTINGS
// ============================================================================

async function updateVerificationSettings(req, res) {
    const collegeId = req.user.college_id;
    const settings = await settingsService.updateVerificationSettings(collegeId, req.validated);
    sendSuccess(res, settings, 'Verification settings updated');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getVerificationSettings,
    updateVerificationSettings,
};
