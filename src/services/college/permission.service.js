/**
 * ============================================================================
 * PERMISSION SERVICE — CRUD for role templates + per-user permissions
 * ============================================================================
 * Role templates: college_role_permissions — defaults for new users
 * Per-user: user_permissions + user_departments — individual user config
 *
 * - All writes invalidate the permission cache for affected users.
 * - All writes create an audit log entry.
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
  LOG,
  CONFIGURABLE_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_MODULES,
  ALL_PERMISSION_KEYS,
  ERROR_MESSAGES,
} = require('../../config/constants');
const permissionCache = require('../../utils/permissionCache');

// ============================================================================
// GET ALL ROLES WITH PERMISSIONS
// ============================================================================

/**
 * Returns all 4 configurable roles with their current permissions + dept_scoped.
 * If a role has no row (shouldn't happen after migration), returns empty defaults.
 *
 * @param {string} collegeId
 * @returns {Promise<Object[]>} Array of { role, permissions, dept_scoped }
 */
async function getAllRolePermissions(collegeId) {
  const { rows } = await query(
    `SELECT role, permissions, dept_scoped, updated_at
     FROM college_role_permissions
     WHERE college_id = $1
     ORDER BY CASE role
       WHEN 'tpo' THEN 1 WHEN 'tpc' THEN 2 WHEN 'hod' THEN 3 WHEN 'teacher' THEN 4
     END`,
    [collegeId]
  );

  // Build a map for quick lookup
  const rowMap = {};
  for (const row of rows) {
    rowMap[row.role] = row;
  }

  // Ensure all 4 roles are returned (even if row is missing)
  return CONFIGURABLE_ROLES.map(role => {
    const row = rowMap[role];
    if (row) {
      return {
        role,
        permissions: Array.isArray(row.permissions) ? row.permissions : [],
        dept_scoped: row.dept_scoped === true,
        updated_at: row.updated_at,
      };
    }
    // Missing row — return empty (deny-all)
    return { role, permissions: [], dept_scoped: false, updated_at: null };
  });
}

// ============================================================================
// GET AVAILABLE PERMISSIONS (metadata for UI)
// ============================================================================

/**
 * Returns the full permission module structure with labels/descriptions.
 * Used by the frontend to render the permission matrix.
 */
function getAvailablePermissions() {
  return {
    modules: PERMISSION_MODULES,
    all_keys: ALL_PERMISSION_KEYS,
    configurable_roles: CONFIGURABLE_ROLES,
  };
}

// ============================================================================
// UPDATE ROLE PERMISSIONS
// ============================================================================

/**
 * Update (or create) permissions for a specific role at a college.
 * Uses UPSERT — works whether or not the row already exists.
 *
 * @param {string} collegeId
 * @param {string} role
 * @param {string[]} permissions - Array of permission keys
 * @param {boolean} deptScoped
 * @returns {Promise<Object>} Updated permission row
 */
async function updateRolePermissions(collegeId, role, permissions, deptScoped) {
  // Validate all permission keys
  const invalidKeys = permissions.filter(k => !ALL_PERMISSION_KEYS.includes(k));
  if (invalidKeys.length > 0) {
    const err = new Error(`Invalid permission keys: ${invalidKeys.join(', ')}`);
    err.status = 400;
    throw err;
  }

  // Deduplicate
  const uniquePerms = [...new Set(permissions)];

  const { rows } = await query(
    `INSERT INTO college_role_permissions (college_id, role, permissions, dept_scoped, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, NOW())
     ON CONFLICT (college_id, role) DO UPDATE SET
       permissions = $3::jsonb,
       dept_scoped = $4,
       updated_at = NOW()
     RETURNING role, permissions, dept_scoped, updated_at`,
    [collegeId, role, JSON.stringify(uniquePerms), deptScoped]
  );

  // Invalidate cache for this college (all roles — dept_scoped may affect others)
  permissionCache.invalidateCollege(collegeId);

  logger.info(`${LOG.AUTH} Role permissions updated`, {
    collegeId,
    role,
    permissionCount: uniquePerms.length,
    deptScoped,
  });

  return rows[0];
}

// ============================================================================
// RESET ROLE TO DEFAULT
// ============================================================================

/**
 * Reset a role's permissions to the default template.
 *
 * @param {string} collegeId
 * @param {string} role
 * @returns {Promise<Object>} Reset permission row
 */
async function resetRoleToDefault(collegeId, role) {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role];
  if (!defaults) {
    const err = new Error(`No default template for role: ${role}`);
    err.status = 400;
    throw err;
  }

  return updateRolePermissions(
    collegeId,
    role,
    defaults.permissions,
    defaults.dept_scoped
  );
}

// ============================================================================
// COPY PERMISSIONS FROM ONE ROLE TO ANOTHER
// ============================================================================

/**
 * Copy permissions + dept_scoped from source_role to target_role.
 *
 * @param {string} collegeId
 * @param {string} sourceRole
 * @param {string} targetRole
 * @returns {Promise<Object>} Updated target role
 */
async function copyPermissions(collegeId, sourceRole, targetRole) {
  // Read source
  const { rows } = await query(
    `SELECT permissions, dept_scoped
     FROM college_role_permissions
     WHERE college_id = $1 AND role = $2
     LIMIT 1`,
    [collegeId, sourceRole]
  );

  if (!rows.length) {
    const err = new Error(`Source role '${sourceRole}' has no permission configuration`);
    err.status = 404;
    throw err;
  }

  const { permissions, dept_scoped } = rows[0];
  const permArray = Array.isArray(permissions) ? permissions : [];

  return updateRolePermissions(collegeId, targetRole, permArray, dept_scoped);
}

// ============================================================================
// SEED DEFAULTS FOR A NEW COLLEGE (called from college creation)
// ============================================================================

/**
 * Insert default permission rows for all 4 configurable roles.
 * Used during college onboarding.
 *
 * @param {import('pg').PoolClient} client - Transaction client
 * @param {string} collegeId
 */
async function seedDefaultsForCollege(client, collegeId) {
  for (const role of CONFIGURABLE_ROLES) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role];
    if (!defaults) continue;

    await client.query(
      `INSERT INTO college_role_permissions (college_id, role, permissions, dept_scoped)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (college_id, role) DO NOTHING`,
      [collegeId, role, JSON.stringify(defaults.permissions), defaults.dept_scoped]
    );
  }
}

// ============================================================================
// ========== PER-USER PERMISSION FUNCTIONS ==========
// ============================================================================

// ============================================================================
// GET COLLEGE USERS WITH PERMISSIONS (paginated)
// ============================================================================

/**
 * Paginated list of configurable-role users with their permissions + departments.
 *
 * @param {string} collegeId
 * @param {Object} filters - { role?, search?, page, limit }
 * @returns {Promise<{ users: Object[], total: number, page: number, limit: number }>}
 */
async function getCollegeUsersWithPermissions(collegeId, filters = {}) {
  const { page, limit, offset } = getPagination(filters);

  const conditions = ['u.college_id = $1', "u.user_role IN ('tpo','tpc','hod','teacher')"];
  const params = [collegeId];
  let paramIndex = 2;

  if (filters.role) {
    conditions.push(`u.user_role = $${paramIndex}`);
    params.push(filters.role);
    paramIndex++;
  }

  if (filters.search) {
    conditions.push(`(u.user_name ILIKE $${paramIndex} OR u.user_email ILIKE $${paramIndex})`);
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');

  const [countResult, usersResult] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM users u WHERE ${whereClause}`, params),
    query(
      `SELECT
         u.user_id, u.user_name, u.user_email, u.user_role, u.user_status,
         COALESCE(up.permissions, '[]'::jsonb) AS permissions,
         COALESCE(up.updated_at, u.created_at) AS permissions_updated_at,
         COALESCE(
           (SELECT json_agg(json_build_object('dept_id', ud.dept_id, 'dept_name', d.dept_name) ORDER BY d.dept_name)
            FROM user_departments ud
            JOIN departments d ON ud.dept_id = d.dept_id
            WHERE ud.user_id = u.user_id
           ), '[]'::json
         ) AS departments
       FROM users u
       LEFT JOIN user_permissions up ON u.user_id = up.user_id
       WHERE ${whereClause}
       ORDER BY u.user_name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    ),
  ]);

  return {
    users: usersResult.rows,
    total: Number.parseInt(countResult.rows[0].total, 10),
    page,
    limit,
  };
}

// ============================================================================
// GET SINGLE USER PERMISSIONS + ALL COLLEGE DEPARTMENTS
// ============================================================================

/**
 * Returns a user's permissions + department assignments, plus all college
 * departments (for checkbox rendering in the UI).
 *
 * @param {string} userId
 * @param {string} collegeId
 * @returns {Promise<{ user: Object, allDepartments: Object[] }>}
 */
async function getUserPermissions(userId, collegeId) {
  const [userResult, deptResult, allDeptsResult] = await Promise.all([
    query(
      `SELECT
         u.user_id, u.user_name, u.user_email, u.user_role, u.user_status,
         COALESCE(up.permissions, '[]'::jsonb) AS permissions,
         COALESCE(up.updated_at, u.created_at) AS permissions_updated_at
       FROM users u
       LEFT JOIN user_permissions up ON u.user_id = up.user_id
       WHERE u.user_id = $1 AND u.college_id = $2
         AND u.user_role IN ('tpo','tpc','hod','teacher')
       LIMIT 1`,
      [userId, collegeId]
    ),
    query(
      `SELECT ud.dept_id, d.dept_name
       FROM user_departments ud
       JOIN departments d ON ud.dept_id = d.dept_id
       WHERE ud.user_id = $1
       ORDER BY d.dept_name`,
      [userId]
    ),
    query(
      `SELECT dept_id, dept_name, dept_code
       FROM departments
       WHERE college_id = $1 AND is_active = true
       ORDER BY dept_name`,
      [collegeId]
    ),
  ]);

  if (!userResult.rows.length) {
    const err = new Error('User not found or is not a configurable role');
    err.status = 404;
    throw err;
  }

  return {
    user: {
      ...userResult.rows[0],
      departments: deptResult.rows,
    },
    allDepartments: allDeptsResult.rows,
  };
}

// ============================================================================
// UPDATE USER PERMISSIONS + DEPARTMENTS
// ============================================================================

/**
 * Update permissions and department assignments for a specific user.
 * Uses optimistic locking via expected_updated_at.
 *
 * @param {string} userId
 * @param {string} collegeId
 * @param {string[]} permissions
 * @param {string[]} deptIds
 * @param {string} [expectedUpdatedAt] - ISO date for optimistic locking (optional)
 * @returns {Promise<Object>} Updated user config
 */
async function updateUserPermissions(userId, collegeId, permissions, deptIds, expectedUpdatedAt) {
  // Validate permission keys
  const invalidKeys = permissions.filter(k => !ALL_PERMISSION_KEYS.includes(k));
  if (invalidKeys.length > 0) {
    const err = new Error(`Invalid permission keys: ${invalidKeys.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const uniquePerms = [...new Set(permissions)];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Verify user exists and belongs to this college
    const userCheck = await client.query(
      `SELECT u.user_id, u.user_role, up.updated_at AS perm_updated_at
       FROM users u
       LEFT JOIN user_permissions up ON u.user_id = up.user_id
       WHERE u.user_id = $1 AND u.college_id = $2
         AND u.user_role IN ('tpo','tpc','hod','teacher')
       LIMIT 1`,
      [userId, collegeId]
    );

    if (!userCheck.rows.length) {
      await client.query('ROLLBACK');
      const err = new Error('User not found or is not a configurable role');
      err.status = 404;
      throw err;
    }

    // 1b. HOD/Teacher must have at least one department
    const userRole = userCheck.rows[0].user_role;
    if ((userRole === 'hod' || userRole === 'teacher') && deptIds.length === 0) {
      await client.query('ROLLBACK');
      const err = new Error('HOD and Teacher roles require at least one department assignment');
      err.status = 400;
      throw err;
    }

    // 2. Optimistic locking check
    if (expectedUpdatedAt) {
      const currentUpdatedAt = userCheck.rows[0].perm_updated_at;
      if (currentUpdatedAt && new Date(currentUpdatedAt).toISOString() !== new Date(expectedUpdatedAt).toISOString()) {
        await client.query('ROLLBACK');
        const err = new Error('Permissions were modified by another administrator. Please reload and try again.');
        err.status = 409;
        throw err;
      }
    }

    // 3. Validate all dept_ids belong to this college
    if (deptIds.length > 0) {
      const deptCheck = await client.query(
        `SELECT dept_id FROM departments
         WHERE dept_id = ANY($1::uuid[]) AND college_id = $2 AND is_active = true`,
        [deptIds, collegeId]
      );
      const validDeptIds = new Set(deptCheck.rows.map(r => r.dept_id));
      const invalidDepts = deptIds.filter(id => !validDeptIds.has(id));
      if (invalidDepts.length > 0) {
        await client.query('ROLLBACK');
        const err = new Error(`Invalid department IDs: ${invalidDepts.join(', ')}`);
        err.status = 400;
        throw err;
      }
    }

    // 4. UPSERT user_permissions
    const permResult = await client.query(
      `INSERT INTO user_permissions (user_id, college_id, permissions, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         permissions = $3::jsonb,
         updated_at = NOW()
       RETURNING permissions, updated_at`,
      [userId, collegeId, JSON.stringify(uniquePerms)]
    );

    // 5. Sync user_departments: DELETE all → INSERT new
    await client.query(
      `DELETE FROM user_departments WHERE user_id = $1`,
      [userId]
    );

    if (deptIds.length > 0) {
      // Batch insert using unnest for efficiency
      await client.query(
        `INSERT INTO user_departments (user_id, dept_id, college_id)
         SELECT $1, unnest($2::uuid[]), $3
         ON CONFLICT (user_id, dept_id) DO NOTHING`,
        [userId, deptIds, collegeId]
      );
    }

    await client.query('COMMIT');

    // Invalidate cache for this user
    permissionCache.invalidateUser(userId);

    logger.info(`${LOG.AUTH} User permissions updated`, {
      userId, collegeId, permissionCount: uniquePerms.length, deptCount: deptIds.length,
    });

    return {
      permissions: permResult.rows[0].permissions,
      updated_at: permResult.rows[0].updated_at,
      dept_ids: deptIds,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// RESET USER TO ROLE DEFAULT
// ============================================================================

/**
 * Reset a user's permissions to their role's template. Preserves departments.
 *
 * @param {string} userId
 * @param {string} collegeId
 * @returns {Promise<Object>} Updated user config
 */
async function resetUserToRoleDefault(userId, collegeId) {
  // 1. Get user's role
  const userResult = await query(
    `SELECT user_role FROM users
     WHERE user_id = $1 AND college_id = $2
       AND user_role IN ('tpo','tpc','hod','teacher')
     LIMIT 1`,
    [userId, collegeId]
  );

  if (!userResult.rows.length) {
    const err = new Error('User not found or is not a configurable role');
    err.status = 404;
    throw err;
  }

  const role = userResult.rows[0].user_role;

  // 2. Get template permissions (college-specific first, fallback to defaults)
  const templateResult = await query(
    `SELECT permissions FROM college_role_permissions
     WHERE college_id = $1 AND role = $2 LIMIT 1`,
    [collegeId, role]
  );

  let templatePerms = DEFAULT_ROLE_PERMISSIONS[role]?.permissions || [];
  if (templateResult.rows.length > 0) {
    const raw = templateResult.rows[0].permissions;
    templatePerms = Array.isArray(raw) ? raw : [];
  }

  // 3. Get current dept_ids (preserve them)
  const deptResult = await query(
    `SELECT dept_id FROM user_departments WHERE user_id = $1`,
    [userId]
  );
  const currentDeptIds = deptResult.rows.map(r => r.dept_id);

  // 4. Update permissions only (preserve departments)
  return updateUserPermissions(userId, collegeId, templatePerms, currentDeptIds);
}

// ============================================================================
// COPY USER PERMISSIONS
// ============================================================================

/**
 * Copy permissions + departments from one user to another (same college).
 *
 * @param {string} sourceUserId
 * @param {string} targetUserId
 * @param {string} collegeId
 * @returns {Promise<Object>} Updated target user config
 */
async function copyUserPermissions(sourceUserId, targetUserId, collegeId) {
  if (sourceUserId === targetUserId) {
    const err = new Error('Source and target users must be different');
    err.status = 400;
    throw err;
  }

  // 1. Verify both users belong to this college and are configurable roles
  const [sourceResult, targetResult] = await Promise.all([
    query(
      `SELECT u.user_id, u.user_role,
              COALESCE(up.permissions, '[]'::jsonb) AS permissions
       FROM users u
       LEFT JOIN user_permissions up ON u.user_id = up.user_id
       WHERE u.user_id = $1 AND u.college_id = $2
         AND u.user_role IN ('tpo','tpc','hod','teacher')
       LIMIT 1`,
      [sourceUserId, collegeId]
    ),
    query(
      `SELECT user_id FROM users
       WHERE user_id = $1 AND college_id = $2
         AND user_role IN ('tpo','tpc','hod','teacher')
       LIMIT 1`,
      [targetUserId, collegeId]
    ),
  ]);

  if (!sourceResult.rows.length) {
    const err = new Error('Source user not found or is not a configurable role');
    err.status = 404;
    throw err;
  }
  if (!targetResult.rows.length) {
    const err = new Error('Target user not found or is not a configurable role');
    err.status = 404;
    throw err;
  }

  // 2. Get source's permissions + departments
  const sourcePerms = Array.isArray(sourceResult.rows[0].permissions)
    ? sourceResult.rows[0].permissions : [];

  const sourceDeptResult = await query(
    `SELECT dept_id FROM user_departments WHERE user_id = $1`,
    [sourceUserId]
  );
  const sourceDeptIds = sourceDeptResult.rows.map(r => r.dept_id);

  // 3. Apply to target
  return updateUserPermissions(targetUserId, collegeId, sourcePerms, sourceDeptIds);
}

module.exports = {
  // Role templates
  getAllRolePermissions,
  getAvailablePermissions,
  updateRolePermissions,
  resetRoleToDefault,
  copyPermissions,
  seedDefaultsForCollege,
  // Per-user
  getCollegeUsersWithPermissions,
  getUserPermissions,
  updateUserPermissions,
  resetUserToRoleDefault,
  copyUserPermissions,
};
