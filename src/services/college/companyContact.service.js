/**
 * ============================================================================
 * COMPANY CONTACT SERVICE — Contact Person Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - addContact(companyId, collegeId, data)
 *   - getCompanyContacts(companyId, collegeId, filters)
 *   - updateContact(contactId, collegeId, data)
 *   - toggleContactStatus(contactId, collegeId, isActive)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
} = require('../../config/constants');

// Columns that can be inserted/updated
const FIELDS = [
    'contact_name',
    'contact_designation',
    'contact_email',
    'contact_phone',
    'is_primary',
    'notes',
];

// Explicit columns for RETURNING / SELECT (avoid RETURNING * / SELECT *)
const CONTACT_RETURNING_COLUMNS = `contact_id, company_id, college_id, contact_name,
    contact_designation, contact_email, contact_phone,
    is_primary, is_active, notes, created_at, updated_at`;

const CONTACT_SELECT_COLUMNS = `cc.contact_id, cc.company_id, cc.college_id, cc.contact_name,
    cc.contact_designation, cc.contact_email, cc.contact_phone,
    cc.is_primary, cc.is_active, cc.notes, cc.created_at, cc.updated_at`;

// ============================================================================
// HELPER — Verify company exists and belongs to college
// ============================================================================

async function verifyCompany(companyId, collegeId) {
    const result = await query(
        `SELECT company_id, company_name FROM companies
         WHERE company_id = $1 AND college_id = $2
         LIMIT 1`,
        [companyId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.COMPANY_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Format contact for API response
// ============================================================================

function formatContact(record) {
    return {
        contact_id: record.contact_id,
        company_id: record.company_id,
        college_id: record.college_id,
        contact_name: record.contact_name,
        contact_designation: record.contact_designation || null,
        contact_email: record.contact_email || null,
        contact_phone: record.contact_phone || null,
        is_primary: record.is_primary,
        is_active: record.is_active,
        notes: record.notes || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        // Joined fields (when available)
        ...(record.company_name !== undefined && { company_name: record.company_name }),
    };
}

// ============================================================================
// 1. ADD CONTACT
// ============================================================================

/**
 * Add a contact person to a company.
 * If is_primary=true, demotes any existing primary contact first.
 *
 * @param {string} companyId
 * @param {string} collegeId
 * @param {Object} data - validated body
 * @returns {Object} Created contact
 */
async function addContact(companyId, collegeId, data) {
    // 1. Verify company exists
    const company = await verifyCompany(companyId, collegeId);

    // 2. If email provided, check for duplicate within same company
    if (data.contact_email) {
        const emailCheck = await query(
            `SELECT contact_id FROM company_contacts
             WHERE company_id = $1 AND LOWER(contact_email) = LOWER($2) AND is_active = true
             LIMIT 1`,
            [companyId, data.contact_email]
        );

        if (emailCheck.rows.length) {
            throw Object.assign(
                new Error(`A contact with email "${data.contact_email}" already exists for this company`),
                { status: 409 }
            );
        }
    }

    // 3. Build dynamic INSERT
    const fieldsToInsert = FIELDS.filter(f => data[f] !== undefined);
    const columns = ['company_id', 'college_id', ...fieldsToInsert];
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const values = [companyId, collegeId, ...fieldsToInsert.map(f => data[f])];

    // 4. Use transaction if setting as primary (demote + insert must be atomic)
    if (data.is_primary === true) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE company_contacts
                 SET is_primary = false, updated_at = NOW()
                 WHERE company_id = $1 AND college_id = $2 AND is_primary = true`,
                [companyId, collegeId]
            );
            const result = await client.query(
                `INSERT INTO company_contacts (${columns.join(', ')})
                 VALUES (${placeholders.join(', ')})
                 RETURNING ${CONTACT_RETURNING_COLUMNS}`,
                values
            );
            await client.query('COMMIT');

            logger.info(`${LOG.AUTH} Contact added to company`, {
                contactId: result.rows[0].contact_id, companyId,
                companyName: company.company_name, contactName: data.contact_name, collegeId,
            });
            return formatContact({ ...result.rows[0], company_name: company.company_name });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Non-primary: no transaction needed
    const result = await query(
        `INSERT INTO company_contacts (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING ${CONTACT_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Contact added to company`, {
        contactId: result.rows[0].contact_id,
        companyId,
        companyName: company.company_name,
        contactName: data.contact_name,
        collegeId,
    });

    return formatContact({
        ...result.rows[0],
        company_name: company.company_name,
    });
}

// ============================================================================
// 2. GET COMPANY CONTACTS
// ============================================================================

/**
 * List all contacts for a company with optional filters.
 *
 * @param {string} companyId
 * @param {string} collegeId
 * @param {Object} filters - { is_active, search }
 * @returns {{ company, contacts }}
 */
async function getCompanyContacts(companyId, collegeId, filters = {}) {
    // 1. Verify company exists
    const company = await verifyCompany(companyId, collegeId);

    // 2. Build conditions
    const conditions = ['cc.company_id = $1', 'cc.college_id = $2'];
    const params = [companyId, collegeId];
    let paramIndex = 3;

    if (filters.is_active !== undefined) {
        conditions.push(`cc.is_active = $${paramIndex}`);
        params.push(filters.is_active);
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(
            `(cc.contact_name ILIKE $${paramIndex} OR cc.contact_email ILIKE $${paramIndex} OR cc.contact_designation ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // 3. Fetch contacts
    const contactsResult = await query(
        `SELECT ${CONTACT_SELECT_COLUMNS}
         FROM company_contacts cc
         WHERE ${whereClause}
         ORDER BY cc.is_primary DESC, cc.is_active DESC, cc.created_at ASC`,
        params
    );

    return {
        company: {
            company_id: company.company_id,
            company_name: company.company_name,
        },
        total_contacts: contactsResult.rows.length,
        active_contacts: contactsResult.rows.filter(c => c.is_active).length,
        contacts: contactsResult.rows.map(formatContact),
    };
}

// ============================================================================
// 3. UPDATE CONTACT
// ============================================================================

/**
 * Update a contact person's information.
 * If is_primary=true, demotes other primary contacts for the same company.
 *
 * @param {string} contactId
 * @param {string} collegeId
 * @param {Object} data - validated body with at least 1 field
 * @returns {Object} Updated contact
 */
async function updateContact(contactId, collegeId, data) {
    // 1. Verify contact exists and belongs to college
    const existing = await query(
        `SELECT ${CONTACT_SELECT_COLUMNS}, c.company_name
         FROM company_contacts cc
         JOIN companies c ON cc.company_id = c.company_id
         WHERE cc.contact_id = $1 AND cc.college_id = $2
         LIMIT 1`,
        [contactId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CONTACT_NOT_FOUND),
            { status: 404 }
        );
    }

    const existingContact = existing.rows[0];

    // 2. If email is changing, check for duplicate within same company
    if (data.contact_email &&
        data.contact_email.toLowerCase() !== (existingContact.contact_email || '').toLowerCase()) {
        const emailCheck = await query(
            `SELECT contact_id FROM company_contacts
             WHERE company_id = $1 AND LOWER(contact_email) = LOWER($2)
               AND is_active = true AND contact_id != $3
             LIMIT 1`,
            [existingContact.company_id, data.contact_email, contactId]
        );

        if (emailCheck.rows.length) {
            throw Object.assign(
                new Error(`A contact with email "${data.contact_email}" already exists for this company`),
                { status: 409 }
            );
        }
    }

    // 3. Build dynamic UPDATE
    const fieldsToUpdate = FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error('No valid fields provided for update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 3}`)
        .concat(['updated_at = NOW()']);
    const values = [contactId, collegeId, ...fieldsToUpdate.map(f => data[f])];

    // 4. Use transaction if promoting to primary (demote + update must be atomic)
    if (data.is_primary === true && !existingContact.is_primary) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE company_contacts
                 SET is_primary = false, updated_at = NOW()
                 WHERE company_id = $1 AND college_id = $2 AND is_primary = true AND contact_id != $3`,
                [existingContact.company_id, collegeId, contactId]
            );
            const result = await client.query(
                `UPDATE company_contacts
                 SET ${setClauses.join(', ')}
                 WHERE contact_id = $1 AND college_id = $2
                 RETURNING ${CONTACT_RETURNING_COLUMNS}`,
                values
            );
            await client.query('COMMIT');

            logger.info(`${LOG.AUTH} Contact updated`, {
                contactId, updatedFields: fieldsToUpdate,
                companyId: existingContact.company_id, collegeId,
            });
            return formatContact({ ...result.rows[0], company_name: existingContact.company_name });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    // Non-primary change: no transaction needed
    const result = await query(
        `UPDATE company_contacts
         SET ${setClauses.join(', ')}
         WHERE contact_id = $1 AND college_id = $2
         RETURNING ${CONTACT_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Contact updated`, {
        contactId,
        updatedFields: fieldsToUpdate,
        companyId: existingContact.company_id,
        collegeId,
    });

    return formatContact({
        ...result.rows[0],
        company_name: existingContact.company_name,
    });
}

// ============================================================================
// 4. TOGGLE CONTACT STATUS
// ============================================================================

/**
 * Activate or deactivate a contact.
 *
 * @param {string} contactId
 * @param {string} collegeId
 * @param {boolean} isActive
 * @returns {Object} Updated contact
 */
async function toggleContactStatus(contactId, collegeId, isActive) {
    // 1. Verify contact exists
    const existing = await query(
        `SELECT ${CONTACT_SELECT_COLUMNS}, c.company_name
         FROM company_contacts cc
         JOIN companies c ON cc.company_id = c.company_id
         WHERE cc.contact_id = $1 AND cc.college_id = $2
         LIMIT 1`,
        [contactId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CONTACT_NOT_FOUND),
            { status: 404 }
        );
    }

    // 2. Already same status?
    if (existing.rows[0].is_active === isActive) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CONTACT_ALREADY_STATUS),
            { status: 400 }
        );
    }

    // 3. Update
    const result = await query(
        `UPDATE company_contacts
         SET is_active = $1, updated_at = NOW()
         WHERE contact_id = $2 AND college_id = $3
         RETURNING ${CONTACT_RETURNING_COLUMNS}`,
        [isActive, contactId, collegeId]
    );

    logger.info(`${LOG.AUTH} Contact status toggled`, {
        contactId,
        isActive,
        companyName: existing.rows[0].company_name,
        collegeId,
    });

    return formatContact({
        ...result.rows[0],
        company_name: existing.rows[0].company_name,
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addContact,
    getCompanyContacts,
    updateContact,
    toggleContactStatus,
};
