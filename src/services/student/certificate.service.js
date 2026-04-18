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

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');
const { maybeResetApproval } = require('../../utils/approvalResetHelper');

const MAX_CERTIFICATES = 15;

// All insertable/updatable columns (excludes is_verified — admin only)
const CERTIFICATE_FIELDS = [
    'certificate_name', 'certificate_description', 'certificate_type',
    'issuing_organization', 'issuing_platform', 'credential_id',
    'credential_url', 'issue_date', 'expiry_date', 'does_not_expire',
    'skills_covered', 'certificate_url',
];

const RETURNING_COLUMNS = `certificate_id, certificate_name, certificate_description,
    certificate_type, issuing_organization, issuing_platform, credential_id,
    credential_url, issue_date, expiry_date, does_not_expire, skills_covered,
    certificate_url, is_verified, verification_status, verified_by, verified_at,
    rejection_reason, rejected_at, created_at, updated_at`;

// ============================================================================
// 1. ADD CERTIFICATE
// ============================================================================

async function addCertificate(studentId, collegeId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Check max limit
        const countResult = await client.query(
            `SELECT COUNT(*) AS cnt FROM student_certificates
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        );

        const currentCount = Number.parseInt(countResult.rows[0].cnt);
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

        // 3. Build insert — auto-approve if bypass is enabled
        const { getVerificationSettings } = require('../college/verificationSettings.service');
        const settings = await getVerificationSettings(collegeId);
        const autoApprove = settings?.bypass?.certificates ?? false;

        const fieldsToInsert = CERTIFICATE_FIELDS.filter(f => data[f] !== undefined);
        const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
        const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];

        if (autoApprove) {
            insertColumns.push('verification_status', 'is_verified');
            insertValues.push('approved', true);
        }

        const placeholders = insertValues.map((_, i) => `$${i + 1}`);

        const result = await client.query(
            `INSERT INTO student_certificates (${insertColumns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING ${RETURNING_COLUMNS}`,
            insertValues
        );

        // 4. Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'certificates');

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Certificate added`, {
            studentId,
            certificate_id: result.rows[0].certificate_id,
            certificate_count: currentCount + 1,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. GET ALL CERTIFICATES
// ============================================================================

async function getAllCertificates(studentId, collegeId) {
    const result = await query(
        `SELECT ${RETURNING_COLUMNS} FROM student_certificates
         WHERE student_id = $1 AND college_id = $2
         ORDER BY issue_date DESC NULLS LAST, created_at DESC`,
        [studentId, collegeId]
    );

    return {
        total_certificates: result.rows.length,
        max_certificates: MAX_CERTIFICATES,
        certificates: result.rows,
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

    // Check settings to decide if verification_status should reset
    const { getVerificationSettings } = require('../college/verificationSettings.service');
    const settings = await getVerificationSettings(collegeId);
    const resetVerification = settings.re_verify_on_edit.certificates;

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 4}`)
        .concat(['updated_at = NOW()']);

    // Always reset rejected items to pending on edit (student corrected the issue).
    // re_verify_on_edit only controls whether already-approved items get re-queued.
    if (resetVerification) {
        setClauses.push(
            "verification_status = 'pending'",
            'is_verified = false',
            'verified_by = NULL',
            'verified_at = NULL',
            'rejection_reason = NULL',
            'rejected_at = NULL',
        );
    } else {
        setClauses.push(
            "verification_status = CASE WHEN verification_status = 'rejected' THEN 'pending' ELSE verification_status END",
            "is_verified = CASE WHEN verification_status = 'rejected' THEN false ELSE is_verified END",
            "verified_by = CASE WHEN verification_status = 'rejected' THEN NULL ELSE verified_by END",
            "verified_at = CASE WHEN verification_status = 'rejected' THEN NULL ELSE verified_at END",
            "rejection_reason = CASE WHEN verification_status = 'rejected' THEN NULL ELSE rejection_reason END",
            "rejected_at = CASE WHEN verification_status = 'rejected' THEN NULL ELSE rejected_at END",
        );
    }

    const values = [
        certificateId, studentId, collegeId,
        ...fieldsToUpdate.map(f => data[f]),
    ];

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE student_certificates
             SET ${setClauses.join(', ')}
             WHERE certificate_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING ${RETURNING_COLUMNS}`,
            values
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Certificate not found or does not belong to you'),
                { status: 404 }
            );
        }

        // Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'certificates');

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Certificate updated`, {
            studentId,
            certificate_id: certificateId,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 4. DELETE CERTIFICATE
// ============================================================================

async function deleteCertificate(certificateId, studentId, collegeId) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(
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

        // Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'certificates');

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Certificate deleted`, {
            studentId,
            certificate_id: certificateId,
            name: result.rows[0].certificate_name,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
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
