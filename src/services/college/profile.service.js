/**
 * ============================================================================
 * PROFILE SERVICE — Self-service user profile operations
 * ============================================================================
 * Any authenticated college user can view/edit their own profile.
 * They CANNOT change: email, role, status, college_id, dept assignments.
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG, ERROR_MESSAGES, ROLES } = require('../../config/constants');

// ============================================================================
// GET MY PROFILE
// ============================================================================

/**
 * Fetch the current user's profile with college info and department assignments.
 *
 * @param {string} userId
 * @param {string} collegeId
 * @returns {Promise<Object>} User profile data
 */
async function getMyProfile(userId, collegeId, userRole) {
  // Guard: students use a separate table — this endpoint is for college staff only
  if (userRole === ROLES.STUDENT) {
    const err = new Error('Students cannot access this endpoint');
    err.status = 403;
    throw err;
  }

  // User core data + college name
  const { rows } = await query(
    `SELECT
       u.user_id,
       u.user_name,
       u.user_email,
       u.user_role,
       u.user_status,
       u.phone_number,
       u.profile_picture_url,
       u.created_at,
       u.updated_at,
       c.college_name,
       c.college_code
     FROM users u
     JOIN colleges c ON c.college_id = u.college_id
     WHERE u.user_id = $1 AND u.college_id = $2
     LIMIT 1`,
    [userId, collegeId]
  );

  if (!rows.length) {
    const err = new Error(ERROR_MESSAGES.USER_NOT_FOUND || 'User not found');
    err.status = 404;
    throw err;
  }

  const user = rows[0];

  // Fetch multi-department assignments
  const { rows: depts } = await query(
    `SELECT d.dept_id, d.dept_name, d.dept_code
     FROM user_departments ud
     JOIN departments d ON d.dept_id = ud.dept_id
     WHERE ud.user_id = $1
     ORDER BY d.dept_name`,
    [userId]
  );

  return {
    ...user,
    departments: depts,
  };
}

// ============================================================================
// UPDATE MY PROFILE
// ============================================================================

/**
 * Update the current user's own profile (name, phone, profile picture).
 *
 * @param {string} userId
 * @param {string} collegeId
 * @param {Object} data - { user_name?, phone_number?, profile_picture_url? }
 * @returns {Promise<Object>} Updated profile data
 */
async function updateMyProfile(userId, collegeId, data) {
  const setClauses = [];
  const values = [];
  let idx = 1;

  if (data.user_name !== undefined) {
    setClauses.push(`user_name = $${idx++}`);
    values.push(data.user_name);
  }

  if (data.phone_number !== undefined) {
    setClauses.push(`phone_number = $${idx++}`);
    values.push(data.phone_number || null);
  }

  if (data.profile_picture_url !== undefined) {
    setClauses.push(`profile_picture_url = $${idx++}`);
    values.push(data.profile_picture_url || null);
  }

  if (setClauses.length === 0) {
    const err = new Error('No valid fields to update');
    err.status = 400;
    throw err;
  }

  setClauses.push(`updated_at = NOW()`);

  // Append WHERE params after all SET params
  const userIdIdx = idx++;
  const collegeIdIdx = idx;
  values.push(userId, collegeId);

  const { rows } = await query(
    `UPDATE users
     SET ${setClauses.join(', ')}
     WHERE user_id = $${userIdIdx} AND college_id = $${collegeIdIdx}
     RETURNING user_id, user_name, user_email, user_role, phone_number, profile_picture_url, updated_at`,
    values
  );

  if (!rows.length) {
    const err = new Error(ERROR_MESSAGES.USER_NOT_FOUND || 'User not found');
    err.status = 404;
    throw err;
  }

  logger.info(`${LOG.AUTH} User updated own profile`, { userId });

  return rows[0];
}

module.exports = {
  getMyProfile,
  updateMyProfile,
};
