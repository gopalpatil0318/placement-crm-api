/**
 * ============================================================================
 * AUTH CONTROLLER — Shared Refresh Token Endpoint
 * ============================================================================
 * Handles token refresh for all user types (college, student, sysadmin).
 *
 *   POST /api/auth/refresh  — Exchange refresh token for new access + refresh tokens
 * ============================================================================
 */

const { sendSuccess, sendError } = require('../utils/responseHelper');
const logger = require('../config/logger');
const { LOG, ERROR_MESSAGES } = require('../config/constants');
const {
    generateToken,
    generateRefreshTokenString,
    hashRefreshToken,
    findRefreshToken,
    revokeRefreshToken,
    revokeTokenFamily,
    storeRefreshToken,
} = require('../utils/jwtHelper');
const {
    COOKIE_OPTIONS,
    REFRESH_COOKIE_OPTIONS,
    CLEAR_COOKIE_OPTIONS,
    CLEAR_REFRESH_COOKIE_OPTIONS,
} = require('../config/cookie');
const { query, getClient } = require('../config/db');

// ============================================================================
// HELPER — Issue both access + refresh tokens and set cookies
// ============================================================================

/**
 * Issue access + refresh tokens and set as HttpOnly cookies.
 *
 * @param {Object} res - Express response
 * @param {Object} accessPayload - JWT payload for access token (id, role, college_id, etc.)
 * @param {string} userId - User or student UUID
 * @param {string} userType - 'college' | 'student' | 'sysadmin'
 * @param {string} [familyId] - Existing family ID for rotation (omit for new login)
 * @param {Object} [client] - Optional transaction client for atomic rotation
 */
async function issueTokenPair(res, accessPayload, userId, userType, familyId, client) {
    // 1. Generate access token (short-lived, 2h)
    const accessToken = generateToken(accessPayload);

    // 2. Generate refresh token (random string, stored as hash in DB)
    const rawRefreshToken = generateRefreshTokenString();
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const newFamilyId = familyId || require('node:crypto').randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 3. Store refresh token hash in DB
    await storeRefreshToken({
        userId,
        userType,
        tokenHash,
        familyId: newFamilyId,
        expiresAt,
        client,
    });

    // 4. Set cookies
    res.cookie('token', accessToken, COOKIE_OPTIONS);
    res.cookie('refresh_token', rawRefreshToken, REFRESH_COOKIE_OPTIONS);

    return { accessToken, familyId: newFamilyId };
}

// ============================================================================
// POST /api/auth/refresh — Silent token refresh
// ============================================================================

async function refresh(req, res) {
    const rawRefreshToken = req.cookies?.refresh_token;

    if (!rawRefreshToken) {
        return sendError(res, 'No refresh token provided', 401);
    }

    const tokenHash = hashRefreshToken(rawRefreshToken);
    const storedToken = await findRefreshToken(tokenHash);

    // Token not found in DB
    if (!storedToken) {
        res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('refresh_token', CLEAR_REFRESH_COOKIE_OPTIONS);
        return sendError(res, ERROR_MESSAGES.INVALID_TOKEN, 401);
    }

    // Token was already revoked — possible replay attack → revoke entire family
    if (storedToken.is_revoked) {
        await revokeTokenFamily(storedToken.family_id);
        res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('refresh_token', CLEAR_REFRESH_COOKIE_OPTIONS);
        logger.warn(`${LOG.SECURITY} Revoked refresh token reused — family revoked`, {
            userId: storedToken.user_id,
            familyId: storedToken.family_id,
        });
        return sendError(res, 'Session compromised. Please log in again.', 401);
    }

    // Token expired
    if (new Date(storedToken.expires_at) < new Date()) {
        await revokeRefreshToken(storedToken.token_id);
        res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('refresh_token', CLEAR_REFRESH_COOKIE_OPTIONS);
        return sendError(res, 'Refresh token expired. Please log in again.', 401);
    }

    // Rotate tokens atomically — if storing the new token fails, the old one stays valid
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Revoke the old refresh token (rotation — one-time use)
        await revokeRefreshToken(storedToken.token_id, client);

        // Look up current user data from DB to build access token payload
        const accessPayload = await buildAccessPayload(
            storedToken.user_id,
            storedToken.user_type,
        );

        if (!accessPayload) {
            await client.query('ROLLBACK');
            res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
            res.clearCookie('refresh_token', CLEAR_REFRESH_COOKIE_OPTIONS);
            return sendError(res, 'User account not found or inactive', 401);
        }

        // Issue new token pair (same family)
        await issueTokenPair(res, accessPayload, storedToken.user_id, storedToken.user_type, storedToken.family_id, client);

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`${LOG.AUTH} Token rotation failed`, { error: err.message, userId: storedToken.user_id });
        res.clearCookie('token', CLEAR_COOKIE_OPTIONS);
        res.clearCookie('refresh_token', CLEAR_REFRESH_COOKIE_OPTIONS);
        return sendError(res, 'Token refresh failed. Please log in again.', 500);
    } finally {
        client.release();
    }

    logger.info(`${LOG.AUTH} Token refreshed`, {
        userId: storedToken.user_id,
        userType: storedToken.user_type,
    });

    return sendSuccess(res, null, 'Token refreshed');
}

// ============================================================================
// HELPER — Build access token payload from current DB state
// ============================================================================

async function buildAccessPayload(userId, userType) {
    if (userType === 'sysadmin') {
        return { id: 'sysadmin', role: 'sysadmin' };
    }

    if (userType === 'college') {
        const result = await query(
            `SELECT u.user_id, u.college_id, u.user_role, u.dept_id, u.user_status,
                    c.college_status
             FROM users u
             JOIN colleges c ON u.college_id = c.college_id
             WHERE u.user_id = $1 AND u.user_status = 'active' AND c.college_status = 'active'
             LIMIT 1`,
            [userId]
        );
        const user = result.rows[0];
        if (!user) return null;
        return {
            id: user.user_id,
            college_id: user.college_id,
            role: user.user_role,
            dept_id: user.dept_id || null,
        };
    }

    if (userType === 'student') {
        const result = await query(
            `SELECT s.student_id, s.college_id, s.dept_id, s.student_status,
                    c.college_status
             FROM students s
             JOIN colleges c ON s.college_id = c.college_id
             WHERE s.student_id = $1 AND s.student_status = 'active' AND c.college_status = 'active'
             LIMIT 1`,
            [userId]
        );
        const student = result.rows[0];
        if (!student) return null;
        return {
            id: student.student_id,
            college_id: student.college_id,
            role: 'student',
            dept_id: student.dept_id,
        };
    }

    return null;
}

module.exports = { refresh, issueTokenPair };
