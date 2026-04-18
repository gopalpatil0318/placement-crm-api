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
const crypto = require('node:crypto');
const config = require('../config/env');
const logger = require('../config/logger');
const { LOG } = require('../config/constants');
const { query } = require('../config/db');

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

// ============================================================================
// REFRESH TOKEN OPERATIONS — B21
// ============================================================================

/**
 * Generate a cryptographically random refresh token string.
 * @returns {string} 64-char hex token
 */
function generateRefreshTokenString() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a refresh token for storage (never store raw tokens in DB).
 * @param {string} token - Raw refresh token
 * @returns {string} SHA-256 hash
 */
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate and verify refresh tokens using a separate secret.
 */
function generateRefreshJwt(payload) {
  return jwt.sign(payload, config.refreshTokenSecret, {
    expiresIn: config.refreshTokenExpiresIn,
  });
}

function verifyRefreshJwt(token) {
  try {
    return jwt.verify(token, config.refreshTokenSecret);
  } catch (err) {
    logger.warn(`${LOG.AUTH} Refresh token verification failed`, {
      reason: err.name === 'TokenExpiredError' ? 'expired' : err.message,
    });
    return null;
  }
}

/**
 * Store a refresh token hash in the DB.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.userType - 'college' | 'student' | 'sysadmin'
 * @param {string} params.tokenHash - SHA-256 hash of the raw token
 * @param {string} params.familyId - UUID for token family (rotation)
 * @param {Date}   params.expiresAt
 * @param {Object} [params.client] - Optional transaction client
 */
async function storeRefreshToken({ userId, userType, tokenHash, familyId, expiresAt, client }) {
  const exec = client || query;
  await exec(
    `INSERT INTO refresh_tokens (user_id, user_type, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, userType, tokenHash, familyId, expiresAt]
  );
}

/**
 * Find a refresh token by its hash. Returns null if not found.
 */
async function findRefreshToken(tokenHash) {
  const result = await query(
    `SELECT token_id, user_id, user_type, family_id, expires_at, is_revoked, created_at
     FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

/**
 * Revoke a single refresh token by ID.
 * @param {string} tokenId
 * @param {Object} [client] - Optional transaction client
 */
async function revokeRefreshToken(tokenId, client) {
  const exec = client ? client.query.bind(client) : query;
  await exec(
    `UPDATE refresh_tokens SET is_revoked = true, revoked_at = NOW()
     WHERE token_id = $1 AND is_revoked = false`,
    [tokenId]
  );
}

/**
 * Revoke ALL tokens in a token family (security: replay detected).
 */
async function revokeTokenFamily(familyId) {
  await query(
    `UPDATE refresh_tokens SET is_revoked = true, revoked_at = NOW()
     WHERE family_id = $1 AND is_revoked = false`,
    [familyId]
  );
  logger.warn(`${LOG.AUTH} Token family revoked (possible replay)`, { familyId });
}

/**
 * Revoke all refresh tokens for a user (logout from all devices).
 */
async function revokeAllUserTokens(userId, userType) {
  await query(
    `UPDATE refresh_tokens SET is_revoked = true, revoked_at = NOW()
     WHERE user_id = $1 AND user_type = $2 AND is_revoked = false`,
    [userId, userType]
  );
}

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
  generateRefreshTokenString,
  hashRefreshToken,
  generateRefreshJwt,
  verifyRefreshJwt,
  storeRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeTokenFamily,
  revokeAllUserTokens,
};