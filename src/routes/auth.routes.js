/**
 * ============================================================================
 * AUTH ROUTES - Authentication API
 * ============================================================================
 * - POST /login - System admin and college user login
 * - POST /logout - Logout endpoint
 * - GET /verify - Verify token validity
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateRequest');
const { authLimiter } = require('../config/rateLimiter');

const { loginSchema } = require('../validators/authValidator');

/**
 * POST /api/v1/auth/login
 * System admin and college user login
 * 
 * Rate Limiter: authLimiter (STRICT - 5 attempts per 15 minutes)
 * Validation: loginSchema required
 */
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login
);

/**
 * POST /api/v1/auth/logout
 * Logout user (stateless JWT - optional)
 * 
 * Requires: Authentication
 */
router.post(
  '/logout',
  authMiddleware,
  authLimiter,
  authController.logout
);

/**
 * GET /api/v1/auth/verify
 * Verify current token validity
 * 
 * Requires: Authentication
 */
router.get(
  '/verify',
  authMiddleware, 
  authController.verifyToken
);

module.exports = router;