/**
 * ============================================================================
 * JWT HELPER - JSON Web Token Utilities
 * ============================================================================
 * Token generation and verification with logging
 */

const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { LOG } = require('../config/constants');

/**
 * Sign and generate JWT token
 * * @param {Object} payload - Token payload (user data)
 * @returns {string} JWT token
 * @throws {Error} If signing fails
 */
function sign(payload) {
  try {
    logger.debug(`${LOG.TRANSACTION_PREFIX} Generating JWT token`, {
      user_id: payload.id,
      role: payload.role
    });

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    return token;

  } catch (err) {
    logger.error(
      `${LOG.TRANSACTION_PREFIX} Error signing JWT`,
      { error: err.message }
    );
    throw err;
  }
}

/**
 * Verify and decode JWT token
 * * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid/expired
 */
function verify(token) {
  try {
    logger.debug(`${LOG.TRANSACTION_PREFIX} Verifying JWT token`);

    return jwt.verify(token, process.env.JWT_SECRET);

  } catch (err) {
    logger.warn(
      `${LOG.TRANSACTION_PREFIX} JWT verification failed`,
      { error: err.message }
    );
    return null;
  }
}

module.exports = { sign, verify };