/**
 * ============================================================================
 * PERMISSION ROUTES — Role Templates + Per-User Permission Management
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN)
 * Only college admin can manage permissions.
 *
 * --- Role Templates ---
 *   GET    /permissions/roles            List all roles with their template permissions
 *   GET    /permissions/available        Get permission modules metadata for UI
 *   PUT    /permissions/roles/:role      Update template permissions for a role
 *   POST   /permissions/reset/:role      Reset a role template to defaults
 *   POST   /permissions/copy             Copy permissions between role templates
 *
 * --- Per-User ---
 *   GET    /permissions/users            List users with their individual permissions
 *   GET    /permissions/users/:userId    Get single user's permissions + all departments
 *   PUT    /permissions/users/:userId    Update a user's permissions + departments
 *   POST   /permissions/users/:userId/reset  Reset user to their role's template
 *   POST   /permissions/users/copy       Copy permissions between users
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/permission.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
  updateRolePermissionsSchema,
  roleParamSchema,
  copyPermissionsSchema,
  usersQuerySchema,
  userIdParamSchema,
  updateUserPermissionsSchema,
  copyUserPermissionsSchema,
} = require('../../validators/college/permission.validator');

// ============================================================================
// AUTH MIDDLEWARE — Only COLLEGEADMIN can manage permissions
// ============================================================================
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN));

// ============================================================================
// ROUTES
// ============================================================================

// List all roles with their current permissions
router.get(
  '/permissions/roles',
  apiLimiter,
  asyncHandler(controller.getAllRolePermissions)
);

// Get available permissions metadata (for UI matrix rendering)
router.get(
  '/permissions/available',
  apiLimiter,
  asyncHandler(controller.getAvailablePermissions)
);

// Update permissions for a specific role
router.put(
  '/permissions/roles/:role',
  apiLimiter,
  validate(roleParamSchema, 'params'),
  validate(updateRolePermissionsSchema),
  asyncHandler(controller.updateRolePermissions)
);

// Reset a role to default permissions
router.post(
  '/permissions/reset/:role',
  apiLimiter,
  validate(roleParamSchema, 'params'),
  asyncHandler(controller.resetRoleToDefault)
);

// Copy permissions from one role to another
router.post(
  '/permissions/copy',
  apiLimiter,
  validate(copyPermissionsSchema),
  asyncHandler(controller.copyPermissions)
);

// ============================================================================
// PER-USER PERMISSION ROUTES
// ============================================================================

// List users with their individual permissions (paginated, filterable)
router.get(
  '/permissions/users',
  apiLimiter,
  validate(usersQuerySchema, 'query'),
  asyncHandler(controller.getCollegeUsersWithPermissions)
);

// IMPORTANT: /copy must come BEFORE /:userId to avoid "copy" matching as a UUID
router.post(
  '/permissions/users/copy',
  apiLimiter,
  validate(copyUserPermissionsSchema),
  asyncHandler(controller.copyUserPermissions)
);

// Get single user's permissions + all college departments
router.get(
  '/permissions/users/:userId',
  apiLimiter,
  validate(userIdParamSchema, 'params'),
  asyncHandler(controller.getUserPermissions)
);

// Update a user's permissions + department assignments
router.put(
  '/permissions/users/:userId',
  apiLimiter,
  validate(userIdParamSchema, 'params'),
  validate(updateUserPermissionsSchema),
  asyncHandler(controller.updateUserPermissions)
);

// Reset a user to their role's template permissions
router.post(
  '/permissions/users/:userId/reset',
  apiLimiter,
  validate(userIdParamSchema, 'params'),
  asyncHandler(controller.resetUserToRoleDefault)
);

module.exports = router;
