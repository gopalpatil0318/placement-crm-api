/**
 * ============================================================================
 * PASSWORD HELPER — Hashing & Comparison with bcrypt
 * ============================================================================
 * - Uses salt rounds from AUTH constants
 * - Provides default password generator for bulk student registration
 * ============================================================================
 */

const bcrypt = require('bcrypt');
const logger = require('../config/logger');
const { AUTH, LOG } = require('../config/constants');

/**
 * Hash a plain-text password.
 *
 * @param {string} plainPassword - The plain-text password
 * @returns {Promise<string>} The bcrypt hash
 */
async function hashPassword(plainPassword) {
  try {
    const hash = await bcrypt.hash(plainPassword, AUTH.SALT_ROUNDS);
    logger.debug(`${LOG.AUTH} Password hashed successfully`);
    return hash;
  } catch (err) {
    logger.error(`${LOG.AUTH} Password hashing failed`, { error: err.message });
    throw err;
  }
}

/**
 * Compare a plain-text password against a bcrypt hash.
 *
 * @param {string} plainPassword - The plain-text password to check
 * @param {string} hashedPassword - The stored bcrypt hash
 * @returns {Promise<boolean>} True if passwords match
 */
async function comparePassword(plainPassword, hashedPassword) {
  try {
    const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return isMatch;
  } catch (err) {
    logger.error(`${LOG.AUTH} Password comparison failed`, { error: err.message });
    throw err;
  }
}

/**
 * Generate a default password for bulk student registration.
 * Format: firstname@passout_year (e.g. "rahul@2025")
 *
 * @param {string} firstName - Student's first name (lowercase)
 * @param {number} passoutYear - Passout year
 * @returns {string} Default password string
 */
function generateDefaultPassword(firstName, passoutYear) {
  return `${firstName.toLowerCase()}@${passoutYear}`;
}

module.exports = { hashPassword, comparePassword, generateDefaultPassword };