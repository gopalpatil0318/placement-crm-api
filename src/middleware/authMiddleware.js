/**
 * ============================================================================
 * AUTH MIDDLEWARE — Authentication & Authorization
 * ============================================================================
 * Single-database architecture — no multi-tenant pool logic
 *
 * Supports 6 user types:
 *   SYSADMIN      → .env credentials (no DB lookup)
 *   COLLEGEADMIN  → users table (full access — bypasses permission checks)
 *   TPO           → users table (dynamic permissions from user_permissions)
 *   TPC           → users table (dynamic permissions from user_permissions)
 *   HOD           → users table (dynamic permissions from user_permissions)
 *   TEACHER       → users table (dynamic permissions from user_permissions)
 *   STUDENT       → students table (separate table)
 *
 * Token source: HttpOnly cookie ('token')
 *
 * Permission loading:
 *   - For configurable roles (TPO/TPC/HOD/Teacher), permissions are loaded from
 *     the user_permissions table (per-user) with in-memory LRU caching (5 min TTL).
 *   - Fallback: if no user_permissions row exists, loads from college_role_permissions
 *     template and auto-creates the user row (lazy migration).
 *   - Department scoping: derived from user_departments — if the user has assigned
 *     departments, they are scoped; no departments = all-department access.
 *   - College admin always has full access (hardcoded bypass).
 * ============================================================================
 */

const { verifyToken } = require('../utils/jwtHelper');
const { sendError } = require('../utils/responseHelper');
const logger = require('../config/logger');
const { getMainPool, query } = require('../config/db');
const permissionCache = require('../utils/permissionCache');
const {
  ROLES,
  CONFIGURABLE_ROLES,
  FEATURES,
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
           s.student_passout_year AS passout_year,
           $1::text       AS user_role,
           c.college_status,
           c.subscription_status
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
         c.college_status,
         c.subscription_status
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
      dept_id: dbUser.dept_id || null,          // legacy single dept (backward compat)
      passout_year: dbUser.passout_year || null, // students only
      subscription_status: dbUser.subscription_status || 'none',
      // Dynamic permission fields (populated below for configurable roles)
      permissions: null,                        // string[] or null
      dept_scoped: false,                       // whether queries should filter by dept
      dept_ids: [],                             // assigned department IDs (from user_departments)
    };

    // 7. Load dynamic permissions for configurable roles
    //    College admin & sysadmin bypass — they always have full access.
    //    Students don't use this permission system.
    if (CONFIGURABLE_ROLES.includes(req.user.role)) {
      const permConfig = await loadPermissions(pool, req.user.id, req.user.college_id, req.user.role);
      req.user.permissions = permConfig.permissions;

      // 8. Always load dept_ids for configurable roles
      //    dept_scoped is derived: has departments = scoped, no departments = all access
      req.user.dept_ids = await loadUserDeptIds(pool, req.user.id);
      req.user.dept_scoped = req.user.dept_ids.length > 0;
    }

    // 9. Set req.deptScope for service layer consumption
    //    - null  = no department filtering (admin, or user with no dept assignments)
    //    - []    = never happens (dept_scoped only true when dept_ids.length > 0)
    //    - [id1, id2] = filter to these departments
    req.deptScope = req.user.dept_scoped ? req.user.dept_ids : null;

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
// loadPermissions — Fetch role permissions (cached, 5 min TTL)
// ============================================================================

/**
 * Load permission config for a specific user from cache or DB.
 * Queries user_permissions by user_id. Falls back to role template
 * (college_role_permissions) if no user row exists, and auto-creates
 * the user row (lazy migration).
 *
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} userId - User UUID
 * @param {string} collegeId - College UUID
 * @param {string} role - One of: tpo, tpc, hod, teacher
 * @returns {Promise<{ permissions: string[] }>}
 */
async function loadPermissions(pool, userId, collegeId, role) {
  // 1. Check cache first (per-user key)
  const cached = permissionCache.getUser(userId);
  if (cached) return cached;

  // 2. Cache miss — query user_permissions
  try {
    const { rows } = await pool.query(
      `SELECT permissions FROM user_permissions WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    let permissions = [];

    if (rows.length > 0) {
      permissions = Array.isArray(rows[0].permissions) ? rows[0].permissions : [];
    } else {
      // No user_permissions row — fallback to role template (lazy migration)
      logger.info(`${LOG.AUTH} No user_permissions row, falling back to role template`, {
        userId, collegeId, role,
      });
      const templateResult = await pool.query(
        `SELECT permissions FROM college_role_permissions
         WHERE college_id = $1 AND role = $2 LIMIT 1`,
        [collegeId, role]
      );
      if (templateResult.rows.length > 0) {
        permissions = Array.isArray(templateResult.rows[0].permissions)
          ? templateResult.rows[0].permissions : [];
      }

      // Auto-create user_permissions row (fire-and-forget, don't block auth)
      pool.query(
        `INSERT INTO user_permissions (user_id, college_id, permissions)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, collegeId, JSON.stringify(permissions)]
      ).catch(err => {
        logger.error(`${LOG.AUTH} Failed to lazy-create user_permissions`, {
          error: err.message, userId,
        });
      });
    }

    // 3. Cache the result
    permissionCache.setUser(userId, permissions);

    return { permissions };
  } catch (err) {
    logger.error(`${LOG.AUTH} Error loading permissions`, {
      error: err.message,
      userId,
      collegeId,
      role,
    });
    // On DB error, return empty permissions (fail-closed — deny access)
    return { permissions: [] };
  }
}

// ============================================================================
// loadUserDeptIds — Fetch assigned departments from user_departments
// ============================================================================

/**
 * Load all department IDs assigned to a user from the user_departments table.
 * Used when dept_scoped=true to determine which departments the user can access.
 *
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} userId - User UUID
 * @returns {Promise<string[]>} Array of department UUIDs
 */
async function loadUserDeptIds(pool, userId) {
  try {
    const { rows } = await pool.query(
      `SELECT dept_id FROM user_departments WHERE user_id = $1`,
      [userId]
    );
    return rows.map(r => r.dept_id);
  } catch (err) {
    logger.error(`${LOG.AUTH} Error loading user departments`, {
      error: err.message,
      userId,
    });
    // On DB error, return empty array (fail-closed — dept-scoped user sees nothing)
    return [];
  }
}

// ============================================================================
// requireRole — RBAC middleware factory (legacy — kept for auth-only routes)
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
// requirePermission — Dynamic permission check middleware
// ============================================================================

/**
 * Format a permission key (e.g. "restrictions.view") into a user-friendly label.
 * "restrictions.view" → "Restrictions → View"
 * "round_results.manage" → "Round Results → Manage"
 */
function formatPermissionLabel(key) {
  const [module, action] = key.split('.');
  const fmt = (s) => s.replaceAll('_', ' ').replaceAll(/\b\w/g, (c) => c.toUpperCase());
  return `${fmt(module)} → ${fmt(action)}`;
}

/**
 * Allow access only if the user has the specified dynamic permission.
 *
 * Bypass rules (always allowed, no permission check):
 *   - SYSADMIN  → full access (system-level)
 *   - COLLEGEADMIN → full access (hardcoded, manages permissions)
 *
 * For configurable roles (TPO/TPC/HOD/Teacher):
 *   - Checks req.user.permissions array (loaded in authenticate middleware)
 *   - Returns 403 if the permission key is not present
 *
 * @param {string} permissionKey - e.g. "students.view", "jobs.create"
 * @returns {Function} Express middleware
 *
 * Usage:
 *   const { PERMISSIONS } = require('../config/constants');
 *   router.get('/students', authenticate, requirePermission(PERMISSIONS.STUDENTS_VIEW), handler);
 */
function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
    }

    // Sysadmin and college admin always bypass permission checks
    if (req.user.role === ROLES.SYSADMIN || req.user.role === ROLES.COLLEGEADMIN) {
      return next();
    }

    // Configurable roles: check dynamic permissions
    if (req.user.permissions?.includes(permissionKey)) {
      return next();
    }

    logger.warn(`${LOG.SECURITY} Permission denied`, {
      userId: req.user.id,
      userRole: req.user.role,
      requiredPermission: permissionKey,
      path: req.path,
      method: req.method,
    });
    return sendError(
      res,
      `You don't have the "${formatPermissionLabel(permissionKey)}" permission. Contact your admin to enable it.`,
      HTTP_STATUS.FORBIDDEN
    );
  };
}

// ============================================================================
// requireFeature — College-level feature gate middleware
// ============================================================================

/**
 * Check that a feature is enabled for the user's college.
 * Queries the colleges.enabled_features JSONB column.
 *
 * This is SEPARATE from role permissions:
 *   - enabled_features = sysadmin controls whether a module exists at all
 *   - role permissions  = college admin controls who can access enabled modules
 *   Both must pass. Chain them:  requireFeature('training'), requirePermission('training.view')
 *
 * The 'core' feature is always enabled and never needs checking.
 *
 * @param {string} featureKey - One of FEATURES constants: 'training', 'feedback', 'interview_questions'
 * @returns {Function} Express middleware
 *
 * Usage:
 *   const { FEATURES } = require('../config/constants');
 *   router.get('/training', authenticate, requireFeature(FEATURES.TRAINING), requirePermission(...), handler);
 */
function requireFeature(featureKey) {
  return async (req, res, next) => {
    if (!req.user) {
      return sendError(res, ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED);
    }

    // Sysadmin bypasses feature checks (they manage features)
    if (req.user.role === ROLES.SYSADMIN) {
      return next();
    }

    // Core feature is always enabled — no check needed
    if (featureKey === FEATURES.CORE) {
      return next();
    }

    try {
      const pool = getMainPool();
      const { rows } = await pool.query(
        `SELECT enabled_features FROM colleges WHERE college_id = $1 LIMIT 1`,
        [req.user.college_id]
      );

      if (!rows.length) {
        return sendError(res, ERROR_MESSAGES.COLLEGE_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
      }

      const enabledFeatures = rows[0].enabled_features || ['core'];

      if (!enabledFeatures.includes(featureKey)) {
        logger.info(`${LOG.AUTH} Feature not enabled`, {
          collegeId: req.user.college_id,
          feature: featureKey,
          userId: req.user.id,
        });

        // Return a descriptive error based on the feature
        const featureMessages = {
          [FEATURES.TRAINING]: 'Training feature is not enabled for your college',
          [FEATURES.FEEDBACK]: ERROR_MESSAGES.FEEDBACK_FEATURE_DISABLED,
          [FEATURES.INTERVIEW_QUESTIONS]: ERROR_MESSAGES.INTERVIEW_QUESTIONS_FEATURE_DISABLED,
        };
        const message = featureMessages[featureKey] || `The '${featureKey}' feature is not enabled for your college`;
        return sendError(res, message, HTTP_STATUS.FORBIDDEN);
      }

      return next();
    } catch (err) {
      logger.error(`${LOG.AUTH} Error checking feature`, {
        error: err.message,
        collegeId: req.user.college_id,
        feature: featureKey,
      });
      return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  authenticate,
  requireRole,
  requirePermission,
  requireFeature,
  requireCollegeAccess,
  permissionCache,
};