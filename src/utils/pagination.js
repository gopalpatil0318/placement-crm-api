/**
 * ============================================================================
 * PAGINATION HELPER — Standardized Pagination for List APIs
 * ============================================================================
 *
 * Usage in controllers:
 *   const { page, limit, offset } = getPagination(req.query);
 *   // ... query with LIMIT $x OFFSET $y ...
 *   return sendPaginated(res, rows, total, { page, limit });
 *
 * ============================================================================
 */

const { PAGINATION } = require('../config/constants');

/**
 * Parse pagination params from request query.
 *
 * @param {Object} query - req.query object
 * @returns {{ page: number, limit: number, offset: number }}
 */
function getPagination(query = {}) {
    const page = Math.max(parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE, 1);
    const limit = Math.min(
        Math.max(parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT, 1),
        PAGINATION.MAX_LIMIT
    );
    const offset = (page - 1) * limit;

    return { page, limit, offset };
}

module.exports = { getPagination };
