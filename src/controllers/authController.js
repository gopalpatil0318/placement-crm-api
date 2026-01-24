/**
 * ============================================================================
 * AUTH CONTROLLER - User Authentication Management (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - System admin login
 * - College user login
 * - Token verification
 * - Logout endpoint
 * * SECURITY NOTE: 
 * Uses HttpOnly Cookies. Token is NOT sent in JSON body.
 */

const authService = require('../services/authService');
const logger = require('../config/logger');
const { success, error } = require('../utils/responseHelper');
const {
  ROLES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  LOG,
  HTTP_STATUS,
  AUTH
} = require('../config/constants');

// Cookie configuration for security
const COOKIE_OPTIONS = {
  httpOnly: true, // Prevents JS access (XSS protection)
  secure: true, // HTTPS only in production
  sameSite:'none', 
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (matches JWT expiry)
};

/**
 * POST /api/v1/auth/login
 * System admin and college user login
 */
async function login(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/auth/login`, {
    ip: req.ip
  });

  try {
    const { email, password } = req.validated;

    // ====================================================================
    // Step 1: Check system admin credentials
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Checking system admin credentials`);

    const isAdmin = await authService.verifySystemAdminCredentials(email, password);

    if (isAdmin) {
      logger.debug(`${LOG.TRANSACTION_PREFIX} System admin verified`);

      const adminToken = authService.generateAdminToken(email);

      // SET COOKIE HERE - Not in JSON body
      res.cookie('token', adminToken, COOKIE_OPTIONS);

      const duration = Date.now() - startTime;

      logger.info(
        `${LOG.API_END_PREFIX} POST /api/auth/login`,
        {
          email: email,
          role: ROLES.SYSADMIN,
          ip: req.ip,
          duration_ms: duration
        }
      );

      return success(
        res,
        {
          // Token REMOVED from here
          role: ROLES.SYSADMIN,
          email: email,
          type: 'sysadmin'
        },
        SUCCESS_MESSAGES.LOGIN_SUCCESSFUL,
        HTTP_STATUS.OK
      );
    }

    // ====================================================================
    // Step 2: Authenticate college user
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Authenticating college user`);

    const authResult = await authService.authenticateCollegeUser(email, password);

    // SET COOKIE HERE - Not in JSON body
    res.cookie('token', authResult.token, COOKIE_OPTIONS);

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/auth/login`,
      {
        user_id: authResult.user.user_id,
        role: authResult.user.user_role,
        college_id: authResult.user.college_id,
        email: authResult.user.user_email,
        ip: req.ip,
        duration_ms: duration
      }
    );

    return success(
      res,
      {
        // Token REMOVED from here
        role: authResult.user.user_role,
        email: authResult.user.user_email,
        college_id: authResult.user.college_id,
        type: 'college_user'
      },
      SUCCESS_MESSAGES.LOGIN_SUCCESSFUL,
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/auth/login`,
      {
        error: err.message,
        ip: req.ip,
        duration_ms: duration
      }
    );

    if (err.message.includes('Invalid credentials') ||
        err.message.includes('not found') ||
        err.message.includes('inactive') ||
        err.message.includes('not active')) {
      return error(res, 'Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
    }

    if (err.message.includes('Access denied')) {
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * POST /api/v1/auth/logout
 * Logout user (Clears HttpOnly Cookie)
 */
async function logout(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/auth/logout`, {
    user_id: req.user?.id,
    user_role: req.user?.role,
    ip: req.ip
  });

  try {
    // CLEAR COOKIE HERE
    res.clearCookie('token', COOKIE_OPTIONS);

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/auth/logout`,
      {
        user_id: req.user?.id,
        duration_ms: duration
      }
    );

    return success(
      res,
      {},
      SUCCESS_MESSAGES.LOGOUT_SUCCESSFUL,
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/auth/logout`,
      {
        error: err.message,
        user_id: req.user?.id,
        duration_ms: duration
      }
    );

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * GET /api/v1/auth/verify
 * Verify current token validity (Reads from Cookie via Middleware)
 */
async function verifyToken(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} GET /api/auth/verify`, {
    user_id: req.user?.id,
    user_role: req.user?.role
  });

  try {
    const user = req.user;

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} GET /api/auth/verify`,
      {
        user_id: user?.id,
        duration_ms: duration
      }
    );

    return success(
      res,
      {
        id: user.id,
        role: user.role,
        email: user.email,
        college_id: user.college_id || null,
        type: user.id === AUTH.SYSTEM_ADMIN_ID ? 'sysadmin' : 'college_user'
      },
      'Token is valid',
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} GET /api/auth/verify`,
      {
        error: err.message,
        duration_ms: duration
      }
    );

    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  login,
  logout,
  verifyToken
};