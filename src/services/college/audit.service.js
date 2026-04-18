/**
 * ============================================================================
 * AUDIT LOG SERVICE — Query audit trail entries (B23)
 * ============================================================================
 *   - getAuditLogs(collegeId, filters)     — paginated list (no JSONB)
 *   - getAuditLogDetail(auditId, collegeId) — single entry with full JSONB
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');

// List view — excludes heavy JSONB columns (old_value, new_value) to reduce payload ~90%
const AUDIT_LIST_COLUMNS = `
  audit_id, college_id, user_id, user_name, user_role,
  action, resource_type, resource_id, summary,
  metadata, ip_address, created_at
`;

// Detail view — includes full diff data
const AUDIT_DETAIL_COLUMNS = `
  audit_id, college_id, user_id, user_name, user_role,
  action, resource_type, resource_id, summary,
  old_value, new_value, metadata, ip_address, created_at
`;

// Default lookback when no date filters are provided (90 days)
const DEFAULT_LOOKBACK_DAYS = 90;

/**
 * Build WHERE clause + params from filters. Shared by list and count queries.
 * @returns {{ whereClause: string, params: any[], nextIndex: number }}
 */
function buildWhereClause(collegeId, filters) {
    const conditions = ['college_id = $1'];
    const params = [collegeId];
    let idx = 2;

    // Default to 90-day lookback when no date filters are provided
    if (!filters.dateFrom && !filters.dateTo) {
        conditions.push(`created_at >= $${idx}`);
        const defaultFrom = new Date();
        defaultFrom.setDate(defaultFrom.getDate() - DEFAULT_LOOKBACK_DAYS);
        params.push(defaultFrom.toISOString());
        idx++;
    } else {
        if (filters.dateFrom) {
            conditions.push(`created_at >= $${idx}`);
            params.push(filters.dateFrom);
            idx++;
        }
        if (filters.dateTo) {
            conditions.push(`created_at <= $${idx}`);
            params.push(filters.dateTo);
            idx++;
        }
    }

    if (filters.userId) {
        conditions.push(`user_id = $${idx}`);
        params.push(filters.userId);
        idx++;
    }

    if (filters.action) {
        conditions.push(`action = $${idx}`);
        params.push(filters.action);
        idx++;
    }

    if (filters.resourceType) {
        conditions.push(`resource_type = $${idx}`);
        params.push(filters.resourceType);
        idx++;
    }

    if (filters.resourceId) {
        conditions.push(`resource_id = $${idx}`);
        params.push(filters.resourceId);
        idx++;
    }

    if (filters.search) {
        conditions.push(String.raw`summary ILIKE $${idx} ESCAPE '\'`);
        // Escape ILIKE wildcards so user input like '%' or '_' is treated as literal
        const escapedSearch = filters.search
            .replaceAll('\\', '\\\\')
            .replaceAll('%', String.raw`\%`)
            .replaceAll('_', String.raw`\_`);
        params.push(`%${escapedSearch}%`);
        idx++;
    }

    return { whereClause: conditions.join(' AND '), params, nextIndex: idx };
}

/**
 * Get paginated audit log entries for a college (list view — no old_value/new_value).
 *
 * @param {string} collegeId
 * @param {Object} filters - { dateFrom, dateTo, userId, action, resourceType, resourceId, search, page, limit }
 * @returns {Promise<{ logs: Array, total: number, page: number, limit: number }>}
 */
async function getAuditLogs(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);
    const { whereClause, params, nextIndex } = buildWhereClause(collegeId, filters);

    // Single query with window function — avoids separate COUNT round-trip
    const result = await query(
        `SELECT ${AUDIT_LIST_COLUMNS}, COUNT(*) OVER() AS _total
         FROM audit_log
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
        [...params, limit, offset]
    );

    const total = result.rows.length > 0
        ? Number.parseInt(result.rows[0]._total, 10)
        : 0;

    // Strip the _total column from each row before returning
    const logs = result.rows.map(({ _total, ...row }) => row);

    return {
        logs,
        total,
        page,
        limit,
    };
}

/**
 * Get a single audit log entry with full JSONB diff data.
 *
 * @param {string} auditId
 * @param {string} collegeId - Scoped to college for security
 * @returns {Promise<Object|null>}
 */
async function getAuditLogDetail(auditId, collegeId) {
    const result = await query(
        `SELECT ${AUDIT_DETAIL_COLUMNS}
         FROM audit_log
         WHERE audit_id = $1 AND college_id = $2`,
        [auditId, collegeId]
    );

    return result.rows[0] || null;
}

module.exports = {
    getAuditLogs,
    getAuditLogDetail,
};
