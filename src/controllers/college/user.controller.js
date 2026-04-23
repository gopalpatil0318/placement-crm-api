/**
 * ============================================================================
 * COLLEGE USER CONTROLLER — Route Handlers for Auth & User Management
 * ============================================================================
 * Auth (5 endpoints):
 *   POST  /api/college/login
 *   POST  /api/college/logout
 *   POST  /api/college/forgot_password
 *   POST  /api/college/reset_password
 *   POST  /api/college/change_password
 *
 * Management — COLLEGEADMIN only (5 endpoints):
 *   POST  /api/college/create_user
 *   GET   /api/college/get_all_users
 *   GET   /api/college/get_user/:userId
 *   PUT   /api/college/update_user/:userId
 *   PATCH /api/college/toggle_user_status/:userId
 * ============================================================================
 */

const userService = require('../../services/college/user.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const { SUCCESS_MESSAGES, LOG, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');
const { CLEAR_COOKIE_OPTIONS, CLEAR_REFRESH_COOKIE_OPTIONS } = require('../../config/cookie');
const { issueTokenPair } = require('../auth.controller');
const { hashRefreshToken, findRefreshToken, revokeRefreshToken } = require('../../utils/jwtHelper');

// ============================================================================
// AUTH — 1. LOGIN
// ============================================================================

async function login(req, res) {
    const { email, password } = req.validated;

    const result = await userService.loginCollegeUser(email, password);

    // B21: Issue access + refresh token pair
    await issueTokenPair(
        res,
        { id: result.user.user_id, college_id: result.user.college_id, role: result.user.user_role, dept_id: result.user.dept_id || null },
        result.user.user_id,
        'college'
    );

    logger.info(`${LOG.AUTH} College user login successful`, {
        userId: result.user.user_id,
        role: result.user.user_role,
    });

    return sendSuccess(res, {
        user: result.user,
    }, SUCCESS_MESSAGES.LOGIN_SUCCESSFUL);
}

// ============================================================================
// AUTH — 2. LOGOUT
// ============================================================================

async function logout(req, res) {
    // B21: Revoke refresh token if present
    const rawRefreshToken = req.cookies?.refresh_token;
    if (rawRefreshToken) {
        const tokenHash = hashRefreshToken(rawRefreshToken);
        const stored = await findRefreshToken(tokenHash);
        if (stored) {
            await revokeRefreshToken(stored.token_id);
        }
    }

    res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
    res.clearCookie('refresh_token', CLEAR_REFRESH_COOKIE_OPTIONS);

    logger.info(`${LOG.AUTH} College user logged out`, {
        userId: req.user?.id,
    });

    return sendSuccess(res, null, SUCCESS_MESSAGES.LOGOUT_SUCCESSFUL);
}

// ============================================================================
// AUTH — 3. FORGOT PASSWORD
// ============================================================================

async function forgotPassword(req, res) {
    const { email } = req.validated;

    const result = await userService.forgotPassword(email);

    return sendSuccess(res, null, result.message);
}

// ============================================================================
// AUTH — 3b. RESET PASSWORD (from email link token)
// ============================================================================

async function resetPassword(req, res) {
    const { token, new_password } = req.validated;

    await userService.resetPassword(token, new_password);

    return sendSuccess(res, null, 'Password has been reset successfully. Please log in with your new password.');
}

// ============================================================================
// AUTH — 4. CHANGE PASSWORD
// ============================================================================

async function changePassword(req, res) {
    const { current_password, new_password } = req.validated;

    const result = await userService.changePassword(
        req.user.id,
        req.user.college_id,
        current_password,
        new_password
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.PASSWORD_CHANGED);
}

// ============================================================================
// MANAGEMENT — 5. CREATE USER
// ============================================================================

async function createUser(req, res) {
    const result = await userService.createUser(req.validated, req.user.college_id);

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.USER,
        resourceId: result.user_id,
        summary: `Created user "${result.user_name}" with role "${result.user_role}"`,
        newValue: result,
        metadata: { entityName: result.user_name, role: result.user_role },
        ipAddress: getClientIp(req),
    });

    return sendCreated(res, result, SUCCESS_MESSAGES.USER_CREATED);
}

// ============================================================================
// MANAGEMENT — 6. GET ALL USERS
// ============================================================================

async function getAllUsers(req, res) {
    const { users, total, page, limit } = await userService.getAllUsers(
        req.user.college_id,
        req.validated,
        req.deptScope
    );

    return sendPaginated(res, users, total, { page, limit }, 'Users retrieved successfully');
}

// ============================================================================
// MANAGEMENT — 7. GET USER BY ID
// ============================================================================

async function getUser(req, res) {
    const result = await userService.getUserById(req.params.userId, req.user.college_id, req.deptScope);

    return sendSuccess(res, result, 'User retrieved successfully');
}

// ============================================================================
// MANAGEMENT — 8. UPDATE USER
// ============================================================================

async function updateUser(req, res) {
    const result = await userService.updateUser(
        req.params.userId,
        req.user.college_id,
        req.validated,
        req.deptScope
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.USER,
        resourceId: req.params.userId,
        summary: `Updated user "${result.user_name}"`,
        newValue: result,
        metadata: { entityName: result.user_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.USER_UPDATED);
}

// ============================================================================
// MANAGEMENT — 9. TOGGLE USER STATUS
// ============================================================================

async function toggleUserStatus(req, res) {
    const { user_status } = req.validated;

    const result = await userService.toggleUserStatus(
        req.params.userId,
        req.user.college_id,
        user_status,
        req.deptScope
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.USER,
        resourceId: req.params.userId,
        summary: `Changed user "${result.user_name}" status to "${user_status}"`,
        oldValue: { user_status: result._previousStatus },
        newValue: { user_status },
        metadata: { entityName: result.user_name, role: result.user_role },
        ipAddress: getClientIp(req),
    });

    const message = user_status === 'active'
        ? SUCCESS_MESSAGES.USER_ACTIVATED
        : SUCCESS_MESSAGES.USER_DEACTIVATED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Auth
    login,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
    // Management
    createUser,
    getAllUsers,
    getUser,
    updateUser,
    toggleUserStatus,
};
