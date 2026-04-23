/**
 * ============================================================================
 * PROFILE CONTROLLER — Self-service profile handlers
 * ============================================================================
 */

const profileService = require('../../services/college/profile.service');
const { sendSuccess } = require('../../utils/responseHelper');
const { logAudit, getClientIp, computeAuditDiff } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');

// ============================================================================
// GET MY PROFILE
// ============================================================================

async function getMyProfile(req, res) {
  const profile = await profileService.getMyProfile(req.user.id, req.user.college_id, req.user.role);
  return sendSuccess(res, { profile }, 'Profile retrieved successfully');
}

// ============================================================================
// UPDATE MY PROFILE
// ============================================================================

async function updateMyProfile(req, res) {
  const userId = req.user.id;
  const collegeId = req.user.college_id;

  // Fetch old profile for audit diff
  const oldProfile = await profileService.getMyProfile(userId, collegeId, req.user.role);

  const updated = await profileService.updateMyProfile(userId, collegeId, req.validated);

  const { old: diffOld, new: diffNew } = computeAuditDiff(
    { user_name: oldProfile.user_name, phone_number: oldProfile.phone_number, profile_picture_url: oldProfile.profile_picture_url },
    { user_name: updated.user_name, phone_number: updated.phone_number, profile_picture_url: updated.profile_picture_url }
  );

  logAudit(query, {
    collegeId,
    userId,
    userName: req.user.name,
    userRole: req.user.role,
    action: AUDIT_ACTIONS.UPDATE,
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    resourceId: userId,
    summary: `User "${req.user.name}" updated own profile`,
    oldValue: diffOld,
    newValue: diffNew,
    metadata: { selfService: true },
    ipAddress: getClientIp(req),
  });

  return sendSuccess(res, { profile: updated }, 'Profile updated successfully');
}

// ============================================================================
// GET MY PERMISSIONS — lightweight endpoint for frontend permission refresh
// ============================================================================

function getMyPermissions(req, res) {
  return sendSuccess(res, {
    permissions: req.user.permissions || [],
    dept_scoped: req.user.dept_scoped,
    dept_ids: req.user.dept_ids,
  }, 'Permissions retrieved successfully');
}

module.exports = {
  getMyProfile,
  updateMyProfile,
  getMyPermissions,
};
