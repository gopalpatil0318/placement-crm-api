/**
 * ============================================================================
 * AUTH MIDDLEWARE — Authentication & Authorization
 * ============================================================================
 * Single-database architecture — no multi-tenant pool logic
 *
 * Supports 6 user types:
 *   SYSADMIN      → .env credentials (no DB lookup)
 *   COLLEGEADMIN  → users table
 *   TPO           → users table
 *   TPC           → users table
 *   HOD           → users table
 *   TEACHER       → users table
 *   STUDENT       → students table (separate table)
 *
 * Token source: HttpOnly cookie ('token')
 * ============================================================================
 */

const { verifyToken } = require('../utils/jwtHelper');
const { sendError } = require('../utils/responseHelper');
const logger = require('../config/logger');
const { getMainPool } = require('../config/db');
const {
  ROLES,
  ERROR_MESSAGES,
  HTTP_STATUS,
  LOG,
  STATUS,
} = require('../config/constants');

// ============================================================================
// ROLE → STUDENT check (students live in a different table)
// ============================================================================

const STUDENT_ROLE = 'student';

// ============================================================================
// queryUserByRole — Fetch active user from correct table
// ============================================================================

async function queryUserByRole(pool, userId, role) {
  try {
    // ------------------------------------------------------------------
    // SYSADMIN: No database lookup (verified at login via .env)
    // ------------------------------------------------------------------
    if (role === ROLES.SYSADMIN) {
      logger.debug(`${LOG.AUTH} Sysadmin token verified`, { userId });
      return {
        id: userId,
        user_name: 'System Admin',
        user_status: STATUS.ACTIVE,
        college_id: null,
        user_role: ROLES.SYSADMIN,
        college_status: STATUS.ACTIVE,
      };
    }

    // ------------------------------------------------------------------
    // STUDENT: students table + college join
    // ------------------------------------------------------------------
    if (role === STUDENT_ROLE) {
      const { rows } = await pool.query(
        `SELECT
           s.student_id  AS id,
           s.first_name || ' ' || s.last_name AS user_name,
           s.student_status AS user_status,
           s.college_id,
           s.dept_id,
           $1::text       AS user_role,
           c.college_status
         FROM students s
         JOIN colleges c ON s.college_id = c.college_id
         WHERE s.student_id = $2
         LIMIT 1`,
        [STUDENT_ROLE, userId]
      );
      return rows[0] || null;
    }

    // ------------------------------------------------------------------
    // COLLEGEADMIN / TPO / HOD / TEACHER: users table + college join
    // ------------------------------------------------------------------
    const { rows } = await pool.query(
      `SELECT
         u.user_id     AS id,
         u.user_name,
         u.user_status,
         u.college_id,
         u.dept_id,
         u.user_role,
         c.college_status
       FROM users u
       JOIN colleges c ON u.college_id = c.college_id
       WHERE u.user_id = $1
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error(`${LOG.AUTH} Error querying user`, {
      error: err.message,
      userId,
      role,
    });
    return null;
  }
}

// ============================================================================
// authenticate — Main authentication middleware
// ============================================================================

async function authenticate(req, res, next) {
  try {
    // 1. Extract token from HttpOnly cookie
    const token = req.cookies?.token;

    if (!token) {
      logger.warn(`${LOG.SECURITY} Missing auth cookie`, {
        ip: req.ip,
        path: req.path,
      });
      return sendError(res, ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
    }

    // 2. Verify JWT
    const payload = verifyToken(token);

    if (!payload) {
      return sendError(res, ERROR_MESSAGES.INVALID_TOKEN, HTTP_STATUS.UNAUTHORIZED);
    }

    // 3. Look up user in correct table
    const pool = getMainPool();
    const dbUser = await queryUserByRole(pool, payload.id, payload.role);

    if (!dbUser) {
      logger.warn(`${LOG.SECURITY} Authenticated user not found in DB`, {
        userId: payload.id,
        role: payload.role,
        ip: req.ip,
      });
      return sendError(res, ERROR_MESSAGES.INVALID_TOKEN, HTTP_STATUS.UNAUTHORIZED);
    }

    // 4. Check user is active
    if (dbUser.user_status !== STATUS.ACTIVE) {
      logger.warn(`${LOG.SECURITY} Inactive user attempted access`, {
        userId: payload.id,
        status: dbUser.user_status,
      });
      return sendError(res, ERROR_MESSAGES.ACCOUNT_INACTIVE, HTTP_STATUS.UNAUTHORIZED);
    }

    // 5. Check college is active (skip for sysadmin)
    if (payload.role !== ROLES.SYSADMIN && dbUser.college_status !== STATUS.ACTIVE) {
      logger.warn(`${LOG.SECURITY} Inactive college`, {
        userId: payload.id,
        collegeId: dbUser.college_id,
      });
      return sendError(res, ERROR_MESSAGES.COLLEGE_INACTIVE, HTTP_STATUS.UNAUTHORIZED);
    }

    // 6. Attach user to request
    req.user = {
      id: dbUser.id,
      name: dbUser.user_name || 'Unknown',
      role: dbUser.user_role || payload.role,
      college_id: dbUser.college_id,
      dept_id: dbUser.dept_id || null,
    };

    logger.debug(`${LOG.AUTH} Authenticated`, {
      userId: req.user.id,
      role: req.user.role,
      collegeId: req.user.college_id,
    });

    return next();
  } catch (err) {
    logger.error(`${LOG.AUTH} Auth middleware error`, {
      error: err.message,
      ip: req.ip,
    });
    return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// ============================================================================
// requireRole — RBAC middleware factory
// ============================================================================

/**
 * Allow only specified roles to access the route.
 *
 * @param {...string} allowedRoles - e.g. ROLES.SYSADMIN, ROLES.COLLEGEADMIN
 * @returns {Function} Express middleware
 *
 * Usage:
 *   router.get('/colleges', authenticate, requireRole(ROLES.SYSADMIN), handler);
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`${LOG.SECURITY} Insufficient permissions`, {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
      });
      return sendError(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    return next();
  };
}

// ============================================================================
// requireCollegeAccess — Ensure user belongs to the requested college
// ============================================================================

/**
 * Verify that req.user.college_id matches req.params.collegeId.
 * Sysadmin bypasses this check (can access any college).
 */
function requireCollegeAccess(req, res, next) {
  if (!req.user) {
    return sendError(res, ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
  }

  // Sysadmin can access any college
  if (req.user.role === ROLES.SYSADMIN) {
    return next();
  }

  const paramCollegeId = req.params.collegeId || req.params.college_id;

  if (paramCollegeId && req.user.college_id !== paramCollegeId) {
    logger.warn(`${LOG.SECURITY} College access denied`, {
      userId: req.user.id,
      userCollege: req.user.college_id,
      requestedCollege: paramCollegeId,
    });
    return sendError(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }

  return next();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  authenticate,
  requireRole,
  requireCollegeAccess,
};