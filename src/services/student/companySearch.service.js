/**
 * ============================================================================
 * STUDENT COMPANY SEARCH SERVICE — Lightweight Company Lookup
 * ============================================================================
 *   searchCompanies(collegeId, search, limit)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { STATUS } = require('../../config/constants');
const { resolveFileUrls, BUCKETS } = require('../../utils/storageHelper');

/**
 * Search active companies by name (ILIKE).
 * Used by the student self-report combobox.
 *
 * @param {string} collegeId
 * @param {string} search - min 2 chars enforced by validator
 * @param {number} [limit=10] - max 10
 * @returns {Promise<Array<{ company_id, company_name, company_logo, industry }>>}
 */
async function searchCompanies(collegeId, search, limit = 10) {
    // Escape LIKE special characters in user input
    const escapedSearch = search.replaceAll(/[%_\\]/g, String.raw`\$&`);

    const result = await query(
        `SELECT company_id, company_name, industry, company_logo
         FROM companies
         WHERE college_id = $1
           AND company_status = '${STATUS.COMPANY.ACTIVE}'
           AND company_name ILIKE $2
         ORDER BY company_name ASC
         LIMIT $3`,
        [collegeId, `%${escapedSearch}%`, Math.min(limit, 10)]
    );

    const companies = result.rows;

    await resolveFileUrls(companies, [
        { field: 'company_logo', bucket: BUCKETS.PUBLIC },
    ]);

    return companies;
}

module.exports = { searchCompanies };
