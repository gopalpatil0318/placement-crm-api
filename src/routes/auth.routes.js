/**
 * ============================================================================
 * AUTH ROUTES — Shared Token Refresh (all user types)
 * ============================================================================
 *   POST /api/auth/refresh — Exchange refresh token for new access + refresh tokens
 * ============================================================================
 */

const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authController = require('../controllers/auth.controller');
const { apiLimiter } = require('../config/rateLimiter');

const router = Router();

// Rate limit refresh attempts (prevent abuse)
router.post('/refresh', apiLimiter, asyncHandler(authController.refresh));

module.exports = router;
