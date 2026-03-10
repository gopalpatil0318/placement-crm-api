/**
 * ============================================================================
 * STUDENT AUTH ROUTES — Authentication Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST  /login            authLimiter + validate
 *   POST  /logout           authenticate
 *   POST  /forgot_password  authLimiter + validate
 *   POST  /reset_password   authLimiter + validate
 *   POST  /change_password  authenticate + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/auth.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { authLimiter } = require('../../config/rateLimiter');

const {
    studentLoginSchema,
    studentForgotPasswordSchema,
    studentChangePasswordSchema,
    studentResetPasswordSchema,
} = require('../../validators/student/auth.validator');

// ============================================================================
// AUTH ROUTES
// ============================================================================

// Student login (public, rate limited)
router.post(
    '/login',
    authLimiter,
    validate(studentLoginSchema),
    asyncHandler(controller.login)
);

// Student logout (must be authenticated)
router.post(
    '/logout',
    authenticate,
    asyncHandler(controller.logout)
);

// Forgot password (public, rate limited)
router.post(
    '/forgot_password',
    authLimiter,
    validate(studentForgotPasswordSchema),
    asyncHandler(controller.forgotPassword)
);

// Reset password from email link (public, rate limited)
router.post(
    '/reset_password',
    authLimiter,
    validate(studentResetPasswordSchema),
    asyncHandler(controller.resetPassword)
);

// Change password (must be authenticated)
router.post(
    '/change_password',
    authenticate,
    validate(studentChangePasswordSchema),
    asyncHandler(controller.changePassword)
);

module.exports = router;
