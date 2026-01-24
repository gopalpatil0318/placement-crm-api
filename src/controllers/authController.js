/**
 * ============================================================================
 * AUTH CONTROLLER - User Authentication Management (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - System admin login
 * - College user login
 * - Token verification
 * - Logout endpoint
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
          token: adminToken,
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
        token: authResult.token,
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
 * Logout user (stateless JWT - optional endpoint)
 */
async function logout(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/auth/logout`, {
    user_id: req.user?.id,
    user_role: req.user?.role,
    ip: req.ip
  });

  try {
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
 * Verify current token validity
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