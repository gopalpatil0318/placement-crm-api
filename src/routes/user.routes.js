/**
 * ============================================================================
 * USER ROUTES - User Management API
 * ============================================================================
 * Single Database Architecture
 * - POST /users - Create user (admin only)
 * - GET /users - List users (admin/teacher)
 * - GET /users/:userId - Get user
 * - PUT /users/:userId - Update user (admin only)
 * - DELETE /users/:userId - Delete user (admin only)
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
  listUserSchema
} = require('../validators/userValidator');

const { ROLES } = require('../config/constants');

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /api/v1/users
 * Create new user (admin only)
 */
router.post(
  '/create-user',
  requireRole(ROLES.ADMIN),
  apiLimiter,
  validate(createUserSchema),
  userController.createUser
);

/**
 * GET /api/college
 * List users in college (admin/teacher)
 */
router.get(
  '/users',
  requireRole(ROLES.ADMIN, ROLES.TEACHER),
  apiLimiter,
  validate(listUserSchema),
  userController.listUsers
);

/**
 * GET /api/college/:userId
 * Get single user (admin/teacher)
 */
router.get(
  '/user/:userId',
  requireRole(ROLES.ADMIN, ROLES.TEACHER),
  apiLimiter,
  userController.getUser
);

/**
 * PUT /api/college/:userId
 * Update user (admin only)
 */
router.put(
  '/update-user/:userId',
  requireRole(ROLES.ADMIN),
  apiLimiter,
  validate(updateUserSchema),
  userController.updateUser
);

/**
 * DELETE /api/college/:userId
 * Soft delete user (admin only)
 */
router.delete(
  '/user/:userId',
  requireRole(ROLES.ADMIN),
  apiLimiter,
  userController.deleteUser
);

module.exports = router;