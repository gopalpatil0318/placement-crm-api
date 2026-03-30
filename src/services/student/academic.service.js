/**
 * ============================================================================
 * STUDENT ACADEMIC INFO SERVICE — Upsert & Retrieve
 * ============================================================================
 * Functions:
 *   - saveAcademicInfo(studentId, collegeId, data)  — INSERT or UPDATE
 *   - getAcademicInfo(studentId, collegeId)          — SELECT
 *
 * Uses PostgreSQL ON CONFLICT (student_id) DO UPDATE for atomic upsert.
 * Handles roll_number uniqueness separately (UNIQUE across table).
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    DB_ERROR_CODES,
} = require('../../config/constants');

// Columns returned by INSERT/UPDATE (excludes internal 'id')
const RETURNING_COLUMNS = `
    student_id, college_id,
    roll_number, enrollment_number,
    admission_year, admission_based_on,
    tenth_percentage, tenth_board, tenth_passing_year,
    twelfth_or_diploma, twelfth_percentage, twelfth_board,
    diploma_percentage, diploma_branch,
    higher_education_passing_year,
    overall_cgpa, total_live_kts, total_dead_kts,
    any_gap_during_education, gap_years, gap_reason,
    created_at, updated_at`;

// All columns that can be set/updated (excludes id, student_id, college_id, timestamps)
const ACADEMIC_FIELDS = [
    'roll_number', 'enrollment_number',
    'admission_year', 'admission_based_on',
    'tenth_percentage', 'tenth_board', 'tenth_passing_year',
    'twelfth_or_diploma', 'twelfth_percentage', 'twelfth_board',
    'diploma_percentage', 'diploma_branch',
    'higher_education_passing_year',
    'overall_cgpa', 'total_live_kts', 'total_dead_kts',
    'any_gap_during_education', 'gap_years', 'gap_reason',
];

// ============================================================================
// 1. SAVE ACADEMIC INFO (Upsert — create or update)
// ============================================================================

async function saveAcademicInfo(studentId, collegeId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Verify student exists in this college
        const studentCheck = await client.query(
            `SELECT student_id FROM students
             WHERE student_id = $1 AND college_id = $2
             LIMIT 1`,
            [studentId, collegeId]
        );

        if (!studentCheck.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
        }

        // 2. Build columns and values for INSERT
        const fieldsToSet = ACADEMIC_FIELDS.filter(f => data[f] !== undefined);

        const insertColumns = ['student_id', 'college_id', ...fieldsToSet];
        const insertValues = [studentId, collegeId, ...fieldsToSet.map(f => data[f])];
        const insertPlaceholders = insertValues.map((_, i) => `$${i + 1}`);

        // 3. Build ON CONFLICT UPDATE SET clause
        const updateSetClauses = fieldsToSet
            .map(f => `${f} = EXCLUDED.${f}`)
            .concat(['updated_at = NOW()']);

        // 4. Execute upsert
        const result = await client.query(
            `INSERT INTO student_academic_information (${insertColumns.join(', ')})
             VALUES (${insertPlaceholders.join(', ')})
             ON CONFLICT (student_id)
             DO UPDATE SET ${updateSetClauses.join(', ')}
             RETURNING ${RETURNING_COLUMNS},
               (xmax = 0) AS is_new`,
            insertValues
        );

        const record = result.rows[0];
        const isNew = record.is_new;

        // Auto-reset profile approval when student updates academic info (skip on first insert)
        if (!isNew) {
            await client.query(
                `UPDATE students
                 SET profile_approval_status = 'pending', profile_is_approved = false,
                     approved_by = NULL, approved_at = NULL,
                     profile_rejection_reason = NULL, rejected_at = NULL,
                     updated_at = NOW()
                 WHERE student_id = $1 AND college_id = $2
                   AND profile_approval_status != 'pending'`,
                [studentId, collegeId]
            );
        }

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Student academic info ${isNew ? 'created' : 'updated'}`, {
            studentId,
            collegeId,
        });

        return {
            is_new: isNew,
            academic_info: record,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        // Handle roll_number uniqueness violation (per-college composite unique)
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION && err.constraint?.includes('roll')) {
            throw Object.assign(
                new Error('This roll number is already assigned to another student'),
                { status: 409 }
            );
        }
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. GET ACADEMIC INFO
// ============================================================================

async function getAcademicInfo(studentId, collegeId) {
    const result = await query(
        `SELECT sai.student_id, sai.college_id,
                sai.roll_number, sai.enrollment_number,
                sai.admission_year, sai.admission_based_on,
                sai.tenth_percentage, sai.tenth_board, sai.tenth_passing_year,
                sai.twelfth_or_diploma, sai.twelfth_percentage, sai.twelfth_board,
                sai.diploma_percentage, sai.diploma_branch,
                sai.higher_education_passing_year,
                sai.overall_cgpa, sai.total_live_kts, sai.total_dead_kts,
                sai.any_gap_during_education, sai.gap_years, sai.gap_reason,
                sai.created_at, sai.updated_at
         FROM student_academic_information sai
         WHERE sai.student_id = $1 AND sai.college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        return null;
    }

    return result.rows[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    saveAcademicInfo,
    getAcademicInfo,
};
