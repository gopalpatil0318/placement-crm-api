/**
 * ============================================================================
 * STUDENT CERTIFICATE SERVICE — CRUD with Max 15 Limit
 * ============================================================================
 * Functions:
 *   - addCertificate(studentId, collegeId, data)
 *   - getAllCertificates(studentId, collegeId)
 *   - updateCertificate(certificateId, studentId, collegeId, data)
 *   - deleteCertificate(certificateId, studentId, collegeId)
 *
 * Business Rules:
 *   - Maximum 15 certificates per student
 *   - does_not_expire = true → expiry_date auto-cleared
 *   - is_verified is read-only (set by college admin)
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');

const MAX_CERTIFICATES = 15;

// All insertable/updatable columns (excludes is_verified — admin only)
const CERTIFICATE_FIELDS = [
    'certificate_name', 'certificate_description', 'certificate_type',
    'issuing_organization', 'issuing_platform', 'credential_id',
    'credential_url', 'issue_date', 'expiry_date', 'does_not_expire',
    'skills_covered', 'certificate_url',
];

// ============================================================================
// 1. ADD CERTIFICATE
// ============================================================================

async function addCertificate(studentId, collegeId, data) {
    // 1. Check max limit
    const countResult = await query(
        `SELECT COUNT(*) AS cnt FROM student_certificates
         WHERE student_id = $1 AND college_id = $2`,
        [studentId, collegeId]
    );

    const currentCount = parseInt(countResult.rows[0].cnt);
    if (currentCount >= MAX_CERTIFICATES) {
        throw Object.assign(
            new Error(`Maximum ${MAX_CERTIFICATES} certificates allowed. Please remove an existing one before adding new`),
            { status: 400 }
        );
    }

    // 2. If does_not_expire, clear expiry_date
    if (data.does_not_expire === true) {
        data.expiry_date = null;
    }

    // 3. Build insert
    const fieldsToInsert = CERTIFICATE_FIELDS.filter(f => data[f] !== undefined);
    const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
    const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];
    const placeholders = insertValues.map((_, i) => `$${i + 1}`);

    const result = await query(
        `INSERT INTO student_certificates (${insertColumns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        insertValues
    );

    logger.info(`${LOG.API_END} Certificate added`, {
        studentId,
        certificate_id: result.rows[0].certificate_id,
        certificate_count: currentCount + 1,
    });

    return formatCertificate(result.rows[0]);
}

// ============================================================================
// 2. GET ALL CERTIFICATES
// ============================================================================

async function getAllCertificates(studentId, collegeId) {
    const result = await query(
        `SELECT * FROM student_certificates
         WHERE student_id = $1 AND college_id = $2
         ORDER BY issue_date DESC NULLS LAST, created_at DESC`,
        [studentId, collegeId]
    );

    return {
        total_certificates: result.rows.length,
        max_certificates: MAX_CERTIFICATES,
        certificates: result.rows.map(formatCertificate),
    };
}

// ============================================================================
// 3. UPDATE CERTIFICATE
// ============================================================================

async function updateCertificate(certificateId, studentId, collegeId, data) {
    // If does_not_expire, clear expiry_date
    if (data.does_not_expire === true) {
        data.expiry_date = null;
    }

    const fieldsToUpdate = CERTIFICATE_FIELDS.filter(f => data[f] !== undefined);

    if (fieldsToUpdate.length === 0) {
        throw Object.assign(new Error('At least one field must be provided to update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 4}`)
        .concat(['updated_at = NOW()']);

    const values = [
        certificateId, studentId, collegeId,
        ...fieldsToUpdate.map(f => data[f]),
    ];

    const result = await query(
        `UPDATE student_certificates
         SET ${setClauses.join(', ')}
         WHERE certificate_id = $1 AND student_id = $2 AND college_id = $3
         RETURNING *`,
        values
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error('Certificate not found or does not belong to you'),
            { status: 404 }
        );
    }

    logger.info(`${LOG.API_END} Certificate updated`, {
        studentId,
        certificate_id: certificateId,
    });

    return formatCertificate(result.rows[0]);
}

// ============================================================================
// 4. DELETE CERTIFICATE
// ============================================================================

async function deleteCertificate(certificateId, studentId, collegeId) {
    const result = await query(
        `DELETE FROM student_certificates
         WHERE certificate_id = $1 AND student_id = $2 AND college_id = $3
         RETURNING certificate_id, certificate_name`,
        [certificateId, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error('Certificate not found or does not belong to you'),
            { status: 404 }
        );
    }

    logger.info(`${LOG.API_END} Certificate deleted`, {
        studentId,
        certificate_id: certificateId,
        name: result.rows[0].certificate_name,
    });

    return result.rows[0];
}

// ============================================================================
// HELPER — Format certificate response
// ============================================================================

function formatCertificate(record) {
    return {
        certificate_id: record.certificate_id,
        certificate_name: record.certificate_name,
        certificate_description: record.certificate_description,
        certificate_type: record.certificate_type,
        issuing_organization: record.issuing_organization,
        issuing_platform: record.issuing_platform,
        credential_id: record.credential_id,
        credential_url: record.credential_url,
        issue_date: record.issue_date,
        expiry_date: record.expiry_date,
        does_not_expire: record.does_not_expire,
        skills_covered: record.skills_covered,
        certificate_url: record.certificate_url,
        is_verified: record.is_verified,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addCertificate,
    getAllCertificates,
    updateCertificate,
    deleteCertificate,
};
