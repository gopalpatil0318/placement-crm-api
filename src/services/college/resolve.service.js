/**
 * ============================================================================
 * RESOLVE SERVICE — Public College Lookup by Subdomain
 * ============================================================================
 * Used by the frontend to resolve a subdomain (e.g. "rcpit") into college
 * branding info before any user logs in.
 *
 * This is a PUBLIC endpoint — no authentication required.
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG, ERROR_MESSAGES } = require('../../config/constants');

// ── Reserved subdomains that cannot be used by colleges ─────────────────────

const RESERVED_SUBDOMAINS = new Set([
    'admin', 'api', 'www', 'app', 'mail', 'smtp', 'ftp',
    'staging', 'dev', 'test', 'beta', 'demo',
    'docs', 'help', 'support', 'status', 'blog',
]);

// ============================================================================
// RESOLVE COLLEGE BY SUBDOMAIN
// ============================================================================

/**
 * Look up a college by its unique subdomain and return branding info.
 * Also fetches the primary admin contact (email + phone) from the users table.
 *
 * @param {string} subdomain — lowercase subdomain slug (e.g. "rcpit")
 * @returns {Object} college branding info
 * @throws {Error} 400 if reserved, 404 if not found or inactive
 */
async function resolveBySubdomain(subdomain) {
    if (RESERVED_SUBDOMAINS.has(subdomain)) {
        throw Object.assign(
            new Error('This subdomain is reserved and cannot be used'),
            { status: 400 },
        );
    }

    const result = await query(
        `SELECT
            c.college_id,
            c.college_name,
            c.college_subdomain,
            c.college_type,
            c.college_city,
            c.college_state,
            c.college_logo_url,
            c.college_website,
            c.college_affiliation,
            c.college_established_year,
            c.college_description,
            a.user_email  AS admin_email,
            a.phone_number AS admin_phone
         FROM colleges c
         LEFT JOIN LATERAL (
            SELECT u.user_email, u.phone_number
            FROM users u
            WHERE u.college_id = c.college_id
              AND u.user_role  = 'collegeadmin'
              AND u.user_status = 'active'
            ORDER BY u.created_at ASC
            LIMIT 1
         ) a ON true
         WHERE c.college_subdomain = $1
           AND c.college_status    = 'active'`,
        [subdomain],
    );

    if (result.rows.length === 0) {
        logger.info(`${LOG.DB_QUERY} College resolve miss`, { subdomain });
        throw Object.assign(
            new Error(ERROR_MESSAGES.COLLEGE_NOT_FOUND),
            { status: 404 },
        );
    }

    logger.info(`${LOG.DB_QUERY} College resolved`, { subdomain });
    return result.rows[0];
}

module.exports = { resolveBySubdomain, RESERVED_SUBDOMAINS };
