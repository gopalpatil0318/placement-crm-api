/**
 * ============================================================================
 * PLACEMENT POLICY SERVICE — Business Logic for Policy Management
 * ============================================================================
 *   createPolicy      — Add a policy rule for a passout year
 *   getAllPolicies     — List policies (filter: passout_year, is_active, search)
 *   getPolicy         — Get single policy with creator info
 *   updatePolicy      — Update policy fields (dynamic SET)
 *   togglePolicyStatus— Activate / Deactivate a policy
 *   deletePolicy      — Hard delete a policy rule
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const { LOG, ERROR_MESSAGES } = require('../../config/constants');

// Fields that can be updated via updatePolicy
const UPDATABLE_FIELDS = ['passout_year', 'policy_title', 'policy_description'];

// Allowed sort columns (whitelist to prevent SQL injection)
const SORTABLE = {
    created_at: 'pp.created_at',
    policy_title: 'pp.policy_title',
    passout_year: 'pp.passout_year',
    updated_at: 'pp.updated_at',
};

// ============================================================================
// HELPER — Verify policy exists and belongs to college
// ============================================================================

async function verifyPolicy(policyId, collegeId) {
    const result = await query(
        `SELECT policy_id, college_id, passout_year, policy_title,
                policy_description, is_active, created_by,
                created_at, updated_at
         FROM placement_policies
         WHERE policy_id = $1 AND college_id = $2
         LIMIT 1`,
        [policyId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.POLICY_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Check duplicate policy title within same college + passout year
// ============================================================================

async function checkDuplicateTitle(collegeId, passoutYear, title, excludePolicyId = null) {
    let sql = `
        SELECT policy_id
        FROM placement_policies
        WHERE college_id = $1
          AND passout_year = $2
          AND LOWER(TRIM(policy_title)) = LOWER(TRIM($3))
    `;
    const params = [collegeId, passoutYear, title];

    if (excludePolicyId) {
        sql += ` AND policy_id != $4`;
        params.push(excludePolicyId);
    }

    sql += ' LIMIT 1';

    const result = await query(sql, params);

    if (result.rows.length) {
        throw Object.assign(
            new Error(`A policy with this title already exists for passout year ${passoutYear}`),
            { status: 409 }
        );
    }
}

// ============================================================================
// 1. CREATE POLICY
// ============================================================================

/**
 * Create a new placement policy rule.
 *
 * @param {string} collegeId
 * @param {string} userId — created_by
 * @param {Object} data — { passout_year, policy_title, policy_description }
 * @returns {Object} Created policy row
 */
async function createPolicy(collegeId, userId, data) {
    const { passout_year, policy_title, policy_description } = data;

    // Duplicate title check (same college + same year)
    await checkDuplicateTitle(collegeId, passout_year, policy_title);

    const result = await query(
        `INSERT INTO placement_policies
            (college_id, passout_year, policy_title, policy_description, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING policy_id, college_id, passout_year, policy_title,
                   policy_description, is_active, created_by,
                   created_at, updated_at`,
        [collegeId, passout_year, policy_title.trim(), policy_description.trim(), userId]
    );

    logger.info(`${LOG.API_END} Policy created`, {
        policy_id: result.rows[0].policy_id,
        college_id: collegeId,
        passout_year,
    });

    return result.rows[0];
}

// ============================================================================
// 2. GET ALL POLICIES (paginated, filtered, sorted)
// ============================================================================

/**
 * List all placement policies for a college with optional filters.
 *
 * @param {string} collegeId
 * @param {Object} filters — { passout_year, is_active, search, sort_by, sort_order, page, limit }
 * @returns {{ policies, total, page, limit, summary }}
 */
async function getAllPolicies(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);
    const { passout_year, is_active, search, sort_by, sort_order } = filters;

    // --- Build WHERE clauses ---
    const conditions = ['pp.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    if (passout_year) {
        conditions.push(`pp.passout_year = $${paramIndex}`);
        params.push(passout_year);
        paramIndex++;
    }

    if (is_active !== undefined && is_active !== '') {
        const activeVal = is_active === 'true' || is_active === true;
        conditions.push(`pp.is_active = $${paramIndex}`);
        params.push(activeVal);
        paramIndex++;
    }

    if (search && search.trim()) {
        conditions.push(
            `(pp.policy_title ILIKE $${paramIndex} OR pp.policy_description ILIKE $${paramIndex})`
        );
        params.push(`%${search.trim()}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // --- Sort ---
    const sortColumn = SORTABLE[sort_by] || SORTABLE.created_at;
    const order = sort_order === 'asc' ? 'ASC' : 'DESC';

    // --- Count + Data + Summary (parallel — all independent) ---
    const [countResult, dataResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM placement_policies pp WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT pp.policy_id, pp.passout_year, pp.policy_title,
                    pp.policy_description, pp.is_active,
                    pp.created_by, pp.created_at, pp.updated_at,
                    u.user_name AS created_by_name
             FROM placement_policies pp
             LEFT JOIN users u ON pp.created_by = u.user_id
             WHERE ${whereClause}
             ORDER BY ${sortColumn} ${order}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT
                COUNT(*) AS total_policies,
                COUNT(*) FILTER (WHERE is_active = true)  AS active_count,
                COUNT(*) FILTER (WHERE is_active = false) AS inactive_count,
                COUNT(DISTINCT passout_year) AS year_count
             FROM placement_policies
             WHERE college_id = $1`,
            [collegeId]
        ),
    ]);
    const total = parseInt(countResult.rows[0].total, 10);

    return {
        policies: dataResult.rows,
        total,
        page,
        limit,
        summary: summaryResult.rows[0],
    };
}

// ============================================================================
// 3. GET SINGLE POLICY
// ============================================================================

/**
 * Get a single policy with creator info.
 *
 * @param {string} policyId
 * @param {string} collegeId
 * @returns {Object} Policy with creator name
 */
async function getPolicy(policyId, collegeId) {
    const result = await query(
        `SELECT pp.policy_id, pp.passout_year, pp.policy_title,
                pp.policy_description, pp.is_active,
                pp.created_by, pp.created_at, pp.updated_at,
                u.user_name AS created_by_name
         FROM placement_policies pp
         LEFT JOIN users u ON pp.created_by = u.user_id
         WHERE pp.policy_id = $1 AND pp.college_id = $2
         LIMIT 1`,
        [policyId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.POLICY_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 4. UPDATE POLICY
// ============================================================================

/**
 * Update policy fields dynamically.
 *
 * @param {string} policyId
 * @param {string} collegeId
 * @param {Object} data — partial fields to update
 * @returns {Object} Updated policy
 */
async function updatePolicy(policyId, collegeId, data) {
    const existing = await verifyPolicy(policyId, collegeId);

    // Determine which fields are being updated
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const field of UPDATABLE_FIELDS) {
        if (data[field] !== undefined) {
            const value = typeof data[field] === 'string' ? data[field].trim() : data[field];
            setClauses.push(`${field} = $${paramIndex}`);
            params.push(value);
            paramIndex++;
        }
    }

    if (setClauses.length === 0) {
        throw Object.assign(
            new Error('At least one field must be provided to update'),
            { status: 400 }
        );
    }

    // Determine effective title + year for duplicate check
    const effectiveTitle = data.policy_title !== undefined
        ? data.policy_title.trim()
        : existing.policy_title;
    const effectiveYear = data.passout_year !== undefined
        ? data.passout_year
        : existing.passout_year;

    // Check for duplicate title (only when title or year is changing)
    if (data.policy_title !== undefined || data.passout_year !== undefined) {
        await checkDuplicateTitle(collegeId, effectiveYear, effectiveTitle, policyId);
    }

    // Add WHERE params
    params.push(policyId, collegeId);

    const result = await query(
        `UPDATE placement_policies
         SET ${setClauses.join(', ')}, updated_at = NOW()
         WHERE policy_id = $${paramIndex} AND college_id = $${paramIndex + 1}
         RETURNING policy_id, college_id, passout_year, policy_title,
                   policy_description, is_active, created_by,
                   created_at, updated_at`,
        params
    );

    logger.info(`${LOG.API_END} Policy updated`, {
        policy_id: policyId,
        college_id: collegeId,
        fields_updated: setClauses.length,
    });

    return result.rows[0];
}

// ============================================================================
// 5. TOGGLE POLICY STATUS
// ============================================================================

/**
 * Activate or deactivate a policy.
 *
 * @param {string} policyId
 * @param {string} collegeId
 * @param {boolean} isActive
 * @returns {Object} Updated policy
 */
async function togglePolicyStatus(policyId, collegeId, isActive) {
    const existing = await verifyPolicy(policyId, collegeId);

    if (existing.is_active === isActive) {
        throw Object.assign(
            new Error(`Policy is already ${isActive ? 'active' : 'inactive'}`),
            { status: 400 }
        );
    }

    const result = await query(
        `UPDATE placement_policies
         SET is_active = $1, updated_at = NOW()
         WHERE policy_id = $2 AND college_id = $3
         RETURNING policy_id, college_id, passout_year, policy_title,
                   policy_description, is_active, created_by,
                   created_at, updated_at`,
        [isActive, policyId, collegeId]
    );

    logger.info(`${LOG.API_END} Policy status toggled`, {
        policy_id: policyId,
        college_id: collegeId,
        is_active: isActive,
    });

    return result.rows[0];
}

// ============================================================================
// 6. DELETE POLICY
// ============================================================================

/**
 * Hard-delete a policy rule.
 *
 * @param {string} policyId
 * @param {string} collegeId
 * @returns {Object} Deleted policy row
 */
async function deletePolicy(policyId, collegeId) {
    await verifyPolicy(policyId, collegeId);

    const result = await query(
        `DELETE FROM placement_policies
         WHERE policy_id = $1 AND college_id = $2
         RETURNING policy_id, policy_title, passout_year`,
        [policyId, collegeId]
    );

    logger.info(`${LOG.API_END} Policy deleted`, {
        policy_id: policyId,
        college_id: collegeId,
    });

    return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createPolicy,
    getAllPolicies,
    getPolicy,
    updatePolicy,
    togglePolicyStatus,
    deletePolicy,
};
