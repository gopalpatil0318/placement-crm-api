/**
 * ============================================================================
 * JWT HELPER — Token Generation & Verification
 * ============================================================================
 * Centralizes all JWT operations. Uses config for secret/expiry.
 *
 * Token payloads:
 *   Sysadmin:     { role: 'sysadmin' }
 *   College user: { user_id, college_id, role, dept_id }
 *   Student:      { student_id, college_id }
 * ============================================================================
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const logger = require('../config/logger');
const { LOG } = require('../config/constants');

/**
 * Generate a signed JWT token.
 *
 * @param {Object} payload - Data to encode (user_id, college_id, role, etc.)
 * @param {Object} [options] - Override options (e.g. { expiresIn: '15m' })
 * @returns {string} Signed JWT token
 */
function generateToken(payload, options = {}) {
  try {
    const token = jwt.sign(payload, config.jwtSecret, {
      expiresIn: options.expiresIn || config.jwtExpiresIn,
      ...options,
    });

    logger.debug(`${LOG.AUTH} Token generated`, {
      role: payload.role,
      userId: payload.user_id || payload.student_id,
    });

    return token;
  } catch (err) {
    logger.error(`${LOG.AUTH} Token generation failed`, { error: err.message });
    throw err;
  }
}

/**
 * Verify and decode a JWT token.
 *
 * @param {string} token - JWT token string
 * @returns {Object|null} Decoded payload, or null if invalid/expired
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return decoded;
  } catch (err) {
    logger.warn(`${LOG.AUTH} Token verification failed`, {
      reason: err.name === 'TokenExpiredError' ? 'expired' : err.message,
    });
    return null;
  }
}

/**
 * Decode a JWT token WITHOUT verifying the signature.
 * Useful for reading payload from expired tokens (e.g. password reset check).
 *
 * @param {string} token - JWT token string
 * @returns {Object|null} Decoded payload or null
 */
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

module.exports = { generateToken, verifyToken, decodeToken };