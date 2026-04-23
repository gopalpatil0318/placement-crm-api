/**
 * ============================================================================
 * DEPARTMENT SERVICE — CRUD Operations (COLLEGEADMIN only)
 * ============================================================================
 *   - createDepartment(data, collegeId)
 *   - getAllDepartments(collegeId, filters)
 *   - getDepartmentById(deptId, collegeId)
 *   - updateDepartment(deptId, collegeId, data)
 *   - toggleDepartmentStatus(deptId, collegeId, isActive)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
} = require('../../config/constants');
const { buildDeptFilter, assertInScope } = require('../../utils/deptScopeHelper');

// ============================================================================
// 1. CREATE DEPARTMENT
// ============================================================================

/**
 * Create a new department.
 * Enforces unique (college_id, dept_name) via DB constraint.
 *
 * @param {Object} data - { dept_name, dept_code?, dept_type?, program_duration_years?, total_semesters? }
 * @param {string} collegeId - From JWT
 * @returns {Object} Created department
 */
async function createDepartment(data, collegeId) {
    const {
        dept_name,
        dept_code = null,
        dept_type = null,
        program_duration_years = 4,
        total_semesters = 8,
    } = data;

    // Check duplicate name within the same college
    const existing = await query(
        `SELECT dept_id FROM departments
         WHERE college_id = $1 AND LOWER(dept_name) = LOWER($2)
         LIMIT 1`,
        [collegeId, dept_name]
    );

    if (existing.rows.length) {
        throw Object.assign(
            new Error('A department with this name already exists in your college'),
            { status: 409 }
        );
    }

    const result = await query(
        `INSERT INTO departments
           (college_id, dept_name, dept_code, dept_type, program_duration_years, total_semesters)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING dept_id, college_id, dept_name, dept_code, dept_type,
                   program_duration_years, total_semesters, is_active, created_at`,
        [collegeId, dept_name, dept_code, dept_type, program_duration_years, total_semesters]
    );

    logger.info(`${LOG.AUTH} Department created`, {
        deptId: result.rows[0].dept_id,
        deptName: dept_name,
        collegeId,
    });

    return result.rows[0];
}

// ============================================================================
// 2. GET ALL DEPARTMENTS
// ============================================================================

/**
 * List all departments in the college with optional filters.
 *
 * @param {string} collegeId
 * @param {Object} filters - { is_active?, search?, page, limit }
 * @returns {{ departments: Array, total: number, page, limit }}
 */
async function getAllDepartments(collegeId, filters = {}, deptScope = null) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['d.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Department scope enforcement
    const scopeFilter = buildDeptFilter(deptScope, paramIndex, 'd', 'dept_id');
    if (scopeFilter.clause) {
        conditions.push(scopeFilter.clause);
        params.push(...scopeFilter.params);
        paramIndex = scopeFilter.nextIndex;
    }

    // Filter by active status
    if (filters.is_active !== undefined) {
        conditions.push(`d.is_active = $${paramIndex}`);
        params.push(filters.is_active);
        paramIndex++;
    }

    // Search by name or code
    if (filters.search) {
        conditions.push(
            `(d.dept_name ILIKE $${paramIndex} OR d.dept_code ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    // Optional passout_year filter for student_count
    const countParams = [...params]; // Save before adding passout_year (count query doesn't need it)
    let studentJoinExtra = '';
    if (filters.passout_year) {
        studentJoinExtra = ` AND s.student_passout_year = $${paramIndex}`;
        params.push(Number(filters.passout_year));
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Count and fetch in parallel
    const [countResult, deptResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM departments d WHERE ${whereClause}`,
            countParams
        ),
        query(
            `SELECT d.dept_id, d.dept_name, d.dept_code, d.dept_type,
                d.program_duration_years, d.total_semesters,
                d.is_active, d.created_at,
                COUNT(DISTINCT u.user_id)::int AS user_count,
                COUNT(DISTINCT s.student_id)::int AS student_count
         FROM departments d
         LEFT JOIN users u ON d.dept_id = u.dept_id AND u.user_status = 'active'
         LEFT JOIN students s ON d.dept_id = s.dept_id AND s.student_status = 'active'${studentJoinExtra}
         WHERE ${whereClause}
         GROUP BY d.dept_id
         ORDER BY d.dept_name ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    return {
        departments: deptResult.rows,
        total,
        page,
        limit,
    };
}

// ============================================================================
// 3. GET DEPARTMENT BY ID
// ============================================================================

/**
 * Get a single department (college-scoped).
 *
 * @param {string} deptId
 * @param {string} collegeId
 * @returns {Object} Department with user and student counts
 */
async function getDepartmentById(deptId, collegeId, filters = {}, deptScope = null) {
    assertInScope(deptScope, deptId);

    let studentJoinExtra = '';
    const params = [deptId, collegeId];

    if (filters.passout_year) {
        studentJoinExtra = ` AND s.student_passout_year = $3`;
        params.push(Number(filters.passout_year));
    }

    const result = await query(
        `SELECT d.dept_id, d.dept_name, d.dept_code, d.dept_type,
                d.program_duration_years, d.total_semesters,
                d.is_active, d.created_at,
                COUNT(DISTINCT u.user_id)::int AS user_count,
                COUNT(DISTINCT s.student_id)::int AS student_count
         FROM departments d
         LEFT JOIN users u ON d.dept_id = u.dept_id AND u.user_status = 'active'
         LEFT JOIN students s ON d.dept_id = s.dept_id AND s.student_status = 'active'${studentJoinExtra}
         WHERE d.dept_id = $1 AND d.college_id = $2
         GROUP BY d.dept_id`,
        params
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 4. UPDATE DEPARTMENT
// ============================================================================

/**
 * Update department info.
 *
 * @param {string} deptId
 * @param {string} collegeId
 * @param {Object} data - { dept_name?, dept_code?, dept_type?, program_duration_years?, total_semesters? }
 * @returns {Object} Updated department
 */
async function updateDepartment(deptId, collegeId, data, deptScope = null) {
    assertInScope(deptScope, deptId);

    // 1. Verify exists
    const existing = await query(
        `SELECT dept_id FROM departments
         WHERE dept_id = $1 AND college_id = $2
         LIMIT 1`,
        [deptId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND), { status: 404 });
    }

    // 2. If name is changing, check uniqueness
    if (data.dept_name) {
        const nameCheck = await query(
            `SELECT dept_id FROM departments
             WHERE college_id = $1 AND LOWER(dept_name) = LOWER($2) AND dept_id != $3
             LIMIT 1`,
            [collegeId, data.dept_name, deptId]
        );

        if (nameCheck.rows.length) {
            throw Object.assign(
                new Error('A department with this name already exists in your college'),
                { status: 409 }
            );
        }
    }

    // 3. Build dynamic UPDATE
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
    }

    values.push(deptId, collegeId);

    const result = await query(
        `UPDATE departments
         SET ${fields.join(', ')}
         WHERE dept_id = $${paramIndex} AND college_id = $${paramIndex + 1}
         RETURNING dept_id, dept_name, dept_code, dept_type,
                   program_duration_years, total_semesters, is_active, created_at`,
        values
    );

    logger.info(`${LOG.AUTH} Department updated`, { deptId, collegeId });

    return result.rows[0];
}

// ============================================================================
// 5. TOGGLE DEPARTMENT STATUS
// ============================================================================

/**
 * Activate or deactivate a department.
 *
 * @param {string} deptId
 * @param {string} collegeId
 * @param {boolean} isActive
 * @returns {Object} Updated department
 */
async function toggleDepartmentStatus(deptId, collegeId, isActive, deptScope = null) {
    assertInScope(deptScope, deptId);

    // 1. Verify exists
    const existing = await query(
        `SELECT dept_id, is_active FROM departments
         WHERE dept_id = $1 AND college_id = $2
         LIMIT 1`,
        [deptId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND), { status: 404 });
    }

    // 2. Check if already in target status
    if (existing.rows[0].is_active === isActive) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.DEPARTMENT_ALREADY_STATUS),
            { status: 400 }
        );
    }

    // 3. Update
    const result = await query(
        `UPDATE departments
         SET is_active = $1
         WHERE dept_id = $2 AND college_id = $3
         RETURNING dept_id, dept_name, dept_code, dept_type,
                   program_duration_years, total_semesters, is_active, created_at`,
        [isActive, deptId, collegeId]
    );

    const action = isActive ? 'activated' : 'deactivated';
    logger.info(`${LOG.AUTH} Department ${action}`, { deptId, collegeId });

    return { ...result.rows[0], _previousStatus: existing.rows[0].is_active };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createDepartment,
    getAllDepartments,
    getDepartmentById,
    updateDepartment,
    toggleDepartmentStatus,
};
