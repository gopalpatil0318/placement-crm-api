/**
 * ============================================================================
 * COLLEGE USER ROUTES — Auth & User Management Endpoints
 * ============================================================================
 * Base path: /api/college
 *
 * Auth (public / authenticated):
 *   POST   /login                       authLimiter + validate
 *   POST   /logout                      authenticate
 *   POST   /forgot_password             authLimiter + validate
 *   POST   /reset_password              authLimiter + validate
 *   POST   /change_password             authenticate + validate
 *
 * Management (COLLEGEADMIN only):
 *   POST   /create_user                 authenticate + requireRole + validate
 *   GET    /get_all_users               authenticate + requireRole + validate(query)
 *   GET    /get_user/:userId            authenticate + requireRole
 *   PUT    /update_user/:userId         authenticate + requireRole + validate
 *   PATCH  /toggle_user_status/:userId  authenticate + requireRole + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/user.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { authLimiter, apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    collegeLoginSchema,
    forgotPasswordSchema,
    changePasswordSchema,
    resetPasswordSchema,
    createUserSchema,
    updateUserSchema,
    listUsersSchema,
    toggleUserStatusSchema,
    userIdParamSchema,
} = require('../../validators/college/user.validator');

// ============================================================================
// AUTH ROUTES
// ============================================================================

router.post(
    '/login',
    authLimiter,
    validate(collegeLoginSchema),
    asyncHandler(controller.login)
);

router.post(
    '/logout',
    authenticate,
    asyncHandler(controller.logout)
);

router.post(
    '/forgot_password',
    authLimiter,
    validate(forgotPasswordSchema),
    asyncHandler(controller.forgotPassword)
);

router.post(
    '/reset_password',
    authLimiter,
    validate(resetPasswordSchema),
    asyncHandler(controller.resetPassword)
);

router.post(
    '/change_password',
    authenticate,
    validate(changePasswordSchema),
    asyncHandler(controller.changePassword)
);

// ============================================================================
// USER MANAGEMENT ROUTES (COLLEGEADMIN only)
// ============================================================================

router.post(
    '/create_user',
    authenticate,
    requireRole(ROLES.COLLEGEADMIN),
    apiLimiter,
    validate(createUserSchema),
    asyncHandler(controller.createUser)
);

router.get(
    '/get_all_users',
    authenticate,
    requireRole(ROLES.COLLEGEADMIN),
    apiLimiter,
    validate(listUsersSchema, 'query'),
    asyncHandler(controller.getAllUsers)
);

router.get(
    '/get_user/:userId',
    authenticate,
    requireRole(ROLES.COLLEGEADMIN),
    apiLimiter,
    validate(userIdParamSchema, 'params'),
    asyncHandler(controller.getUser)
);

router.put(
    '/update_user/:userId',
    authenticate,
    requireRole(ROLES.COLLEGEADMIN),
    apiLimiter,
    validate(userIdParamSchema, 'params'),
    validate(updateUserSchema),
    asyncHandler(controller.updateUser)
);

router.patch(
    '/toggle_user_status/:userId',
    authenticate,
    requireRole(ROLES.COLLEGEADMIN),
    apiLimiter,
    validate(userIdParamSchema, 'params'),
    validate(toggleUserStatusSchema),
    asyncHandler(controller.toggleUserStatus)
);

module.exports = router;
