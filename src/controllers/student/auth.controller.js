/**
 * ============================================================================
 * STUDENT AUTH CONTROLLER — Route Handlers for Student Authentication
 * ============================================================================
 * Endpoints:
 *   POST  /api/student/login            — Student login
 *   POST  /api/student/logout           — Student logout
 *   POST  /api/student/forgot_password  — Send password reset email
 *   POST  /api/student/reset_password   — Reset password from email link
 *   POST  /api/student/change_password  — Change own password
 * ============================================================================
 */

const authService = require('../../services/student/auth.service');
const { sendSuccess } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { SUCCESS_MESSAGES, LOG } = require('../../config/constants');

// Cookie options for JWT (same as college auth)
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: false,          // set true in production behind HTTPS
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ============================================================================
// 1. LOGIN
// ============================================================================

async function login(req, res) {
    const { email, password } = req.validated;

    const result = await authService.loginStudent(email, password);

    // Set JWT in HttpOnly cookie
    res.cookie('token', result.token, COOKIE_OPTIONS);

    logger.info(`${LOG.AUTH} Student login successful`, {
        studentId: result.student.student_id,
    });

    return sendSuccess(res, {
        student: result.student,
    }, SUCCESS_MESSAGES.LOGIN_SUCCESSFUL);
}

// ============================================================================
// 2. LOGOUT
// ============================================================================

async function logout(req, res) {
    res.clearCookie('token', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
    });

    logger.info(`${LOG.AUTH} Student logged out`, {
        studentId: req.user?.id,
    });

    return sendSuccess(res, null, SUCCESS_MESSAGES.LOGOUT_SUCCESSFUL);
}

// ============================================================================
// 3. FORGOT PASSWORD
// ============================================================================

async function forgotPassword(req, res) {
    const { email } = req.validated;

    const result = await authService.forgotPassword(email);

    return sendSuccess(res, null, result.message);
}

// ============================================================================
// 3b. RESET PASSWORD (from email link token)
// ============================================================================

async function resetPassword(req, res) {
    const { token, new_password } = req.validated;

    await authService.resetPassword(token, new_password);

    return sendSuccess(res, null, 'Password has been reset successfully. Please log in with your new password.');
}

// ============================================================================
// 4. CHANGE PASSWORD
// ============================================================================

async function changePassword(req, res) {
    const { current_password, new_password } = req.validated;

    const result = await authService.changePassword(
        req.user.id,
        req.user.college_id,
        current_password,
        new_password
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.PASSWORD_CHANGED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    login,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
};
