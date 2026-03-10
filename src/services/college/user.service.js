/**
 * ============================================================================
 * COLLEGE USER SERVICE — Auth, Password & User Management
 * ============================================================================
 * Auth:
 *   - loginCollegeUser(email, password)
 *   - forgotPassword(email)
 *   - changePassword(userId, collegeId, currentPassword, newPassword)
 *
 * Management (COLLEGEADMIN only):
 *   - createUser(data, collegeId)
 *   - getAllUsers(collegeId, filters)
 *   - getUserById(userId, collegeId)
 *   - updateUser(userId, collegeId, data)
 *   - toggleUserStatus(userId, collegeId, newStatus)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { generateToken, verifyToken } = require('../../utils/jwtHelper');
const { hashPassword, comparePassword } = require('../../utils/passwordHelper');
const { sendEmail } = require('../../utils/emailHelper');
const { getPagination } = require('../../utils/pagination');
const config = require('../../config/env');
const logger = require('../../config/logger');
const {
    LOG,
    ROLES,
    STATUS,
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    DB_ERROR_CODES,
} = require('../../config/constants');

// ============================================================================
// AUTH — 1. LOGIN
// ============================================================================

async function loginCollegeUser(email, password) {
    const result = await query(
        `SELECT
           u.user_id, u.user_name, u.user_email,
           u.user_password, u.user_role, u.user_status,
           u.college_id, u.dept_id,
           c.college_name, c.college_status
         FROM users u
         JOIN colleges c ON u.college_id = c.college_id
         WHERE LOWER(u.user_email) = LOWER($1)
         LIMIT 1`,
        [email]
    );

    if (!result.rows.length) {
        logger.warn(`${LOG.SECURITY} College login failed — email not found`, { email });
        throw Object.assign(new Error(ERROR_MESSAGES.INVALID_CREDENTIALS), { status: 401 });
    }

    const user = result.rows[0];

    // College must be active
    if (user.college_status !== STATUS.ACTIVE) {
        logger.warn(`${LOG.SECURITY} Login blocked — college inactive`, {
            email, collegeId: user.college_id,
        });
        throw Object.assign(
            new Error('Your college account has been deactivated. Please contact the system administrator'),
            { status: 403 }
        );
    }

    // User must be active — role-aware message
    if (user.user_status !== STATUS.ACTIVE) {
        logger.warn(`${LOG.SECURITY} Login blocked — user inactive`, {
            email, role: user.user_role,
        });
        const message = user.user_role === ROLES.COLLEGEADMIN
            ? 'Your college admin account has been deactivated. Please contact the system administrator'
            : `Your ${user.user_role} account has been deactivated. Please contact your college administrator`;
        throw Object.assign(new Error(message), { status: 403 });
    }

    // Verify password
    const passwordValid = await comparePassword(password, user.user_password);
    if (!passwordValid) {
        logger.warn(`${LOG.SECURITY} College login failed — wrong password`, { email });
        throw Object.assign(new Error(ERROR_MESSAGES.INVALID_CREDENTIALS), { status: 401 });
    }

    // Generate JWT
    const token = generateToken({
        id: user.user_id,
        college_id: user.college_id,
        role: user.user_role,
        dept_id: user.dept_id || null,
    });

    logger.info(`${LOG.AUTH} College user logged in`, {
        userId: user.user_id, role: user.user_role, collegeId: user.college_id,
    });

    return {
        token,
        user: {
            user_id: user.user_id,
            user_name: user.user_name,
            user_email: user.user_email,
            user_role: user.user_role,
            college_id: user.college_id,
            college_name: user.college_name,
            dept_id: user.dept_id,
        },
    };
}

// ============================================================================
// AUTH — 2. FORGOT PASSWORD
// ============================================================================

async function forgotPassword(email) {
    const result = await query(
        `SELECT u.user_id, u.user_name, u.user_email, u.user_status,
                c.college_status
         FROM users u
         JOIN colleges c ON u.college_id = c.college_id
         WHERE LOWER(u.user_email) = LOWER($1)
         LIMIT 1`,
        [email]
    );

    // Always return success to prevent email enumeration
    if (!result.rows.length) {
        logger.info(`${LOG.AUTH} Forgot password — email not found (silent)`, { email });
        return { message: 'If an account with this email exists, you will receive a password reset link' };
    }

    const user = result.rows[0];

    const resetToken = generateToken(
        { id: user.user_id, purpose: 'password_reset' },
        { expiresIn: '15m' }
    );

    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;

    await sendEmail({
        to: user.user_email,
        subject: 'Reset Your Password — Placement CRM',
        text: [
            `Hi ${user.user_name},`,
            '',
            'You requested a password reset for your Placement CRM account.',
            '',
            `Click the link below to reset your password (valid for 15 minutes):`,
            resetUrl,
            '',
            'If you did not request this, please ignore this email.',
            '',
            'Regards,',
            'Placement CRM Team',
        ].join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Reset Your Password</h2>
                <p>Hi <strong>${user.user_name}</strong>,</p>
                <p>You requested a password reset for your Placement CRM account.</p>
                <p>Click the button below to reset your password (valid for <strong>15 minutes</strong>):</p>
                <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-size: 16px;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #666; font-size: 13px;">Or copy and paste this link into your browser:</p>
                <p style="color: #4F46E5; font-size: 13px; word-break: break-all;">${resetUrl}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
            </div>
        `,
    });

    logger.info(`${LOG.AUTH} Password reset email sent`, {
        userId: user.user_id, email: user.user_email,
    });

    return { message: 'If an account with this email exists, you will receive a password reset link' };
}

// ============================================================================
// AUTH — 3. CHANGE PASSWORD
// ============================================================================

async function changePassword(userId, collegeId, currentPassword, newPassword) {
    const result = await query(
        `SELECT user_id, user_name, user_email, user_password
         FROM users
         WHERE user_id = $1 AND college_id = $2
         LIMIT 1`,
        [userId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.USER_NOT_FOUND), { status: 404 });
    }

    const user = result.rows[0];

    const currentValid = await comparePassword(currentPassword, user.user_password);
    if (!currentValid) {
        throw Object.assign(new Error('Current password is incorrect'), { status: 401 });
    }

    const hashedNew = await hashPassword(newPassword);

    await query(
        `UPDATE users
         SET user_password = $1, updated_at = NOW()
         WHERE user_id = $2 AND college_id = $3`,
        [hashedNew, userId, collegeId]
    );

    logger.info(`${LOG.AUTH} Password changed`, { userId, collegeId });

    return {
        user_id: user.user_id,
        user_name: user.user_name,
        user_email: user.user_email,
    };
}

// ============================================================================
// MANAGEMENT — 4. CREATE USER (COLLEGEADMIN only)
// ============================================================================

/**
 * Create a new college user (TPO, TPC, HOD, TEACHER).
 * College admin cannot create another college admin.
 *
 * @param {Object} data - { user_name, user_email, user_password, user_role, dept_id? }
 * @param {string} collegeId - From JWT
 * @returns {Object} Created user (no password in response)
 */
async function createUser(data, collegeId) {
    const { user_name, user_email, user_password, user_role, dept_id } = data;

    // 1. Check email uniqueness within the same college
    const existingUser = await query(
        `SELECT user_id FROM users
         WHERE LOWER(user_email) = LOWER($1) AND college_id = $2
         LIMIT 1`,
        [user_email, collegeId]
    );

    if (existingUser.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS), { status: 409 });
    }

    // 2. If dept_id provided, verify it belongs to this college
    if (dept_id) {
        const dept = await query(
            `SELECT dept_id FROM departments
             WHERE dept_id = $1 AND college_id = $2
             LIMIT 1`,
            [dept_id, collegeId]
        );

        if (!dept.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND), { status: 404 });
        }
    }

    // 3. Hash password
    const hashedPassword = await hashPassword(user_password);

    // 4. Insert user
    try {
        const result = await query(
            `INSERT INTO users (user_name, user_email, user_password, user_role, college_id, dept_id, user_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING user_id, user_name, user_email, user_role, college_id, dept_id, user_status, created_at`,
            [user_name, user_email, hashedPassword, user_role, collegeId, dept_id || null, STATUS.ACTIVE]
        );

        logger.info(`${LOG.AUTH} College user created`, {
            userId: result.rows[0].user_id,
            role: user_role,
            collegeId,
        });

        return result.rows[0];
    } catch (err) {
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            throw Object.assign(new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS), { status: 409 });
        }
        throw err;
    }
}

// ============================================================================
// MANAGEMENT — 5. GET ALL USERS (COLLEGEADMIN only)
// ============================================================================

/**
 * List all users in the college with optional filters.
 *
 * @param {string} collegeId - From JWT
 * @param {Object} filters   - { role?, status?, search?, page, limit }
 * @returns {{ users: Array, total: number, page, limit }}
 */
async function getAllUsers(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    // Build WHERE clauses dynamically
    const conditions = ['u.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (filters.role) {
        conditions.push(`u.user_role = $${paramIndex}`);
        params.push(filters.role);
        paramIndex++;
    }

    if (filters.status) {
        conditions.push(`u.user_status = $${paramIndex}`);
        params.push(filters.status);
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(`(u.user_name ILIKE $${paramIndex} OR u.user_email ILIKE $${paramIndex})`);
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count and fetch in parallel
    const [countResult, usersResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM users u WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT u.user_id, u.user_name, u.user_email, u.user_role,
                u.user_status, u.dept_id, u.created_at, u.updated_at,
                d.dept_name
         FROM users u
         LEFT JOIN departments d ON u.dept_id = d.dept_id
         WHERE ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    return {
        users: usersResult.rows,
        total,
        page,
        limit,
    };
}

// ============================================================================
// MANAGEMENT — 6. GET USER BY ID (COLLEGEADMIN only)
// ============================================================================

/**
 * Get a single user by ID (college-scoped).
 *
 * @param {string} userId
 * @param {string} collegeId
 * @returns {Object} User record
 */
async function getUserById(userId, collegeId) {
    const result = await query(
        `SELECT u.user_id, u.user_name, u.user_email, u.user_role,
                u.user_status, u.dept_id, u.created_at, u.updated_at,
                d.dept_name
         FROM users u
         LEFT JOIN departments d ON u.dept_id = d.dept_id
         WHERE u.user_id = $1 AND u.college_id = $2
         LIMIT 1`,
        [userId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.USER_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// MANAGEMENT — 7. UPDATE USER (COLLEGEADMIN only)
// ============================================================================

/**
 * Update user info. Cannot change password here (use change_password).
 *
 * @param {string} userId
 * @param {string} collegeId
 * @param {Object} data - { user_name?, user_email?, user_role?, dept_id? }
 * @returns {Object} Updated user
 */
async function updateUser(userId, collegeId, data) {
    // 1. Verify user exists in this college
    const existing = await query(
        `SELECT user_id, user_role FROM users
         WHERE user_id = $1 AND college_id = $2
         LIMIT 1`,
        [userId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.USER_NOT_FOUND), { status: 404 });
    }

    // 2. Prevent editing another college admin
    if (existing.rows[0].user_role === ROLES.COLLEGEADMIN) {
        throw Object.assign(
            new Error('Cannot modify a college admin account'),
            { status: 403 }
        );
    }

    // 3. If email is being changed, check uniqueness
    if (data.user_email) {
        const emailCheck = await query(
            `SELECT user_id FROM users
             WHERE LOWER(user_email) = LOWER($1) AND college_id = $2 AND user_id != $3
             LIMIT 1`,
            [data.user_email, collegeId, userId]
        );

        if (emailCheck.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS), { status: 409 });
        }
    }

    // 4. If dept_id is being changed, verify it
    if (data.dept_id) {
        const dept = await query(
            `SELECT dept_id FROM departments
             WHERE dept_id = $1 AND college_id = $2
             LIMIT 1`,
            [data.dept_id, collegeId]
        );

        if (!dept.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND), { status: 404 });
        }
    }

    // 5. Build dynamic UPDATE query
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
    }

    fields.push(`updated_at = NOW()`);
    values.push(userId, collegeId);

    try {
        const result = await query(
            `UPDATE users
         SET ${fields.join(', ')}
         WHERE user_id = $${paramIndex} AND college_id = $${paramIndex + 1}
         RETURNING user_id, user_name, user_email, user_role, user_status, dept_id, updated_at`,
            values
        );

        logger.info(`${LOG.AUTH} College user updated`, { userId, collegeId });

        return result.rows[0];
    } catch (err) {
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            throw Object.assign(new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS), { status: 409 });
        }
        throw err;
    }
}

// ============================================================================
// MANAGEMENT — 8. TOGGLE USER STATUS (COLLEGEADMIN only)
// ============================================================================

/**
 * Activate or inactivate a user.
 *
 * @param {string} userId
 * @param {string} collegeId
 * @param {string} newStatus - 'active' or 'inactive'
 * @returns {Object} Updated user
 */
async function toggleUserStatus(userId, collegeId, newStatus) {
    // 1. Verify user exists
    const existing = await query(
        `SELECT user_id, user_role, user_status FROM users
         WHERE user_id = $1 AND college_id = $2
         LIMIT 1`,
        [userId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.USER_NOT_FOUND), { status: 404 });
    }

    // 2. Cannot toggle college admin status
    if (existing.rows[0].user_role === ROLES.COLLEGEADMIN) {
        throw Object.assign(
            new Error('Cannot change college admin status. Contact system administrator'),
            { status: 403 }
        );
    }

    // 3. Skip if already in the target status
    if (existing.rows[0].user_status === newStatus) {
        throw Object.assign(
            new Error(`User is already ${newStatus}`),
            { status: 400 }
        );
    }

    // 4. Update status
    const result = await query(
        `UPDATE users
         SET user_status = $1, updated_at = NOW()
         WHERE user_id = $2 AND college_id = $3
         RETURNING user_id, user_name, user_email, user_role, user_status, updated_at`,
        [newStatus, userId, collegeId]
    );

    const action = newStatus === STATUS.ACTIVE ? 'activated' : 'deactivated';
    logger.info(`${LOG.AUTH} College user ${action}`, { userId, collegeId, newStatus });

    return result.rows[0];
}

// ============================================================================
// AUTH — 4. RESET PASSWORD (from email link)
// ============================================================================

async function resetPassword(token, newPassword) {
    const payload = verifyToken(token);
    if (!payload || payload.purpose !== 'password_reset') {
        throw Object.assign(
            new Error('Password reset link is invalid or has expired'),
            { status: 400 }
        );
    }

    const result = await query(
        `SELECT user_id, user_name, user_email
         FROM users
         WHERE user_id = $1
         LIMIT 1`,
        [payload.id]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.USER_NOT_FOUND), { status: 404 });
    }

    const user = result.rows[0];
    const hashedNew = await hashPassword(newPassword);

    await query(
        `UPDATE users
         SET user_password = $1, updated_at = NOW()
         WHERE user_id = $2`,
        [hashedNew, user.user_id]
    );

    logger.info(`${LOG.AUTH} User password reset successful`, { userId: user.user_id });

    return { user_email: user.user_email };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Auth
    loginCollegeUser,
    forgotPassword,
    changePassword,
    resetPassword,
    // Management
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    toggleUserStatus,
};
