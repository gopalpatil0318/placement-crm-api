/**
 * ============================================================================
 * COLLEGE SERVICE - College Management (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - All colleges in one shared database
 * - No tenant references needed
 * - Direct college CRUD operations
 * - Dynamic feature management via enabled_features JSONB
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
const { cli } = require('winston/lib/winston/config');

class CollegeService {
  /**
   * Creates new college with admin user
   * enabled_features defaults to ["core"]
   * 
   * @param {Object} data - { college_name, college_subdomain, admin_name, admin_email, admin_password }
   * @returns {Object} { college, admin, portal_url, note }
   * @throws {Error} If validation fails
   */
  async create(data) {
    const {
      college_name,
      college_subdomain,
      admin_name,
      admin_email,
      admin_password
    } = data;

    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting college creation transaction`,
        { college_name }
      );

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // ====================================================================
      // Step 1: Check subdomain uniqueness
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Checking subdomain uniqueness`, {
        subdomain: college_subdomain
      });

      const subdomainCheckQuery = `
        SELECT college_id FROM colleges
        WHERE LOWER(college_subdomain) = LOWER($1)
        LIMIT 1
      `;

      const subdomainCheckResult = await client.query(subdomainCheckQuery, [
        college_subdomain
      ]);

      if (subdomainCheckResult.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new Error('College subdomain already exists');
      }

      // ====================================================================
      // Step 2: Create college record with default features
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Creating college record`, {
        college_name
      });

      const collegeInsertQuery = `
        INSERT INTO colleges (
          college_name,
          college_subdomain,
          college_status,
          enabled_features,
          created_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING college_id, college_name, college_subdomain, college_status, enabled_features, created_at
      `;

      const collegeResult = await client.query(collegeInsertQuery, [
        college_name,
        college_subdomain,
        STATUS.ACTIVE,
        JSON.stringify(['core']) // Default: only core features
      ]);

      const college = collegeResult.rows[0];

      logger.debug(
        `${LOG.TRANSACTION_PREFIX} College record created`,
        { college_id: college.college_id }
      );

      // ====================================================================
      // Step 3: Hash admin password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Hashing admin password`);

      const hashedPassword = await passwordHelper.hashPassword(admin_password);

      // ====================================================================
      // Step 4: Create admin user
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Creating admin user`, {
        college_id: college.college_id,
        admin_email
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
        RETURNING user_id, user_name, user_email, user_role, user_status, created_at
      `;

      const userResult = await client.query(userInsertQuery, [
        college.college_id,
        admin_name || 'Admin',
        admin_email,
        hashedPassword,
        ROLES.ADMIN,
        STATUS.ACTIVE
      ]);

      const adminUser = userResult.rows[0];

      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Admin user created`,
        { user_id: adminUser.user_id, user_email: admin_email }
      );

      // ====================================================================
      // Step 5: Commit transaction
      // ====================================================================
      await client.query('COMMIT');

      logger.info(
        `${LOG.TRANSACTION_PREFIX} College creation transaction committed`,
        {
          college_id: college.college_id,
          admin_user_id: adminUser.user_id,
          enabled_features: college.enabled_features
        }
      );

      return {
        college,
        admin: {
          user_id: adminUser.user_id,
          user_name: adminUser.user_name,
          user_email: adminUser.user_email,
          user_role: adminUser.user_role,
          temporary_password: admin_password
        },
        portal_url: `https://${college_subdomain}.pcrm.in`,
        note: 'Please change the temporary password on first login'
      };

    } catch (err) {
      await client.query('ROLLBACK');

      logger.error(
        `${LOG.TRANSACTION_PREFIX} College creation failed - rolled back`,
        {
          error: err.message,
          code: err.code
        }
      );

      if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
        if (err.constraint && err.constraint.includes('subdomain')) {
          throw new Error('College subdomain already exists');
        }
        if (err.constraint && err.constraint.includes('email')) {
          throw new Error('Admin email already exists');
        }
      }

      throw err;

    } finally {
      client.release();
    }
  }
  /**
   * Reset college admin password
   * @param {string} userId
   * @param {string} collegeId
   * @param {string} newPassword
   */
  async resetCollegeAdminPassword(userId, collegeId, newPassword) {
    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting admin password reset`,
        { user_id: userId, college_id: collegeId }
      );

      await client.query('BEGIN');

      const userCheck = await client.query(
        `SELECT user_id FROM users 
        WHERE user_id = $1
        AND college_id = $2
        AND user_role = $3
        AND user_status = $4`,
        [userId, collegeId, ROLES.ADMIN, STATUS.ACTIVE]
      );

      if (!userCheck.rows.length) {
        throw new Error('Admin user not found');
      }

      const hashedPassword = await passwordHelper.hashPassword(newPassword);
      await client.query(
        `UPDATE users
        SET user_password = $1,
        updated_at = NOW()
        WHERE user_id = $2
        AND college_id = $3`,
        [hashedPassword, userId, collegeId]
      );

      await client.query('COMMIT');
      logger.info(
        `${LOG.TRANSACTION_PREFIX} Admin password reset committed`,
        { user_id: userId }
      );
      return true

    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(
        `${LOG.TRANSACTION_PREFIX} Admin password reset rolled back`,
        { error: err.message }
      );
      throw err;

    } finally {
      client.release();
    }
  }

  /**
   * Get all colleges with pagination
   * 
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Object} { data, pagination }
   */
  async list(page = 1, limit = 20) {
    const mainPool = getMainPool();
    const offset = (page - 1) * limit;

    try {
      // Count total
      const countQuery = `SELECT COUNT(*) as total FROM colleges`;
      const countResult = await mainPool.query(countQuery);
      const total = parseInt(countResult.rows[0].total);

      // Fetch colleges
      const query = `
        SELECT
          college_id,
          college_name,
          college_subdomain,
          college_status,
          enabled_features,
          created_at,
          updated_at
        FROM colleges
        ORDER BY created_at DESC
        LIMIT $1
        OFFSET $2
      `;

      const { rows } = await mainPool.query(query, [limit, offset]);

      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Colleges listed`,
        {
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
        `${LOG.TRANSACTION_PREFIX} College list failed`,
        { error: err.message }
      );
      throw err;
    }
  }

  /**
   * Get single college by ID
   * 
   * @param {string} collegeId - College ID
   * @returns {Object} College data
   * @throws {Error} If not found
   */
  async getById(collegeId) {
    const mainPool = getMainPool();

    const query = `
      SELECT
        college_id,
        college_name,
        college_subdomain,
        college_status,
        enabled_features,
        created_at,
        updated_at
      FROM colleges
      WHERE college_id = $1
      LIMIT 1
    `;

    const { rows } = await mainPool.query(query, [collegeId]);

    if (!rows.length) {
      throw new Error('College not found');
    }

    logger.debug(
      `${LOG.TRANSACTION_PREFIX} College retrieved`,
      { college_id: collegeId }
    );

    return rows[0];
  }

  /**
   * Update college (name, subdomain, status)
   * Does not modify enabled_features
   * 
   * @param {string} collegeId - College ID
   * @param {Object} data - { college_name, college_subdomain, college_status }
   * @returns {Object} Updated college
   * @throws {Error} If not found
   */
  async update(collegeId, data) {
    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(`${LOG.TRANSACTION_PREFIX} Starting college update`, {
        college_id: collegeId
      });

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Verify college exists
      const checkQuery = `
        SELECT college_id FROM colleges
        WHERE college_id = $1
        LIMIT 1
      `;

      const checkResult = await client.query(checkQuery, [collegeId]);

      if (!checkResult.rows.length) {
        await client.query('ROLLBACK');
        throw new Error('College not found');
      }

      // Update college (excluding enabled_features)
      const updateQuery = `
        UPDATE colleges
        SET
          college_name = COALESCE($1, college_name),
          college_subdomain = COALESCE($2, college_subdomain),
          college_status = COALESCE($3, college_status),
          updated_at = NOW()
        WHERE college_id = $4
        RETURNING college_id, college_name, college_subdomain, college_status, enabled_features, created_at, updated_at
      `;

      const updateResult = await client.query(updateQuery, [
        data.college_name || null,
        data.college_subdomain || null,
        data.college_status || null,
        collegeId
      ]);

      await client.query('COMMIT');

      logger.info(
        `${LOG.TRANSACTION_PREFIX} College updated successfully`,
        { college_id: collegeId }
      );

      return updateResult.rows[0];

    } catch (err) {
      await client.query('ROLLBACK');

      logger.error(
        `${LOG.TRANSACTION_PREFIX} College update failed - rolled back`,
        { error: err.message }
      );

      throw err;

    } finally {
      client.release();
    }
  }

  /**
   * Update college enabled features
   * Core feature is mandatory and cannot be removed
   * 
   * @param {string} collegeId - College ID
   * @param {Array} enabledFeatures - Array of feature keys (must include "core")
   * @returns {Object} Updated college
   * @throws {Error} If not found or core feature missing
   */
  async updateFeatures(collegeId, enabledFeatures) {
    const mainPool = getMainPool();
    const client = await mainPool.connect();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting college features update`,
        {
          college_id: collegeId,
          enabled_features: enabledFeatures
        }
      );

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Verify college exists
      const checkQuery = `
        SELECT college_id FROM colleges
        WHERE college_id = $1
        LIMIT 1
      `;

      const checkResult = await client.query(checkQuery, [collegeId]);

      if (!checkResult.rows.length) {
        await client.query('ROLLBACK');
        throw new Error('College not found');
      }

      // Update enabled_features
      const updateQuery = `
        UPDATE colleges
        SET enabled_features = $1::jsonb,
            updated_at = NOW()
        WHERE college_id = $2
        RETURNING college_id, college_name, college_subdomain, college_status, enabled_features, created_at, updated_at
      `;

      const updateResult = await client.query(updateQuery, [
        JSON.stringify(enabledFeatures),
        collegeId
      ]);

      await client.query('COMMIT');

      logger.info(
        `${LOG.TRANSACTION_PREFIX} College features updated successfully`,
        {
          college_id: collegeId,
          enabled_features: enabledFeatures
        }
      );

      return updateResult.rows[0];

    } catch (err) {
      await client.query('ROLLBACK');

      logger.error(
        `${LOG.TRANSACTION_PREFIX} College features update failed - rolled back`,
        { error: err.message, college_id: collegeId }
      );

      throw err;

    } finally {
      client.release();
    }
  }
}

module.exports = new CollegeService();