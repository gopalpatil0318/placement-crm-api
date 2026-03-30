/**
 * ============================================================================
 * STUDENT EXPERIENCE SERVICE — CRUD with Max 10 Limit
 * ============================================================================
 * Functions:
 *   - addExperience(studentId, collegeId, data)
 *   - getAllExperience(studentId, collegeId)
 *   - updateExperience(experienceId, studentId, collegeId, data)
 *   - deleteExperience(experienceId, studentId, collegeId)
 *
 * Business Rules:
 *   - Maximum 10 experience entries per student
 *   - is_current = true → end_date auto-cleared to null
 *   - duration_months auto-calculated if not provided
 *   - is_verified is read-only (set by college admin)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG, ERROR_MESSAGES } = require('../../config/constants');

const MAX_EXPERIENCE = 10;

// All insertable/updatable columns (excludes is_verified — admin only)
const EXPERIENCE_FIELDS = [
    'company_name', 'company_website', 'position_title',
    'employment_type', 'job_description', 'responsibilities',
    'technologies_used', 'work_location', 'work_mode',
    'start_date', 'end_date', 'is_current', 'duration_months',
    'stipend_amount', 'offer_letter_url', 'completion_certificate_url',
];

// Explicit columns returned from all queries (excludes student_id, college_id)
const RETURNING_COLUMNS = `experience_id, company_name, company_website, position_title,
    employment_type, job_description, responsibilities, technologies_used,
    work_location, work_mode, start_date, end_date, is_current, duration_months,
    stipend_amount, offer_letter_url, completion_certificate_url,
    is_verified, verification_status, verified_by, verified_at,
    rejection_reason, rejected_at, created_at, updated_at`;

// ============================================================================
// 1. ADD EXPERIENCE
// ============================================================================

async function addExperience(studentId, collegeId, data) {
    // If current role, clear end_date
    if (data.is_current === true) {
        data.end_date = null;
    }

    // Validate end_date >= start_date (when both provided and not current)
    if (data.end_date && data.start_date && new Date(data.end_date) < new Date(data.start_date)) {
        throw Object.assign(new Error('End date must be after start date'), { status: 400 });
    }

    // Auto-calculate duration if not provided
    if (!data.duration_months && data.start_date) {
        const start = new Date(data.start_date);
        const end = data.end_date ? new Date(data.end_date) : new Date();
        data.duration_months = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30)));
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Check max limit (inside transaction to prevent race condition)
        const countResult = await client.query(
            `SELECT COUNT(*) AS cnt FROM student_experience
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        );

        const currentCount = Number.parseInt(countResult.rows[0].cnt);
        if (currentCount >= MAX_EXPERIENCE) {
            throw Object.assign(
                new Error(`Maximum ${MAX_EXPERIENCE} experience entries allowed. Please remove an existing one before adding new`),
                { status: 400 }
            );
        }

        // 2. Build insert
        const fieldsToInsert = EXPERIENCE_FIELDS.filter(f => data[f] !== undefined);
        const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
        const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];
        const placeholders = insertValues.map((_, i) => `$${i + 1}`);

        const result = await client.query(
            `INSERT INTO student_experience (${insertColumns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING ${RETURNING_COLUMNS}`,
            insertValues
        );

        // 3. Reset profile approval status
        await client.query(
            `UPDATE students SET profile_approval_status = 'pending', profile_is_approved = false,
             approved_by = NULL, approved_at = NULL, profile_rejection_reason = NULL, rejected_at = NULL,
             updated_at = NOW() WHERE student_id = $1 AND college_id = $2 AND profile_approval_status != 'pending'`,
            [studentId, collegeId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Experience added`, {
            studentId,
            experience_id: result.rows[0].experience_id,
            company: data.company_name,
            experience_count: currentCount + 1,
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
// 2. GET ALL EXPERIENCE
// ============================================================================

async function getAllExperience(studentId, collegeId) {
    const result = await query(
        `SELECT ${RETURNING_COLUMNS} FROM student_experience
         WHERE student_id = $1 AND college_id = $2
         ORDER BY start_date DESC`,
        [studentId, collegeId]
    );

    return {
        total_experience: result.rows.length,
        max_experience: MAX_EXPERIENCE,
        experience: result.rows,
    };
}

// ============================================================================
// 3. UPDATE EXPERIENCE
// ============================================================================

async function updateExperience(experienceId, studentId, collegeId, data) {
    // If current role, clear end_date
    if (data.is_current === true) {
        data.end_date = null;
    }

    // Build dynamic UPDATE
    const fieldsToUpdate = EXPERIENCE_FIELDS.filter(f => data[f] !== undefined);

    if (fieldsToUpdate.length === 0) {
        throw Object.assign(new Error('At least one field must be provided to update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 4}`)
        .concat([
            'updated_at = NOW()',
            "verification_status = 'pending'",
            'is_verified = false',
            'verified_by = NULL',
            'verified_at = NULL',
            'rejection_reason = NULL',
            'rejected_at = NULL',
        ]);

    const values = [
        experienceId, studentId, collegeId,
        ...fieldsToUpdate.map(f => data[f]),
    ];

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE student_experience
             SET ${setClauses.join(', ')}
             WHERE experience_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING ${RETURNING_COLUMNS}`,
            values
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Experience not found or does not belong to you'),
                { status: 404 }
            );
        }

        // Reset profile approval status
        await client.query(
            `UPDATE students SET profile_approval_status = 'pending', profile_is_approved = false,
             approved_by = NULL, approved_at = NULL, profile_rejection_reason = NULL, rejected_at = NULL,
             updated_at = NOW() WHERE student_id = $1 AND college_id = $2 AND profile_approval_status != 'pending'`,
            [studentId, collegeId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Experience updated`, {
            studentId,
            experience_id: experienceId,
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
// 4. DELETE EXPERIENCE
// ============================================================================

async function deleteExperience(experienceId, studentId, collegeId) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `DELETE FROM student_experience
             WHERE experience_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING experience_id, company_name, position_title`,
            [experienceId, studentId, collegeId]
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Experience not found or does not belong to you'),
                { status: 404 }
            );
        }

        // Reset profile approval status
        await client.query(
            `UPDATE students SET profile_approval_status = 'pending', profile_is_approved = false,
             approved_by = NULL, approved_at = NULL, profile_rejection_reason = NULL, rejected_at = NULL,
             updated_at = NOW() WHERE student_id = $1 AND college_id = $2 AND profile_approval_status != 'pending'`,
            [studentId, collegeId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Experience deleted`, {
            studentId,
            experience_id: experienceId,
            company: result.rows[0].company_name,
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
    addExperience,
    getAllExperience,
    updateExperience,
    deleteExperience,
};
