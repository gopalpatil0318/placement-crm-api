/**
 * ============================================================================
 * RESTRICTION SERVICE — Student Restriction Management (COLLEGEADMIN only)
 * ============================================================================
 *   - addRestriction(studentId, collegeId, restrictedBy, data)
 *   - getAllRestrictions(collegeId, filters)
 *   - getStudentRestrictions(studentId, collegeId, filters)
 *   - updateRestriction(restrictionId, collegeId, userId, data)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// HELPER — Format restriction record for API response
// ============================================================================

function formatRestriction(record) {
    return {
        restriction_id: record.restriction_id,
        student_id: record.student_id,
        college_id: record.college_id,
        restriction_type: record.restriction_type,
        reason: record.reason,
        details: record.details || null,
        restricted_by: record.restricted_by,
        restricted_by_name: record.restricted_by_name || null,
        applied_on: record.applied_on,
        valid_until: record.valid_until || null,
        is_active: record.is_active,
        appeal_submitted: record.appeal_submitted,
        appeal_notes: record.appeal_notes || null,
        appeal_resolved_at: record.appeal_resolved_at || null,
        resolved_by: record.resolved_by || null,
        resolved_by_name: record.resolved_by_name || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        // Joined fields (when available)
        ...(record.student_name !== undefined && { student_name: record.student_name }),
        ...(record.student_email !== undefined && { student_email: record.student_email }),
        ...(record.dept_name !== undefined && { dept_name: record.dept_name }),
        ...(record.student_passout_year !== undefined && { student_passout_year: record.student_passout_year }),
    };
}

// ============================================================================
// 1. ADD RESTRICTION
// ============================================================================

/**
 * Add a restriction to a student.
 *
 * @param {string} studentId - UUID of the student
 * @param {string} collegeId - UUID of the college (from JWT)
 * @param {string} restrictedBy - UUID of the college user adding it (from JWT)
 * @param {Object} data - { restriction_type, reason, details, valid_until }
 * @returns {Object} Created restriction with enriched data
 */
async function addRestriction(studentId, collegeId, restrictedBy, data) {
    const { restriction_type, reason, details = null, valid_until = null } = data;

    // 1. Verify student exists and belongs to this college
    const studentCheck = await query(
        `SELECT s.student_id, s.first_name, s.last_name, s.student_email,
                s.student_passout_year, d.dept_name
         FROM students s
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         WHERE s.student_id = $1 AND s.college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!studentCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    // 2. Check for duplicate active restriction of same type
    const duplicateCheck = await query(
        `SELECT restriction_id FROM student_restrictions
         WHERE student_id = $1 AND college_id = $2
           AND restriction_type = $3 AND is_active = true
         LIMIT 1`,
        [studentId, collegeId, restriction_type]
    );

    if (duplicateCheck.rows.length) {
        throw Object.assign(
            new Error(`Student already has an active "${restriction_type}" restriction`),
            { status: 409 }
        );
    }

    // 3. Validate valid_until >= today (service-layer date validation)
    if (valid_until) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const validDate = new Date(valid_until);
        if (validDate < today) {
            throw Object.assign(
                new Error('Valid until date must be today or in the future'),
                { status: 400 }
            );
        }
    }

    // 4. Insert restriction
    const result = await query(
        `INSERT INTO student_restrictions
           (student_id, college_id, restriction_type, reason, details,
            restricted_by, valid_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [studentId, collegeId, restriction_type, reason, details,
            restrictedBy, valid_until]
    );

    const restriction = result.rows[0];

    // 5. Fetch restricted_by user name
    const userResult = await query(
        `SELECT user_name FROM users WHERE user_id = $1 LIMIT 1`,
        [restrictedBy]
    );

    const student = studentCheck.rows[0];

    logger.info(`${LOG.AUTH} Restriction added to student`, {
        restrictionId: restriction.restriction_id,
        studentId,
        restrictionType: restriction_type,
        restrictedBy,
        collegeId,
    });

    return formatRestriction({
        ...restriction,
        restricted_by_name: userResult.rows[0]?.user_name || null,
        student_name: `${student.first_name} ${student.last_name}`,
        student_email: student.student_email,
        dept_name: student.dept_name,
        student_passout_year: student.student_passout_year,
    });
}

// ============================================================================
// 2. GET ALL RESTRICTIONS (with passout_year filter)
// ============================================================================

/**
 * List all restrictions filtered by student passout year.
 * Returns enriched data with student name, dept, and restricted_by user name.
 *
 * @param {string} collegeId
 * @param {Object} filters - { passout_year (required), restriction_type, is_active, search, page, limit }
 * @returns {{ restrictions, total, page, limit }}
 */
async function getAllRestrictions(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['sr.college_id = $1', 's.student_passout_year = $2'];
    const params = [collegeId, filters.passout_year];
    let paramIndex = 3;

    // Optional: restriction_type filter
    if (filters.restriction_type) {
        conditions.push(`sr.restriction_type = $${paramIndex}`);
        params.push(filters.restriction_type);
        paramIndex++;
    }

    // Optional: is_active filter
    if (filters.is_active !== undefined) {
        conditions.push(`sr.is_active = $${paramIndex}`);
        params.push(filters.is_active);
        paramIndex++;
    }

    // Optional: search by student name
    if (filters.search) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.student_email ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count
    const countResult = await query(
        `SELECT COUNT(*) AS total
         FROM student_restrictions sr
         JOIN students s ON sr.student_id = s.student_id
         WHERE ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch with JOINs for enriched data
    const restrictionResult = await query(
        `SELECT sr.*,
                s.first_name || ' ' || s.last_name AS student_name,
                s.student_email,
                s.student_passout_year,
                d.dept_name,
                u.user_name AS restricted_by_name,
                ru.user_name AS resolved_by_name
         FROM student_restrictions sr
         JOIN students s ON sr.student_id = s.student_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         LEFT JOIN users u ON sr.restricted_by = u.user_id
         LEFT JOIN users ru ON sr.resolved_by = ru.user_id
         WHERE ${whereClause}
         ORDER BY sr.is_active DESC, sr.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
    );

    return {
        restrictions: restrictionResult.rows.map(formatRestriction),
        total,
        page,
        limit,
    };
}

// ============================================================================
// 3. GET STUDENT RESTRICTIONS
// ============================================================================

/**
 * Get all restrictions for a specific student.
 *
 * @param {string} studentId
 * @param {string} collegeId
 * @param {Object} filters - { is_active }
 * @returns {{ student, restrictions }}
 */
async function getStudentRestrictions(studentId, collegeId, filters = {}) {
    // 1. Verify student exists
    const studentCheck = await query(
        `SELECT s.student_id, s.first_name, s.last_name, s.student_email,
                s.student_passout_year, d.dept_name
         FROM students s
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         WHERE s.student_id = $1 AND s.college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!studentCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    // 2. Build conditions
    const conditions = ['sr.student_id = $1', 'sr.college_id = $2'];
    const params = [studentId, collegeId];
    let paramIndex = 3;

    if (filters.is_active !== undefined) {
        conditions.push(`sr.is_active = $${paramIndex}`);
        params.push(filters.is_active);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // 3. Fetch restrictions
    const restrictionResult = await query(
        `SELECT sr.*,
                u.user_name AS restricted_by_name,
                ru.user_name AS resolved_by_name
         FROM student_restrictions sr
         LEFT JOIN users u ON sr.restricted_by = u.user_id
         LEFT JOIN users ru ON sr.resolved_by = ru.user_id
         WHERE ${whereClause}
         ORDER BY sr.is_active DESC, sr.created_at DESC`,
        params
    );

    const student = studentCheck.rows[0];

    return {
        student: {
            student_id: student.student_id,
            student_name: `${student.first_name} ${student.last_name}`,
            student_email: student.student_email,
            student_passout_year: student.student_passout_year,
            dept_name: student.dept_name,
        },
        total_restrictions: restrictionResult.rows.length,
        active_restrictions: restrictionResult.rows.filter(r => r.is_active).length,
        restrictions: restrictionResult.rows.map(formatRestriction),
    };
}

// ============================================================================
// 4. UPDATE / RESOLVE RESTRICTION
// ============================================================================

/**
 * Update a restriction (change details, resolve/deactivate, extend valid_until).
 * When is_active=false, auto-sets resolved_by to the current user.
 *
 * @param {string} restrictionId
 * @param {string} collegeId
 * @param {string} userId - current user performing the action
 * @param {Object} data - { is_active, valid_until, details, reason }
 * @returns {Object} Updated restriction
 */
async function updateRestriction(restrictionId, collegeId, userId, data) {
    // 1. Verify restriction exists and belongs to college
    const existing = await query(
        `SELECT sr.*, s.first_name, s.last_name, s.student_email,
                s.student_passout_year, d.dept_name
         FROM student_restrictions sr
         JOIN students s ON sr.student_id = s.student_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         WHERE sr.restriction_id = $1 AND sr.college_id = $2
         LIMIT 1`,
        [restrictionId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.RESTRICTION_NOT_FOUND), { status: 404 });
    }

    // 2. Handle is_active changes
    if (data.is_active === false) {
        // Resolving — auto-set resolved_by
        data.resolved_by = userId;
    } else if (data.is_active === true && existing.rows[0].is_active === false) {
        // Re-activating — clear resolved fields
        data.resolved_by = null;
    }

    // 3. Validate valid_until >= today if provided
    if (data.valid_until) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const validDate = new Date(data.valid_until);
        if (validDate < today) {
            throw Object.assign(
                new Error('Valid until date must be today or in the future'),
                { status: 400 }
            );
        }
    }

    // 4. Build dynamic UPDATE
    const UPDATABLE_FIELDS = ['is_active', 'valid_until', 'details', 'reason', 'resolved_by'];
    const fieldsToUpdate = UPDATABLE_FIELDS.filter(f => data[f] !== undefined);

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 3}`)
        .concat(['updated_at = NOW()']);
    const values = [restrictionId, collegeId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE student_restrictions
         SET ${setClauses.join(', ')}
         WHERE restriction_id = $1 AND college_id = $2
         RETURNING *`,
        values
    );

    // 5. Fetch user names for response
    const [restrictedByUser, resolvedByUser] = await Promise.all([
        query(`SELECT user_name FROM users WHERE user_id = $1 LIMIT 1`, [result.rows[0].restricted_by]),
        result.rows[0].resolved_by
            ? query(`SELECT user_name FROM users WHERE user_id = $1 LIMIT 1`, [result.rows[0].resolved_by])
            : Promise.resolve({ rows: [] }),
    ]);

    const existingStudent = existing.rows[0];

    logger.info(`${LOG.AUTH} Restriction updated`, {
        restrictionId,
        updatedFields: fieldsToUpdate,
        collegeId,
        updatedBy: userId,
    });

    return formatRestriction({
        ...result.rows[0],
        restricted_by_name: restrictedByUser.rows[0]?.user_name || null,
        resolved_by_name: resolvedByUser.rows[0]?.user_name || null,
        student_name: `${existingStudent.first_name} ${existingStudent.last_name}`,
        student_email: existingStudent.student_email,
        dept_name: existingStudent.dept_name,
        student_passout_year: existingStudent.student_passout_year,
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addRestriction,
    getAllRestrictions,
    getStudentRestrictions,
    updateRestriction,
};
