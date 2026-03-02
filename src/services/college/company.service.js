/**
 * ============================================================================
 * COMPANY SERVICE — Company Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - createCompany(collegeId, data)
 *   - getAllCompanies(collegeId, filters)
 *   - getCompanyById(companyId, collegeId)
 *   - updateCompany(companyId, collegeId, data)
 *   - toggleCompanyStatus(companyId, collegeId, newStatus)
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
} = require('../../config/constants');

// Columns that can be inserted/updated by the user
const FIELDS = [
    'company_name',
    'company_description',
    'company_website',
    'industry',
    'company_logo',
];

// ============================================================================
// HELPER — Format company for API response
// ============================================================================

function formatCompany(record) {
    return {
        company_id: record.company_id,
        college_id: record.college_id,
        company_name: record.company_name,
        company_description: record.company_description || null,
        company_website: record.company_website || null,
        industry: record.industry || null,
        company_logo: record.company_logo || null,
        company_status: record.company_status,
        created_at: record.created_at,
        updated_at: record.updated_at,
        // Aggregated fields (when available)
        ...(record.contacts_count !== undefined && { contacts_count: parseInt(record.contacts_count, 10) }),
        ...(record.jobs_count !== undefined && { jobs_count: parseInt(record.jobs_count, 10) }),
    };
}

function formatContact(record) {
    return {
        contact_id: record.contact_id,
        company_id: record.company_id,
        contact_name: record.contact_name,
        contact_designation: record.contact_designation || null,
        contact_email: record.contact_email || null,
        contact_phone: record.contact_phone || null,
        is_primary: record.is_primary,
        is_active: record.is_active,
        notes: record.notes || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}

// ============================================================================
// 1. CREATE COMPANY
// ============================================================================

/**
 * Create a new company for this college.
 *
 * @param {string} collegeId - from JWT
 * @param {Object} data - validated body
 * @returns {Object} Created company
 */
async function createCompany(collegeId, data) {
    // 1. Check duplicate company name within this college (case-insensitive)
    const duplicateCheck = await query(
        `SELECT company_id FROM companies
         WHERE college_id = $1 AND LOWER(company_name) = LOWER($2)
         LIMIT 1`,
        [collegeId, data.company_name]
    );

    if (duplicateCheck.rows.length) {
        throw Object.assign(
            new Error(`Company "${data.company_name}" already exists in your college`),
            { status: 409 }
        );
    }

    // 2. Build dynamic INSERT from available fields
    const fieldsToInsert = FIELDS.filter(f => data[f] !== undefined);
    const columns = ['college_id', ...fieldsToInsert];
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const values = [collegeId, ...fieldsToInsert.map(f => data[f] ?? null)];

    const result = await query(
        `INSERT INTO companies (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        values
    );

    logger.info(`${LOG.AUTH} Company created`, {
        companyId: result.rows[0].company_id,
        companyName: data.company_name,
        collegeId,
    });

    return formatCompany(result.rows[0]);
}

// ============================================================================
// 2. GET ALL COMPANIES (with filters, sorting, pagination)
// ============================================================================

/**
 * List companies for this college with filtering, search, sorting, and pagination.
 *
 * @param {string} collegeId
 * @param {Object} filters - { company_status, industry, search, sort_by, sort_order, page, limit }
 * @returns {{ companies, total, page, limit }}
 */
async function getAllCompanies(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['c.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Filter: status
    if (filters.company_status) {
        conditions.push(`c.company_status = $${paramIndex}`);
        params.push(filters.company_status);
        paramIndex++;
    }

    // Filter: industry
    if (filters.industry) {
        conditions.push(`c.industry ILIKE $${paramIndex}`);
        params.push(`%${filters.industry}%`);
        paramIndex++;
    }

    // Filter: search (name or industry)
    if (filters.search) {
        conditions.push(
            `(c.company_name ILIKE $${paramIndex} OR c.industry ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Allowed sort columns (whitelist to prevent SQL injection)
    const SORTABLE_COLUMNS = {
        company_name: 'c.company_name',
        created_at: 'c.created_at',
        updated_at: 'c.updated_at',
        industry: 'c.industry',
    };
    const sortColumn = SORTABLE_COLUMNS[filters.sort_by] || 'c.created_at';
    const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count
    const countResult = await query(
        `SELECT COUNT(*) AS total FROM companies c WHERE ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch with contacts count and jobs count
    const companyResult = await query(
        `SELECT c.*,
                COALESCE(cc.cnt, 0) AS contacts_count,
                COALESCE(jp.cnt, 0) AS jobs_count
         FROM companies c
         LEFT JOIN (
             SELECT company_id, COUNT(*) AS cnt
             FROM company_contacts
             WHERE is_active = true
             GROUP BY company_id
         ) cc ON c.company_id = cc.company_id
         LEFT JOIN (
             SELECT company_id, COUNT(*) AS cnt
             FROM job_postings
             GROUP BY company_id
         ) jp ON c.company_id = jp.company_id
         WHERE ${whereClause}
         ORDER BY ${sortColumn} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
    );

    return {
        companies: companyResult.rows.map(formatCompany),
        total,
        page,
        limit,
    };
}

// ============================================================================
// 3. GET COMPANY BY ID (with contacts)
// ============================================================================

/**
 * Get a single company's details along with its contacts.
 *
 * @param {string} companyId
 * @param {string} collegeId
 * @returns {Object} Company with contacts array
 */
async function getCompanyById(companyId, collegeId) {
    // 1. Fetch company
    const companyResult = await query(
        `SELECT c.*,
                COALESCE(jp.cnt, 0) AS jobs_count
         FROM companies c
         LEFT JOIN (
             SELECT company_id, COUNT(*) AS cnt
             FROM job_postings
             GROUP BY company_id
         ) jp ON c.company_id = jp.company_id
         WHERE c.company_id = $1 AND c.college_id = $2`,
        [companyId, collegeId]
    );

    if (!companyResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND), { status: 404 });
    }

    // 2. Fetch contacts for this company
    const contactsResult = await query(
        `SELECT * FROM company_contacts
         WHERE company_id = $1 AND college_id = $2
         ORDER BY is_primary DESC, is_active DESC, created_at ASC`,
        [companyId, collegeId]
    );

    const company = formatCompany(companyResult.rows[0]);

    return {
        ...company,
        contacts_count: contactsResult.rows.length,
        active_contacts_count: contactsResult.rows.filter(c => c.is_active).length,
        contacts: contactsResult.rows.map(formatContact),
    };
}

// ============================================================================
// 4. UPDATE COMPANY
// ============================================================================

/**
 * Update company info. Checks for duplicate name if name is being changed.
 *
 * @param {string} companyId
 * @param {string} collegeId
 * @param {Object} data - validated body with at least 1 field
 * @returns {Object} Updated company
 */
async function updateCompany(companyId, collegeId, data) {
    // 1. Verify company exists
    const existing = await query(
        `SELECT company_id, company_name FROM companies
         WHERE company_id = $1 AND college_id = $2
         LIMIT 1`,
        [companyId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND), { status: 404 });
    }

    // 2. If name is changing, check for duplicates
    if (data.company_name && data.company_name.toLowerCase() !== existing.rows[0].company_name.toLowerCase()) {
        const duplicateCheck = await query(
            `SELECT company_id FROM companies
             WHERE college_id = $1 AND LOWER(company_name) = LOWER($2) AND company_id != $3
             LIMIT 1`,
            [collegeId, data.company_name, companyId]
        );

        if (duplicateCheck.rows.length) {
            throw Object.assign(
                new Error(`Company "${data.company_name}" already exists in your college`),
                { status: 409 }
            );
        }
    }

    // 3. Build dynamic UPDATE (only provided fields)
    const fieldsToUpdate = FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error('No valid fields provided for update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 3}`)
        .concat(['updated_at = NOW()']);
    const values = [companyId, collegeId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE companies
         SET ${setClauses.join(', ')}
         WHERE company_id = $1 AND college_id = $2
         RETURNING *`,
        values
    );

    logger.info(`${LOG.AUTH} Company updated`, {
        companyId,
        updatedFields: fieldsToUpdate,
        collegeId,
    });

    return formatCompany(result.rows[0]);
}

// ============================================================================
// 5. TOGGLE COMPANY STATUS
// ============================================================================

/**
 * Activate or deactivate a company.
 *
 * @param {string} companyId
 * @param {string} collegeId
 * @param {string} newStatus - 'active' or 'inactive'
 * @returns {Object} Updated company
 */
async function toggleCompanyStatus(companyId, collegeId, newStatus) {
    // 1. Verify exists
    const existing = await query(
        `SELECT company_id, company_name, company_status FROM companies
         WHERE company_id = $1 AND college_id = $2
         LIMIT 1`,
        [companyId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND), { status: 404 });
    }

    // 2. Already same status?
    if (existing.rows[0].company_status === newStatus) {
        throw Object.assign(
            new Error(`Company is already ${newStatus}`),
            { status: 400 }
        );
    }

    // 3. Update status
    const result = await query(
        `UPDATE companies
         SET company_status = $1, updated_at = NOW()
         WHERE company_id = $2 AND college_id = $3
         RETURNING *`,
        [newStatus, companyId, collegeId]
    );

    // 4. If deactivating, auto-close all published/draft jobs for this company
    let closedJobsCount = 0;
    if (newStatus === 'inactive') {
        const closeResult = await query(
            `UPDATE job_postings
             SET job_status = 'closed', allow_applications = false, updated_at = NOW()
             WHERE company_id = $1 AND college_id = $2
               AND job_status IN ('draft', 'published')
             RETURNING job_id`,
            [companyId, collegeId]
        );
        closedJobsCount = closeResult.rowCount;
    }

    logger.info(`${LOG.AUTH} Company status changed`, {
        companyId,
        companyName: existing.rows[0].company_name,
        previousStatus: existing.rows[0].company_status,
        newStatus,
        closedJobsCount,
        collegeId,
    });

    return {
        ...formatCompany(result.rows[0]),
        ...(closedJobsCount > 0 && { closed_jobs_count: closedJobsCount }),
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createCompany,
    getAllCompanies,
    getCompanyById,
    updateCompany,
    toggleCompanyStatus,
};
