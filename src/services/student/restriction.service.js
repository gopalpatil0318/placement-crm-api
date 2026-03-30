/**
 * ============================================================================
 * STUDENT RESTRICTION SERVICE — Own Restrictions Business Logic
 * ============================================================================
 *   - getMyRestrictions(studentId, collegeId, filters)
 *   - appealRestriction(restrictionId, studentId, collegeId, appealNotes)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// COLUMN CONSTANTS — explicit columns, no SELECT * or RETURNING *
// ============================================================================

const VERIFY_SELECT_COLUMNS = `
    sr.restriction_id, sr.restriction_type, sr.reason, sr.details,
    sr.applied_on, sr.valid_until, sr.is_active,
    sr.appeal_submitted, sr.appeal_notes, sr.appeal_resolved_at,
    sr.created_at, sr.updated_at,
    u.user_name AS restricted_by_name,
    ru.user_name AS resolved_by_name`;

const APPEAL_RETURNING_COLUMNS = `restriction_id, restriction_type, reason,
    is_active, appeal_submitted, appeal_notes,
    applied_on, valid_until, updated_at`;

// ============================================================================
// HELPER — Verify restriction belongs to the student
// ============================================================================

async function verifyStudentRestriction(restrictionId, studentId, collegeId) {
    const result = await query(
        `SELECT ${VERIFY_SELECT_COLUMNS}
         FROM student_restrictions sr
         LEFT JOIN users u ON sr.restricted_by = u.user_id
         LEFT JOIN users ru ON sr.resolved_by = ru.user_id
         WHERE sr.restriction_id = $1 AND sr.student_id = $2 AND sr.college_id = $3
         LIMIT 1`,
        [restrictionId, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.RESTRICTION_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 1. GET MY RESTRICTIONS (paginated, filtered, sorted)
// ============================================================================

async function getMyRestrictions(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    // Build WHERE
    const conditions = ['sr.student_id = $1', 'sr.college_id = $2'];
    const params = [studentId, collegeId];
    let paramIndex = 3;

    if (filters.is_active !== undefined) {
        conditions.push(`sr.is_active = $${paramIndex}`);
        params.push(filters.is_active);
        paramIndex++;
    }

    if (filters.restriction_type) {
        conditions.push(`sr.restriction_type = $${paramIndex}`);
        params.push(filters.restriction_type);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        created_at: 'sr.created_at',
        applied_on: 'sr.applied_on',
        valid_until: 'sr.valid_until',
        restriction_type: 'sr.restriction_type',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.created_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Run count, fetch, and summary in parallel (all independent)
    const [countResult, restrictionResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM student_restrictions sr
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT sr.restriction_id, sr.restriction_type, sr.reason, sr.details,
                sr.applied_on, sr.valid_until, sr.is_active,
                sr.appeal_submitted, sr.appeal_notes,
                sr.appeal_resolved_at,
                sr.created_at, sr.updated_at,
                u.user_name AS restricted_by_name,
                ru.user_name AS resolved_by_name
         FROM student_restrictions sr
         LEFT JOIN users u ON sr.restricted_by = u.user_id
         LEFT JOIN users ru ON sr.resolved_by = ru.user_id
         WHERE ${whereClause}
         ORDER BY sr.is_active DESC, ${sortCol} ${sortOrd}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT
                COUNT(*) AS total_restrictions,
                COALESCE(SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END), 0) AS active_count,
                COALESCE(SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END), 0) AS resolved_count,
                COALESCE(SUM(CASE WHEN appeal_submitted = true THEN 1 ELSE 0 END), 0) AS appeals_submitted,
                COALESCE(SUM(CASE WHEN appeal_submitted = true AND appeal_resolved_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS appeals_resolved,
                COALESCE(SUM(CASE WHEN appeal_submitted = true AND appeal_resolved_at IS NULL THEN 1 ELSE 0 END), 0) AS appeals_pending
             FROM student_restrictions
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);
    const stats = summaryResult.rows[0];

    const restrictions = restrictionResult.rows.map(row => ({
        ...row,
        details: row.details ?? null,
        valid_until: row.valid_until ?? null,
        restricted_by_name: row.restricted_by_name ?? null,
        appeal_notes: row.appeal_notes ?? null,
        appeal_resolved_at: row.appeal_resolved_at ?? null,
        resolved_by_name: row.resolved_by_name ?? null,
        is_expired: row.valid_until ? new Date(row.valid_until) < new Date() : false,
        can_appeal: row.is_active && !row.appeal_submitted,
    }));

    return {
        restrictions,
        total,
        page,
        limit,
        summary: {
            total_restrictions: Number.parseInt(stats.total_restrictions, 10),
            active_count: Number.parseInt(stats.active_count, 10),
            resolved_count: Number.parseInt(stats.resolved_count, 10),
            appeals_submitted: Number.parseInt(stats.appeals_submitted, 10),
            appeals_resolved: Number.parseInt(stats.appeals_resolved, 10),
            appeals_pending: Number.parseInt(stats.appeals_pending, 10),
        },
    };
}

// ============================================================================
// 2. APPEAL RESTRICTION
// ============================================================================

async function appealRestriction(restrictionId, studentId, collegeId, appealNotes) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock the restriction row to prevent concurrent appeal submissions
        const lockResult = await client.query(
            `SELECT ${VERIFY_SELECT_COLUMNS}
             FROM student_restrictions sr
             LEFT JOIN users u ON sr.restricted_by = u.user_id
             LEFT JOIN users ru ON sr.resolved_by = ru.user_id
             WHERE sr.restriction_id = $1 AND sr.student_id = $2 AND sr.college_id = $3
             FOR UPDATE OF sr`,
            [restrictionId, studentId, collegeId]
        );

        if (!lockResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.RESTRICTION_NOT_FOUND), { status: 404 });
        }

        const restriction = lockResult.rows[0];

        // Must be active
        if (!restriction.is_active) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.APPEAL_INACTIVE_RESTRICTION),
                { status: 400 }
            );
        }

        // Cannot appeal twice
        if (restriction.appeal_submitted) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.APPEAL_ALREADY_SUBMITTED),
                { status: 409 }
            );
        }

        const result = await client.query(
            `UPDATE student_restrictions
             SET appeal_submitted = true,
                 appeal_notes = $1,
                 updated_at = NOW()
             WHERE restriction_id = $2
             RETURNING ${APPEAL_RETURNING_COLUMNS}`,
            [appealNotes, restrictionId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Student submitted restriction appeal`, {
            restrictionId,
            studentId,
            restrictionType: restriction.restriction_type,
            collegeId,
        });

        return {
            ...result.rows[0],
            valid_until: result.rows[0].valid_until ?? null,
            restricted_by_name: restriction.restricted_by_name ?? null,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getMyRestrictions,
    appealRestriction,
};
