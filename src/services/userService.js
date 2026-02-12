/**
 * ============================================================================
 * USER SERVICE - User Management (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - Create user with password hashing
 * - Get all users with pagination
 * - Get user by ID
 * - Update user
 * - Soft delete user
 * - Status checks: college active, user active
 */

const { getMainPool } = require('../config/db');
const passwordHelper = require('../utils/passwordHelper');
const logger = require('../config/logger');
const {
  LOG,
  STATUS,
  ROLES,
  DB_ERROR_CODES
} = require('../config/constants');

class UserService {
  /**
   * Creates new user in college
   * 
   * Single Database:
   * 1. Verify college is active
   * 2. Hash password
   * 3. Check email uniqueness
   * 4. Create user
   * 
   * @param {Object} data - { college_id, user_name, user_email, user_password, user_role }
   * @returns {Object} Created user (without password)
   * @throws {Error} If validation fails
   */
 async create(data) {
  const {
    college_id,
    user_name,
    user_email,
    user_password
    // ❌ user_role REMOVED from destructuring
  } = data;

  // ✅ FORCE DEFAULT ROLE IN BACKEND
  const user_role = ROLES.COLLEGEADMIN;

  const mainPool = getMainPool();
  const client = await mainPool.connect();

  try {
    logger.debug(
      `${LOG.TRANSACTION_PREFIX} Starting user creation transaction`,
      { college_id, user_email, user_role }
    );

    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // ====================================================================
    // Step 1: Verify college exists and is active
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Verifying college status`, {
      college_id
    });

    const collegeQuery = `
      SELECT college_id, college_status
      FROM colleges
      WHERE college_id = $1
      LIMIT 1
    `;

    const collegeResult = await client.query(collegeQuery, [college_id]);

    if (!collegeResult.rows.length) {
      await client.query('ROLLBACK');
      throw new Error('College not found');
    }

    const college = collegeResult.rows[0];

    if (college.college_status !== STATUS.ACTIVE) {
      await client.query('ROLLBACK');
      throw new Error('College is inactive');
    }

    // ====================================================================
    // Step 2: Validate user role (BACKEND CONTROLLED)
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Validating user role`, {
      user_role
    });

    const validRoles = [ROLES.COLLEGEADMIN, ROLES.TEACHER, 'student', 'other'];
    if (!validRoles.includes(user_role)) {
      await client.query('ROLLBACK');
      throw new Error(`Invalid role: ${user_role}`);
    }

    // ====================================================================
    // Step 3: Hash password
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Hashing user password`);

    const hashedPassword = await passwordHelper.hashPassword(user_password);

    // ====================================================================
    // Step 4: Check email uniqueness
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Checking email uniqueness`, {
      user_email
    });

    const emailCheckQuery = `
      SELECT user_id FROM users
      WHERE LOWER(user_email) = LOWER($1)
      LIMIT 1
    `;

    const emailCheckResult = await client.query(emailCheckQuery, [user_email]);

    if (emailCheckResult.rows.length > 0) {
      await client.query('ROLLBACK');
      throw new Error('Email already exists');
    }

    // ====================================================================
    // Step 5: Create user
    // ====================================================================
    logger.debug(`${LOG.TRANSACTION_PREFIX} Creating user record`, {
      college_id,
      user_email
    });

    const userInsertQuery = `
      INSERT INTO users (
        college_id,
        user_name,
        user_email,
        user_password,
        user_role,
        user_status,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING
        user_id,
        college_id,
        user_name,
        user_email,
        user_role,
        user_status,
        created_at
    `;

    const userResult = await client.query(userInsertQuery, [
      college_id,
      user_name,
      user_email,
      hashedPassword,
      user_role,          // ✅ always collegeadmin
      STATUS.ACTIVE
    ]);

    await client.query('COMMIT');

    const user = userResult.rows[0];

    logger.info(
      `${LOG.TRANSACTION_PREFIX} User created successfully`,
      {
        user_id: user.user_id,
        college_id: user.college_id,
        user_email: user.user_email,
        user_role: user.user_role
      }
    );

    return user;

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error(
        `${LOG.TRANSACTION_PREFIX} Rollback failed`,
        { error: rollbackErr.message }
      );
    }

    logger.error(
      `${LOG.TRANSACTION_PREFIX} User creation failed`,
      {
        error: err.message,
        code: err.code,
        college_id
      }
    );

    if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
      throw new Error('Email already exists');
    }

    if (err.code === DB_ERROR_CODES.FOREIGN_KEY_VIOLATION) {
      throw new Error('Invalid college reference');
    }

    throw err;

  } finally {
    client.release();
  }
}

  /**
   * Get all users in college with pagination
   * 
   * @param {string} collegeId - College ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Object} { data, pagination }
   */
  async list(collegeId, page = 1, limit = 20) {
    const mainPool = getMainPool();
    const offset = (page - 1) * limit;

    try {
      logger.debug(`${LOG.TRANSACTION_PREFIX} Listing users`, {
        college_id: collegeId,
        page,
        limit
      });

      // Count total active users
      const countQuery = `
        SELECT COUNT(*) as total FROM users
        WHERE college_id = $1
        AND user_status = $2
      `;

      const countResult = await mainPool.query(countQuery, [
        collegeId,
        STATUS.ACTIVE
      ]);

      const total = parseInt(countResult.rows[0].total);

      // Fetch users
      const query = `
        SELECT
          user_id,
          college_id,
          user_name,
          user_email,
          user_role,
          user_status,
          created_at
        FROM users
        WHERE college_id = $1
        AND user_status = $2
        ORDER BY created_at DESC
        LIMIT $3
        OFFSET $4
      `;

      const { rows } = await mainPool.query(query, [
        collegeId,
        STATUS.ACTIVE,
        limit,
        offset
      ]);

      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Users listed successfully`,
        {
          college_id: collegeId,
          total_count: total,
          returned_count: rows.length,
          page
        }
      );

      return {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (err) {
      logger.error(
        `${LOG.TRANSACTION_PREFIX} User list failed`,
        {
          error: err.message,
          college_id: collegeId
        }
      );
      throw err;
    }
  }

  /**
   * Get single user by ID within college
   * 
   * @param {string} userId - User ID
   * @param {string} collegeId - College ID (for isolation)
   * @returns {Object} User data (without password)
   * @throws {Error} If not found
   */
  async getById(userId, collegeId) {
    const mainPool = getMainPool();

    try {
      logger.debug(`${LOG.TRANSACTION_PREFIX} Fetching user by ID`, {
        user_id: userId,
        college_id: collegeId
      });

      const query = `
        SELECT
          user_id,
          college_id,
          user_name,
          user_email,
          user_role,
          user_status,
          created_at
        FROM users
        WHERE user_id = $1
        AND college_id = $2
        AND user_status = $3
        LIMIT 1
      `;

      const { rows } = await mainPool.query(query, [
        userId,
        collegeId,
        STATUS.ACTIVE
      ]);

      if (!rows.length) {
        throw new Error('User not found');
      }

      logger.debug(
        `${LOG.TRANSACTION_PREFIX} User retrieved successfully`,
        {
          user_id: userId,
          college_id: collegeId
        }
      );

      return rows[0];

    } catch (err) {
      logger.error(
        `${LOG.TRANSACTION_PREFIX} User retrieval failed`,
        {
          error: err.message,
          user_id: userId,
          college_id: collegeId
        }
      );
      throw err;
    }
  }

  /**
   * Update user within college
   * 
   * @param {string} userId - User ID
   * @param {string} collegeId - College ID (for isolation)
   * @param {Object} data - { user_name, user_role, user_status }
   * @returns {Object} Updated user
   * @throws {Error} If not found or access denied
   */
  async update(userId, collegeId, data) {
    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting user update transaction`,
        { user_id: userId, college_id: collegeId }
      );

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // ====================================================================
      // Step 1: Verify user exists and belongs to college
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Verifying user access`, {
        user_id: userId,
        college_id: collegeId
      });

      const checkQuery = `
        SELECT user_id, college_id FROM users
        WHERE user_id = $1
        AND college_id = $2
        LIMIT 1
      `;

      const checkResult = await client.query(checkQuery, [userId, collegeId]);

      if (!checkResult.rows.length) {
        await client.query('ROLLBACK');
        throw new Error('User not found');
      }

      // ====================================================================
      // Step 2: Validate role if provided
      // ====================================================================
      if (data.user_role) {
        const validRoles = [ROLES.COLLEGEADMIN, ROLES.TEACHER, 'student', 'other'];
        if (!validRoles.includes(data.user_role)) {
          await client.query('ROLLBACK');
          throw new Error(`Invalid role: ${data.user_role}`);
        }
      }

      // ====================================================================
      // Step 3: Update user
      // ====================================================================
      const updateQuery = `
        UPDATE users
        SET
          user_name = COALESCE($1, user_name),
          user_role = COALESCE($2, user_role),
          user_status = COALESCE($3, user_status),
          updated_at = NOW()
        WHERE user_id = $4
        AND college_id = $5
        RETURNING user_id, college_id, user_name, user_email, user_role, user_status
      `;

      const updateResult = await client.query(updateQuery, [
        data.user_name || null,
        data.user_role || null,
        data.user_status || null,
        userId,
        collegeId
      ]);

      await client.query('COMMIT');

      logger.info(
        `${LOG.TRANSACTION_PREFIX} User updated successfully`,
        {
          user_id: userId,
          college_id: collegeId
        }
      );

      return updateResult.rows[0];

    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error(
          `${LOG.TRANSACTION_PREFIX} Rollback failed`,
          { error: rollbackErr.message }
        );
      }

      logger.error(
        `${LOG.TRANSACTION_PREFIX} User update failed`,
        {
          error: err.message,
          user_id: userId,
          college_id: collegeId
        }
      );

      throw err;

    } finally {
      client.release();
    }
  }

  /**
   * Soft delete user (set status to inactive)
   * 
   * @param {string} userId - User ID
   * @param {string} collegeId - College ID (for isolation)
   * @throws {Error} If not found
   */
  async delete(userId, collegeId) {
    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting user deletion transaction`,
        { user_id: userId, college_id: collegeId }
      );

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // ====================================================================
      // Step 1: Soft delete user (set to inactive)
      // ====================================================================
      const deleteQuery = `
        UPDATE users
        SET user_status = $1, updated_at = NOW()
        WHERE user_id = $2
        AND college_id = $3
        RETURNING user_id, user_name, user_email
      `;

      const deleteResult = await client.query(deleteQuery, [
        'inactive',
        userId,
        collegeId
      ]);

      if (!deleteResult.rows.length) {
        await client.query('ROLLBACK');
        throw new Error('User not found');
      }

      await client.query('COMMIT');

      logger.info(
        `${LOG.TRANSACTION_PREFIX} User soft deleted successfully`,
        {
          user_id: userId,
          college_id: collegeId
        }
      );

    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error(
          `${LOG.TRANSACTION_PREFIX} Rollback failed`,
          { error: rollbackErr.message }
        );
      }

      logger.error(
        `${LOG.TRANSACTION_PREFIX} User deletion failed`,
        {
          error: err.message,
          user_id: userId,
          college_id: collegeId
        }
      );

      throw err;

    } finally {
      client.release();
    }
  }


/**
 * Toggle user status (ACTIVE <-> INACTIVE)
 *
 * @param {string} userId
 * @param {string} collegeId
 * @param {string} newStatus
 */

async toggleStatus(userId, collegeId, newStatus){
  console.log('Toggling user status', { userId, collegeId, newStatus });
  const mainPool = getMainPool();
  const client = await mainPool.connect();
  try{
    logger.debug(`${LOG.TRANSACTION_PREFIX} Starting status toggle`, {
      user_id: userId,
      college_id: collegeId,
      new_status: newStatus
    });

    await client.query('BEGIN')
const check = await client.query(
      `SELECT user_id FROM users
       WHERE user_id = $1
       AND college_id = $2
       LIMIT 1`,
      [userId, collegeId]
    );

    if (!check.rows.length) {
      await client.query('ROLLBACK');
      throw new Error('User not found');
    }

    const result = await client.query(
      `UPDATE users
       SET user_status = $1,
           updated_at = NOW()
       WHERE user_id = $2
       AND college_id = $3
       RETURNING user_id, user_name, user_email, user_status`,
      [newStatus, userId, collegeId]
    );

    await client.query('COMMIT');

    logger.info(`${LOG.TRANSACTION_PREFIX} Status toggled`, {
      user_id: userId,
      new_status: newStatus
    });

    return result.rows[0];

  } catch (err) {
    await client.query('ROLLBACK');
    console.log(err)
    logger.error(`${LOG.TRANSACTION_PREFIX} Toggle failed`, {
      error: err.message,
      user_id: userId
    });

    throw err;
  } finally {
    client.release();
  }
}
}
module.exports = new UserService();
