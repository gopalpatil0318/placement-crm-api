/**
 * ============================================================================
 * SYSADMIN SERVICE — Business Logic for Sysadmin APIs
 * ============================================================================
 * Covers:
 *   - Sysadmin login (.env credential verification)
 *   - College CRUD (create with admin user via transaction)
 *   - College status toggle, features update, academic year update
 *   - College listing with filters + pagination
 * ============================================================================
 */

const { getClient, query } = require('../../config/db');
const { generateToken } = require('../../utils/jwtHelper');
const { hashPassword } = require('../../utils/passwordHelper');
const config = require('../../config/env');
const logger = require('../../config/logger');
const {
    LOG,
    ROLES,
    STATUS,
    ERROR_MESSAGES,
    DB_ERROR_CODES,
} = require('../../config/constants');

// ============================================================================
// LOGIN
// ============================================================================

/**
 * Verify sysadmin credentials from .env and return a JWT.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ token: string, role: string, email: string }}
 * @throws {Error} INVALID_CREDENTIALS
 */
async function loginSysadmin(email, password) {
    if (!config.sysadminEmail || !config.sysadminPassword) {
        logger.error(`${LOG.AUTH} Sysadmin credentials not configured in .env`);
        throw Object.assign(new Error(ERROR_MESSAGES.SERVER_ERROR), { status: 500 });
    }

    const emailMatch = email.toLowerCase() === config.sysadminEmail.toLowerCase();
    const passwordMatch = password === config.sysadminPassword;

    if (!emailMatch || !passwordMatch) {
        logger.warn(`${LOG.SECURITY} Sysadmin login failed`, { email });
        throw Object.assign(new Error(ERROR_MESSAGES.INVALID_CREDENTIALS), { status: 401 });
    }

    const token = generateToken({
        id: 'sysadmin',
        role: ROLES.SYSADMIN,
        email: config.sysadminEmail,
    });

    logger.info(`${LOG.AUTH} Sysadmin logged in`, { email });

    return { token, role: ROLES.SYSADMIN, email: config.sysadminEmail };
}

// ============================================================================
// CREATE COLLEGE (with first admin user — transaction)
// ============================================================================

/**
 * @param {Object} data - Validated body from createCollegeSchema
 * @returns {{ college: Object, admin: Object }}
 */
async function createCollege(data) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Insert college
        const collegeResult = await client.query(
            `INSERT INTO colleges (
        college_name, college_subdomain, college_type,
        college_address, college_city, college_taluka,
        college_district, college_state, college_pincode,
        default_academic_year, college_status, enabled_features
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING
        college_id, college_name, college_subdomain, college_type,
        college_address, college_city, college_taluka, college_district,
        college_state, college_pincode, college_status,
        enabled_features, default_academic_year,
        created_at, updated_at`,
            [
                data.college_name,
                data.college_subdomain,
                data.college_type,
                data.college_address || null,
                data.college_city || null,
                data.college_taluka || null,
                data.college_district || null,
                data.college_state || null,
                data.college_pincode || null,
                data.default_academic_year,
                STATUS.ACTIVE,
                JSON.stringify(['core']),
            ]
        );

        const college = collegeResult.rows[0];

        // 2. Hash admin password
        const hashedPassword = await hashPassword(data.admin_password);

        // 3. Insert admin user
        const userResult = await client.query(
            `INSERT INTO users (
        college_id, user_name, user_email, user_password,
        user_role, user_status
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING user_id, user_name, user_email, user_role, user_status, created_at`,
            [
                college.college_id,
                data.admin_name,
                data.admin_email,
                hashedPassword,
                ROLES.COLLEGEADMIN,
                STATUS.ACTIVE,
            ]
        );

        const admin = userResult.rows[0];

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} College created with admin`, {
            collegeId: college.college_id,
            adminId: admin.user_id,
        });

        return {
            college,
            admin: {
                user_id: admin.user_id,
                user_name: admin.user_name,
                user_email: admin.user_email,
                user_role: admin.user_role,
            },
        };
    } catch (err) {
        await client.query('ROLLBACK');

        logger.error(`${LOG.TRANSACTION} College creation rolled back`, {
            error: err.message,
            code: err.code,
        });

        // Friendly error messages for constraint violations
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            if (err.constraint?.includes('subdomain')) {
                throw Object.assign(new Error(ERROR_MESSAGES.SUBDOMAIN_ALREADY_EXISTS), { status: 409 });
            }
            if (err.constraint?.includes('email')) {
                throw Object.assign(new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS), { status: 409 });
            }
            throw Object.assign(new Error(ERROR_MESSAGES.DUPLICATE_ENTRY), { status: 409 });
        }

        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// GET ALL COLLEGES (with filters + pagination)
// ============================================================================

/**
 * @param {{ page, limit, offset, status?, type?, search? }} params
 * @returns {{ colleges: Array, total: number }}
 */
async function getAllColleges({ page, limit, offset, status, type, search }) {
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
        conditions.push(`college_status = $${paramIndex++}`);
        values.push(status);
    }
    if (type) {
        conditions.push(`college_type = $${paramIndex++}`);
        values.push(type);
    }
    if (search) {
        conditions.push(`(college_name ILIKE $${paramIndex} OR college_subdomain ILIKE $${paramIndex})`);
        values.push(`%${search}%`);
        paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count and fetch in parallel
    const [countResult, listResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM colleges ${whereClause}`,
            values
        ),
        query(
            `SELECT
       college_id, college_name, college_subdomain, college_type,
       college_status, enabled_features, default_academic_year,
       college_city, college_state,
       created_at, updated_at
     FROM colleges
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...values, limit, offset]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    return { colleges: listResult.rows, total };
}

// ============================================================================
// GET COLLEGE BY ID (with admin info)
// ============================================================================

async function getCollegeById(collegeId) {
    const result = await query(
        `SELECT
       c.college_id, c.college_name, c.college_subdomain, c.college_type,
       c.college_address, c.college_city, c.college_taluka, c.college_district,
       c.college_state, c.college_pincode, c.college_status,
       c.enabled_features, c.default_academic_year,
       c.created_at, c.updated_at,
       a.user_name AS admin_name,
       a.user_email AS admin_email
     FROM colleges c
     LEFT JOIN LATERAL (
       SELECT u.user_name, u.user_email
       FROM users u
       WHERE u.college_id = c.college_id AND u.user_role = 'collegeadmin'
       ORDER BY u.created_at ASC
       LIMIT 1
     ) a ON true
     WHERE c.college_id = $1`,
        [collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COLLEGE_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// UPDATE COLLEGE
// ============================================================================

async function updateCollege(collegeId, data) {
    // Build dynamic SET clause from provided fields
    const allowedFields = [
        'college_name', 'college_subdomain', 'college_type',
        'college_address', 'college_city', 'college_taluka',
        'college_district', 'college_state', 'college_pincode',
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            setClauses.push(`${field} = $${paramIndex++}`);
            values.push(data[field]);
        }
    }

    if (setClauses.length === 0) {
        throw Object.assign(new Error('No fields to update'), { status: 400 });
    }

    setClauses.push('updated_at = NOW()');
    values.push(collegeId);

    try {
        const result = await query(
            `UPDATE colleges
     SET ${setClauses.join(', ')}
     WHERE college_id = $${paramIndex}
     RETURNING
       college_id, college_name, college_subdomain, college_type,
       college_address, college_city, college_taluka, college_district,
       college_state, college_pincode, college_status,
       enabled_features, default_academic_year,
       created_at, updated_at`,
            values
        );

        if (!result.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.COLLEGE_NOT_FOUND), { status: 404 });
        }

        logger.info(`${LOG.DB_QUERY} College updated`, { collegeId });
        return result.rows[0];
    } catch (err) {
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            if (err.constraint?.includes('subdomain')) {
                throw Object.assign(new Error(ERROR_MESSAGES.SUBDOMAIN_ALREADY_EXISTS), { status: 409 });
            }
            if (err.constraint?.includes('email')) {
                throw Object.assign(new Error(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS), { status: 409 });
            }
            throw Object.assign(new Error(ERROR_MESSAGES.DUPLICATE_ENTRY), { status: 409 });
        }
        throw err;
    }
}

// ============================================================================
// TOGGLE COLLEGE STATUS
// ============================================================================

async function toggleCollegeStatus(collegeId, newStatus) {
    const result = await query(
        `UPDATE colleges
     SET college_status = $1, updated_at = NOW()
     WHERE college_id = $2
     RETURNING college_id, college_name, college_status, updated_at`,
        [newStatus, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COLLEGE_NOT_FOUND), { status: 404 });
    }

    logger.info(`${LOG.DB_QUERY} College status toggled`, { collegeId, newStatus });
    return result.rows[0];
}

// ============================================================================
// UPDATE COLLEGE FEATURES
// ============================================================================

async function updateCollegeFeatures(collegeId, enabledFeatures) {
    const result = await query(
        `UPDATE colleges
     SET enabled_features = $1::jsonb, updated_at = NOW()
     WHERE college_id = $2
     RETURNING college_id, college_name, enabled_features, updated_at`,
        [JSON.stringify(enabledFeatures), collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COLLEGE_NOT_FOUND), { status: 404 });
    }

    logger.info(`${LOG.DB_QUERY} College features updated`, { collegeId, enabledFeatures });
    return result.rows[0];
}

// ============================================================================
// UPDATE ACADEMIC YEAR
// ============================================================================

async function updateAcademicYear(collegeId, academicYear) {
    const result = await query(
        `UPDATE colleges
     SET default_academic_year = $1, updated_at = NOW()
     WHERE college_id = $2
     RETURNING college_id, college_name, default_academic_year, updated_at`,
        [academicYear, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COLLEGE_NOT_FOUND), { status: 404 });
    }

    logger.info(`${LOG.DB_QUERY} Academic year updated`, { collegeId, academicYear });
    return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    loginSysadmin,
    createCollege,
    getAllColleges,
    getCollegeById,
    updateCollege,
    toggleCollegeStatus,
    updateCollegeFeatures,
    updateAcademicYear,
};
