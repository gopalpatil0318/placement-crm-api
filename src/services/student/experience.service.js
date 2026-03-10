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

const { query } = require('../../config/db');
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

// ============================================================================
// 1. ADD EXPERIENCE
// ============================================================================

async function addExperience(studentId, collegeId, data) {
    // 1. Check max limit
    const countResult = await query(
        `SELECT COUNT(*) AS cnt FROM student_experience
         WHERE student_id = $1 AND college_id = $2`,
        [studentId, collegeId]
    );

    const currentCount = parseInt(countResult.rows[0].cnt);
    if (currentCount >= MAX_EXPERIENCE) {
        throw Object.assign(
            new Error(`Maximum ${MAX_EXPERIENCE} experience entries allowed. Please remove an existing one before adding new`),
            { status: 400 }
        );
    }

    // 2. If current role, clear end_date
    if (data.is_current === true) {
        data.end_date = null;
    }

    // 3. Validate end_date >= start_date (when both provided and not current)
    if (data.end_date && data.start_date && new Date(data.end_date) < new Date(data.start_date)) {
        throw Object.assign(new Error('End date must be after start date'), { status: 400 });
    }

    // 3. Auto-calculate duration if not provided
    if (!data.duration_months && data.start_date) {
        const start = new Date(data.start_date);
        const end = data.end_date ? new Date(data.end_date) : new Date();
        data.duration_months = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30)));
    }

    // 4. Build insert
    const fieldsToInsert = EXPERIENCE_FIELDS.filter(f => data[f] !== undefined);
    const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
    const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];
    const placeholders = insertValues.map((_, i) => `$${i + 1}`);

    const result = await query(
        `INSERT INTO student_experience (${insertColumns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        insertValues
    );

    logger.info(`${LOG.API_END} Experience added`, {
        studentId,
        experience_id: result.rows[0].experience_id,
        company: data.company_name,
        experience_count: currentCount + 1,
    });

    return formatExperience(result.rows[0]);
}

// ============================================================================
// 2. GET ALL EXPERIENCE
// ============================================================================

async function getAllExperience(studentId, collegeId) {
    const result = await query(
        `SELECT * FROM student_experience
         WHERE student_id = $1 AND college_id = $2
         ORDER BY start_date DESC`,
        [studentId, collegeId]
    );

    return {
        total_experience: result.rows.length,
        max_experience: MAX_EXPERIENCE,
        experience: result.rows.map(formatExperience),
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

    const result = await query(
        `UPDATE student_experience
         SET ${setClauses.join(', ')}
         WHERE experience_id = $1 AND student_id = $2 AND college_id = $3
         RETURNING *`,
        values
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error('Experience not found or does not belong to you'),
            { status: 404 }
        );
    }

    logger.info(`${LOG.API_END} Experience updated`, {
        studentId,
        experience_id: experienceId,
    });

    return formatExperience(result.rows[0]);
}

// ============================================================================
// 4. DELETE EXPERIENCE
// ============================================================================

async function deleteExperience(experienceId, studentId, collegeId) {
    const result = await query(
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

    logger.info(`${LOG.API_END} Experience deleted`, {
        studentId,
        experience_id: experienceId,
        company: result.rows[0].company_name,
    });

    return result.rows[0];
}

// ============================================================================
// HELPER — Format experience response
// ============================================================================

function formatExperience(record) {
    return {
        experience_id: record.experience_id,
        company_name: record.company_name,
        company_website: record.company_website,
        position_title: record.position_title,
        employment_type: record.employment_type,
        job_description: record.job_description,
        responsibilities: record.responsibilities,
        technologies_used: record.technologies_used,
        work_location: record.work_location,
        work_mode: record.work_mode,
        start_date: record.start_date,
        end_date: record.end_date,
        is_current: record.is_current,
        duration_months: record.duration_months,
        stipend_amount: record.stipend_amount,
        offer_letter_url: record.offer_letter_url,
        completion_certificate_url: record.completion_certificate_url,
        is_verified: record.is_verified,
        verification_status: record.verification_status,
        verified_by: record.verified_by,
        verified_at: record.verified_at,
        rejection_reason: record.rejection_reason,
        rejected_at: record.rejected_at,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
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
