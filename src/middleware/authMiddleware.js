/**
 * ============================================================================
 * AUTH MIDDLEWARE - Authentication & Authorization (SIMPLIFIED)
 * ============================================================================
 * Handles JWT validation and role-based access control
 * Single database - no multi-tenant pool logic
 * * Supports 4 user types:
 * 1. SYSADMIN - System administrator (NOT in database - from .env)
 * 2. ADMIN (users table) - College administrator
 * 3. TEACHER (users table) - College teacher
 * 4. STUDENT (students table) - College student
 * * * SECURITY NOTE:
 * Reads token from HttpOnly Cookie ('token')
 * Requires 'cookie-parser' middleware in app.js
 * ============================================================================
 */

const jwtHelper = require('../utils/jwtHelper');
const logger = require('../config/logger');
const { getMainPool } = require('../config/db');
const {
  ROLES,
  ERROR_MESSAGES,
  HTTP_STATUS,
  LOG,
  STATUS
} = require('../config/constants');

/**
 * Query user based on role
 * * SYSADMIN: No database query (verified during login)
 * ADMIN, TEACHER: Query users table
 * STUDENT: Query students table
 * * @param {Object} mainPool - Database connection pool
 * @param {string} userId - User ID
 * @param {string} role - User role from JWT payload
 * @returns {Object} User data or null
 */
async function queryUserByRole(mainPool, userId, role) {
  try {
    // ====================================================================
    // SYSADMIN: No database lookup (verified during login from .env)
    // ====================================================================
    if (role === ROLES.SYSADMIN) {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Sysadmin token verified`,
        { user_id: userId }
      );
      return {
        id: userId,
        user_status: STATUS.ACTIVE,
        college_id: null,
        user_role: ROLES.SYSADMIN,
        college_status: STATUS.ACTIVE
      };
    }

    // ====================================================================
    // STUDENT: Query from students table
    // ====================================================================
    if (role === ROLES.STUDENT) {
      const studentQuery = `
        SELECT 
          s.student_id as id,
         s.student_status AS user_status,

          s.college_id,
          $1 as user_role,
          c.college_status
        FROM students s
        JOIN colleges c ON s.college_id = c.college_id
        WHERE s.student_id = $2
        LIMIT 1
      `;

      const { rows } = await mainPool.query(studentQuery, [
        ROLES.STUDENT,
        userId
      ]);
      return rows.length > 0 ? rows[0] : null;
    }

    // ====================================================================
    // ADMIN, TEACHER: Query from users table
    // ====================================================================
    const userQuery = `
      SELECT 
        u.user_id as id,
        u.user_status,
        u.college_id,
        u.user_role,
        c.college_status
      FROM users u
      JOIN colleges c ON u.college_id = c.college_id
      WHERE u.user_id = $1
      LIMIT 1
    `;

    const { rows } = await mainPool.query(userQuery, [userId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    logger.error(
      `${LOG.TRANSACTION_PREFIX} Error querying user by role`,
      { error: err.message, user_id: userId, role }
    );
    return null;
  }
}

/**
 * Authentication Middleware
 * * Flow:
 * 1. Extract JWT token from HttpOnly Cookie (UPDATED)
 * 2. Verify JWT signature and expiration
 * 3. Query correct table based on role:
 * - SYSADMIN → No query (verified at login from .env)
 * - STUDENT → students table
 * - ADMIN/TEACHER → users table
 * 4. Verify user is active
 * 5. Verify college is active (if not sysadmin)
 * 6. Attach user to request
 */
async function authMiddleware(req, res, next) {
  try {
    // ====================================================================
    // Step 1: Extract Token from Cookie
    // ====================================================================
    // CHANGED: Reading from req.cookies.token (matches res.cookie('token', ...))
    const token = req.cookies && req.cookies.token;

    if (!token) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Missing authentication cookie`,
        { ip: req.ip, path: req.path }
      );
      
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Authentication required' // Clearer message for frontend
      });
    }

    // ====================================================================
    // Step 2: Verify JWT signature and expiration
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Verifying JWT token`);

    const payload = jwtHelper.verify(token);

    if (!payload) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Invalid or expired token`,
        { ip: req.ip }
      );
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN
      });
    }

    // ====================================================================
    // Step 3: Validate user in correct table based on role
    // ====================================================================
    const mainPool = getMainPool();

    logger.debug(`${LOG.TRANSACTION_PREFIX} Validating user in database`, {
      user_id: payload.id,
      role: payload.role
    });

    const dbUser = await queryUserByRole(mainPool, payload.id, payload.role);

    if (!dbUser) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} User not found in database`,
        {
          user_id: payload.id,
          role: payload.role,
          ip: req.ip
        }
      );
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.INVALID_TOKEN
      });
    }

    // Verify user is active
    if (dbUser.user_status !== STATUS.ACTIVE) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} User account is not active`,
        {
          user_id: payload.id,
          status: dbUser.user_status,
          role: payload.role,
          ip: req.ip
        }
      );
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'User account is not active'
      });
    }

    // Verify college is active (skip for sysadmin - no college)
    if (payload.role !== ROLES.SYSADMIN && dbUser.college_status !== STATUS.ACTIVE) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} College is not active`,
        {
          user_id: payload.id,
          college_id: dbUser.college_id,
          role: payload.role,
          ip: req.ip
        }
      );
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'College is not active'
      });
    }

    // ====================================================================
    // Step 4: Attach user to request
    // ====================================================================
    req.user = {
      ...payload,
      college_id: dbUser.college_id,
      
      user_role: dbUser.user_role || payload.role
    };

    logger.debug(
      `${LOG.TRANSACTION_PREFIX} User authenticated successfully`,
      {
        user_id: payload.id,
        role: payload.role,
        college_id: dbUser.college_id
      }
    );

    return next();
  } catch (err) {
    logger.error(
      `${LOG.TRANSACTION_PREFIX} Unexpected error in auth middleware`,
      { error: err.message, ip: req.ip }
    );
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: ERROR_MESSAGES.SERVER_ERROR
    });
  }
}

/**
 * Role-Based Access Control (RBAC) Middleware
 * * Validates user has one of the required roles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} requireRole: No authenticated user`,
          { ip: req.ip, path: req.path }
        );
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: ERROR_MESSAGES.UNAUTHORIZED
        });
      }

      if (!allowedRoles.includes(user.role)) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Insufficient permissions`,
          {
            user_id: user.id,
            user_role: user.role,
            required_roles: allowedRoles,
            path: req.path,
            ip: req.ip
          }
        );
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.FORBIDDEN
        });
      }

      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Role validation passed`,
        { user_id: user.id, role: user.role }
      );

      return next();
    } catch (err) {
      logger.error(
        `${LOG.TRANSACTION_PREFIX} Unexpected error in requireRole`,
        { error: err.message }
      );
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: ERROR_MESSAGES.SERVER_ERROR
      });
    }
  };
}

module.exports = {
  authMiddleware,
  requireRole
};