/**
 * ============================================================================
 * USER ROUTES - User Management API
 * ============================================================================
 * Single Database Architecture
 * - POST /users - Create user (COLLEGEADMIN only)
 * - GET /users - List users (COLLEGEADMIN/teacher)
 * - GET /users/:userId - Get user
 * - PUT /users/:userId - Update user (COLLEGEADMIN only)
 * - DELETE /users/:userId - Delete user (COLLEGEADMIN only)
 */

const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateRequest');
const { apiLimiter } = require('../config/rateLimiter');

const {
  createUserSchema,
  updateUserSchema,
  listUserSchema,
  toggleUserStatusSchema
} = require('../validators/userValidator');

const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /api/v1/users
 * Create new user (COLLEGEADMIN only)
 */
router.post(
  '/create-user',
  requireRole(ROLES.COLLEGEADMIN),
  apiLimiter,
  validate(createUserSchema),
  userController.createUser
);

/**
 * GET /api/college
 * List users in college (COLLEGEADMIN/teacher)
 */
router.get(
  '/users',
  requireRole(ROLES.COLLEGEADMIN),
  apiLimiter,
  validate(listUserSchema),
  userController.listUsers
);

/**
 * GET /api/college/:userId
 * Get single user (COLLEGEADMIN/teacher)
 */
router.get(
  '/user/:userId',
  requireRole(ROLES.COLLEGEADMIN, ROLES.TEACHER),
  apiLimiter,
  userController.getUser
);

/**
 * PUT /api/college/:userId
 * Update user (COLLEGEADMIN only)
 */
router.put(
  '/update-user/:userId',
  requireRole(ROLES.COLLEGEADMIN),
  apiLimiter,
  validate(updateUserSchema),
  userController.updateUser
);

/**
 * DELETE /api/college/:userId
 * Soft delete user (COLLEGEADMIN only)
 */
router.delete(
  '/user/:userId',
  requireRole(ROLES.COLLEGEADMIN),
  apiLimiter,
  userController.deleteUser
);
router.put(
  '/user/:userId/status',
  requireRole(ROLES.COLLEGEADMIN),
  apiLimiter,
  validate(toggleUserStatusSchema),
  userController.toggleUserStatus
);

module.exports = router;
