/**
 * ============================================================================
 * PERMISSION CONTROLLER — Role templates + per-user permission management
 * ============================================================================
 */

const permissionService = require('../../services/college/permission.service');
const { sendSuccess } = require('../../utils/responseHelper');
const { logAudit, getClientIp, computeAuditDiff } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

// ============================================================================
// GET ALL ROLE PERMISSIONS
// ============================================================================

async function getAllRolePermissions(req, res) {
  const roles = await permissionService.getAllRolePermissions(req.user.college_id);
  return sendSuccess(res, { roles }, 'Role permissions retrieved successfully');
}

// ============================================================================
// GET AVAILABLE PERMISSIONS (metadata for UI matrix)
// ============================================================================

async function getAvailablePermissions(req, res) {
  const metadata = permissionService.getAvailablePermissions();
  return sendSuccess(res, metadata, 'Available permissions retrieved successfully');
}

// ============================================================================
// UPDATE ROLE PERMISSIONS
// ============================================================================

async function updateRolePermissions(req, res) {
  const { role } = req.params;
  const { permissions, dept_scoped } = req.validated;
  const collegeId = req.user.college_id;

  // Fetch old permissions for audit diff
  const allPerms = await permissionService.getAllRolePermissions(collegeId);
  const oldPerm = allPerms.find(r => r.role === role);

  const result = await permissionService.updateRolePermissions(
    collegeId, role, permissions, dept_scoped
  );

  // Audit log
  const { old: diffOld, new: diffNew } = computeAuditDiff(
    oldPerm ? { permissions: oldPerm.permissions, dept_scoped: oldPerm.dept_scoped } : null,
    { permissions, dept_scoped }
  );

  logAudit(query, {
    collegeId,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: AUDIT_ACTIONS.UPDATE,
    resourceType: AUDIT_RESOURCE_TYPES.ROLE_PERMISSION,
    resourceId: role,
    summary: `Updated permissions for role "${role}" (${permissions.length} permissions, dept_scoped=${dept_scoped})`,
    oldValue: diffOld,
    newValue: diffNew,
    metadata: { role, permissionCount: permissions.length, dept_scoped },
    ipAddress: getClientIp(req),
  });

  return sendSuccess(res, { role: result }, `Permissions for "${role}" updated successfully`);
}

// ============================================================================
// RESET ROLE TO DEFAULT
// ============================================================================

async function resetRoleToDefault(req, res) {
  const { role } = req.params;
  const collegeId = req.user.college_id;

  // Fetch old permissions for audit diff
  const allPerms = await permissionService.getAllRolePermissions(collegeId);
  const oldPerm = allPerms.find(r => r.role === role);

  const result = await permissionService.resetRoleToDefault(collegeId, role);

  logAudit(query, {
    collegeId,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: AUDIT_ACTIONS.UPDATE,
    resourceType: AUDIT_RESOURCE_TYPES.ROLE_PERMISSION,
    resourceId: role,
    summary: `Reset permissions for role "${role}" to defaults`,
    oldValue: oldPerm ? { permissions: oldPerm.permissions, dept_scoped: oldPerm.dept_scoped } : null,
    newValue: { permissions: result.permissions, dept_scoped: result.dept_scoped },
    metadata: { role, action: 'reset_to_default' },
    ipAddress: getClientIp(req),
  });

  return sendSuccess(res, { role: result }, `Permissions for "${role}" reset to defaults`);
}

// ============================================================================
// COPY PERMISSIONS BETWEEN ROLES
// ============================================================================

async function copyPermissions(req, res) {
  const { source_role, target_role } = req.validated;
  const collegeId = req.user.college_id;

  // Fetch old permissions for audit diff
  const allPerms = await permissionService.getAllRolePermissions(collegeId);
  const oldTarget = allPerms.find(r => r.role === target_role);
  const source = allPerms.find(r => r.role === source_role);

  const result = await permissionService.copyPermissions(collegeId, source_role, target_role);

  logAudit(query, {
    collegeId,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: AUDIT_ACTIONS.UPDATE,
    resourceType: AUDIT_RESOURCE_TYPES.ROLE_PERMISSION,
    resourceId: target_role,
    summary: `Copied permissions from "${source_role}" to "${target_role}"`,
    oldValue: oldTarget ? { permissions: oldTarget.permissions, dept_scoped: oldTarget.dept_scoped } : null,
    newValue: { permissions: result.permissions, dept_scoped: result.dept_scoped },
    metadata: { source_role, target_role, action: 'copy' },
    ipAddress: getClientIp(req),
  });

  return sendSuccess(res, {
    source: source,
    target: result,
  }, `Permissions copied from "${source_role}" to "${target_role}"`);
}

// ============================================================================
// ========== PER-USER PERMISSION HANDLERS ==========
// ============================================================================

// ============================================================================
// GET COLLEGE USERS WITH PERMISSIONS (paginated)
// ============================================================================

async function getCollegeUsersWithPermissions(req, res) {
  const result = await permissionService.getCollegeUsersWithPermissions(
    req.user.college_id,
    req.validated || req.query
  );
  return sendSuccess(res, result, 'Users with permissions retrieved successfully');
}

// ============================================================================
// GET SINGLE USER PERMISSIONS
// ============================================================================

async function getUserPermissions(req, res) {
  const result = await permissionService.getUserPermissions(
    req.params.userId,
    req.user.college_id
  );
  return sendSuccess(res, result, 'User permissions retrieved successfully');
}

// ============================================================================
// UPDATE USER PERMISSIONS + DEPARTMENTS
// ============================================================================

async function updateUserPermissions(req, res) {
  const { userId } = req.params;
  const { permissions, dept_ids, expected_updated_at } = req.validated;
  const collegeId = req.user.college_id;

  // Fetch old data for audit (graceful — user may have no permissions yet)
  const oldData = await permissionService.getUserPermissions(userId, collegeId)
    .then(old => ({ permissions: old.user.permissions, dept_ids: old.user.departments.map(d => d.dept_id) }))
    .catch(() => null);

  const result = await permissionService.updateUserPermissions(
    userId, collegeId, permissions, dept_ids, expected_updated_at
  );

  // Audit log
  const { old: diffOld, new: diffNew } = computeAuditDiff(
    oldData,
    { permissions, dept_ids }
  );

  logAudit(query, {
    collegeId,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: AUDIT_ACTIONS.UPDATE,
    resourceType: AUDIT_RESOURCE_TYPES.USER_PERMISSION,
    resourceId: userId,
    summary: `Updated permissions for user (${permissions.length} permissions, ${dept_ids.length} departments)`,
    oldValue: diffOld,
    newValue: diffNew,
    metadata: { targetUserId: userId, permissionCount: permissions.length, deptCount: dept_ids.length },
    ipAddress: getClientIp(req),
  });

  return sendSuccess(res, { config: result }, 'User permissions updated successfully');
}

// ============================================================================
// RESET USER TO ROLE DEFAULT
// ============================================================================

async function resetUserToRoleDefault(req, res) {
  const { userId } = req.params;
  const collegeId = req.user.college_id;

  // Fetch old data for audit (graceful — user may have no permissions yet)
  const oldData = await permissionService.getUserPermissions(userId, collegeId)
    .then(old => ({ permissions: old.user.permissions, dept_ids: old.user.departments.map(d => d.dept_id) }))
    .catch(() => null);

  const result = await permissionService.resetUserToRoleDefault(userId, collegeId);

  logAudit(query, {
    collegeId,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: AUDIT_ACTIONS.UPDATE,
    resourceType: AUDIT_RESOURCE_TYPES.USER_PERMISSION,
    resourceId: userId,
    summary: `Reset user permissions to role defaults`,
    oldValue: oldData,
    newValue: { permissions: result.permissions, dept_ids: result.dept_ids },
    metadata: { targetUserId: userId, action: 'reset_to_default' },
    ipAddress: getClientIp(req),
  });

  return sendSuccess(res, { config: result }, 'User permissions reset to role defaults');
}

// ============================================================================
// COPY PERMISSIONS BETWEEN USERS
// ============================================================================

async function copyUserPermissions(req, res) {
  const { source_user_id, target_user_id } = req.validated;
  const collegeId = req.user.college_id;

  // Fetch old target data for audit (graceful — user may have no permissions yet)
  const oldTarget = await permissionService.getUserPermissions(target_user_id, collegeId)
    .then(old => ({ permissions: old.user.permissions, dept_ids: old.user.departments.map(d => d.dept_id) }))
    .catch(() => null);

  const result = await permissionService.copyUserPermissions(
    source_user_id, target_user_id, collegeId
  );

  logAudit(query, {
    collegeId,
    userId: req.user.id,
    userName: req.user.name,
    userRole: req.user.role,
    action: AUDIT_ACTIONS.UPDATE,
    resourceType: AUDIT_RESOURCE_TYPES.USER_PERMISSION,
    resourceId: target_user_id,
    summary: `Copied permissions from user ${source_user_id} to user ${target_user_id}`,
    oldValue: oldTarget,
    newValue: { permissions: result.permissions, dept_ids: result.dept_ids },
    metadata: { sourceUserId: source_user_id, targetUserId: target_user_id, action: 'copy' },
    ipAddress: getClientIp(req),
  });

  return sendSuccess(res, { config: result }, 'Permissions copied between users successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Role templates
  getAllRolePermissions,
  getAvailablePermissions,
  updateRolePermissions,
  resetRoleToDefault,
  copyPermissions,
  // Per-user
  getCollegeUsersWithPermissions,
  getUserPermissions,
  updateUserPermissions,
  resetUserToRoleDefault,
  copyUserPermissions,
};
