/**
 * ============================================================================
 * STUDENT PROFILE CONTROLLER — Route Handlers for Profile Data
 * ============================================================================
 * Endpoints:
 *   GET  /api/student/get_basic_info          — Own basic info + dept_name
 *   GET  /api/student/get_full_profile        — Complete profile (all tables)
 *   GET  /api/student/get_profile_completion  — Profile completion breakdown
 * ============================================================================
 */

const profileService = require('../../services/student/profile.service');
const { sendSuccess } = require('../../utils/responseHelper');

// ============================================================================
// 1. GET BASIC INFO
// ============================================================================

async function getBasicInfo(req, res) {
    const result = await profileService.getBasicInfo(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Student basic info retrieved successfully');
}

// ============================================================================
// 2. GET FULL PROFILE
// ============================================================================

async function getFullProfile(req, res) {
    const result = await profileService.getFullProfile(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Student full profile retrieved successfully');
}

// ============================================================================
// 3. GET PROFILE COMPLETION
// ============================================================================

async function getProfileCompletion(req, res) {
    const result = await profileService.getProfileCompletion(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Profile completion retrieved successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getBasicInfo,
    getFullProfile,
    getProfileCompletion,
};
