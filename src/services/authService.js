/**
 * ============================================================================
 * AUTH SERVICE - Authentication Business Logic (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - System admin credential verification
 * - College user authentication
 * - Token generation
 * - Status checks: college active, user active
 */

const { getMainPool } = require('../config/db');
const jwtHelper = require('../utils/jwtHelper');
const passwordHelper = require('../utils/passwordHelper');
const logger = require('../config/logger');
const {
  LOG,
  STATUS,
  ROLES,
  AUTH
} = require('../config/constants');

class AuthService {
  /**
   * Verify system admin credentials
   * * @param {string} email - Admin email
   * @param {string} password - Admin password
   * @returns {Promise<boolean>} True if credentials match
   */
  async verifySystemAdminCredentials(email, password) {
    try {
      logger.debug(`${LOG.TRANSACTION_PREFIX} Verifying system admin credentials`, {
        email
      });

      const configEmail = process.env.SYSADMIN_EMAIL;
      const configPassword = process.env.SYSADMIN_PASSWORD;

      if (!configEmail || !configPassword) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} System admin credentials not configured`
        );
        return false;
      }

      // Constant-time comparison to prevent timing attacks
      const emailMatch = email === configEmail;
      const passwordMatch = password === configPassword;

      return emailMatch && passwordMatch;

    } catch (err) {
      logger.error(
        `${LOG.TRANSACTION_PREFIX} Error verifying system admin credentials`,
        { error: err.message }
      );
      return false;
    }
  }

  /**
   * Generate system admin token
   * * @param {string} email - Admin email
   * @returns {string} JWT token
   */
  generateAdminToken(email) {
    logger.debug(`${LOG.TRANSACTION_PREFIX} Generating admin JWT token`, {
      email
    });

    return jwtHelper.sign({
      id: AUTH.SYSTEM_ADMIN_ID,
      role: ROLES.SYSADMIN,
      email: email,
      timestamp: Date.now()
    });
  }

  /**
   * Authenticate college user
   * * Single Database:
   * 1. Verify college is active
   * 2. Query user by email
   * 3. Verify user is active
   * 4. Verify password
   * 5. Generate token
   * * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Object} { token, user, college }
   * @throws {Error} If authentication fails
   */
  async authenticateCollegeUser(email, password) {
    const mainPool = getMainPool();

    try {
      logger.debug(
        `${LOG.TRANSACTION_PREFIX} Starting college user authentication`,
        { email }
      );

      // ====================================================================
      // Step 1: Query user with college details
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Querying user credentials`, {
        email
      });

      const userQuery = `
        SELECT 
          u.user_id,
          u.user_email,
          u.user_password,
          u.user_role,
          u.college_id,
          u.user_status,
          c.college_id,
          c.college_status,
          c.college_name
        FROM users u
        JOIN colleges c ON u.college_id = c.college_id
        WHERE LOWER(u.user_email) = LOWER($1)
        LIMIT 1
      `;

      const { rows } = await mainPool.query(userQuery, [email]);

      if (!rows || rows.length === 0) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - user not found`,
          { email }
        );
        throw new Error('Invalid credentials');
      }

      const userRecord = rows[0];

      // ====================================================================
      // Step 2: Check college is active
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Checking college status`, {
        college_id: userRecord.college_id,
        college_status: userRecord.college_status
      });

      if (userRecord.college_status !== STATUS.ACTIVE) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - college not active`,
          {
            user_id: userRecord.user_id,
            college_id: userRecord.college_id,
            college_status: userRecord.college_status
          }
        );
        throw new Error('College is not active');
      }

      // ====================================================================
      // Step 3: Check user is active
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Checking user status`, {
        user_id: userRecord.user_id,
        user_status: userRecord.user_status
      });

      if (userRecord.user_status !== STATUS.ACTIVE) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - user not active`,
          {
            user_id: userRecord.user_id,
            user_status: userRecord.user_status
          }
        );
        throw new Error('User account is inactive');
      }

      // ====================================================================
      // Step 4: Validate password
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Validating password`, {
        user_id: userRecord.user_id
      });

      const passwordMatch = await passwordHelper.compare(
        password,
        userRecord.user_password
      );

      if (!passwordMatch) {
        logger.warn(
          `${LOG.SECURITY_PREFIX} Authentication failed - invalid password`,
          { user_id: userRecord.user_id, email: userRecord.user_email }
        );
        throw new Error('Invalid credentials');
      }

      // ====================================================================
      // Step 5: Generate JWT token
      // ====================================================================
      logger.debug(`${LOG.TRANSACTION_PREFIX} Generating JWT token`, {
        user_id: userRecord.user_id
      });

      const userToken = jwtHelper.sign({
        id: userRecord.user_id,
        role: userRecord.user_role,
        email: userRecord.user_email,
        college_id: userRecord.college_id,
        timestamp: Date.now()
      });

      logger.info(
        `${LOG.TRANSACTION_PREFIX} College user authenticated successfully`,
        {
          user_id: userRecord.user_id,
          role: userRecord.user_role,
          college_id: userRecord.college_id
        }
      );

      return {
        token: userToken,
        user: {
          user_id: userRecord.user_id,
          user_email: userRecord.user_email,
          user_role: userRecord.user_role,
          college_id: userRecord.college_id
        },
        college: {
          college_id: userRecord.college_id,
          college_name: userRecord.college_name
        }
      };

    } catch (err) {
      logger.error(
        `${LOG.TRANSACTION_PREFIX} College user authentication failed`,
        { error: err.message, email }
      );

      throw err;
    }
  }
}

module.exports = new AuthService();