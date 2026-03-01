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

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    DB_ERROR_CODES,
} = require('../../config/constants');

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
    // 1. Verify student exists in this college
    const studentCheck = await query(
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
    try {
        const result = await query(
            `INSERT INTO student_academic_information (${insertColumns.join(', ')})
             VALUES (${insertPlaceholders.join(', ')})
             ON CONFLICT (student_id)
             DO UPDATE SET ${updateSetClauses.join(', ')}
             RETURNING *,
               (xmax = 0) AS is_new`,
            insertValues
        );

        const record = result.rows[0];
        const isNew = record.is_new;

        logger.info(`${LOG.AUTH} Student academic info ${isNew ? 'created' : 'updated'}`, {
            studentId,
            collegeId,
        });

        return {
            is_new: isNew,
            academic_info: formatAcademicInfo(record),
        };
    } catch (err) {
        // Handle roll_number uniqueness violation (UNIQUE across table, not per student)
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION && err.constraint?.includes('roll')) {
            throw Object.assign(
                new Error('This roll number is already assigned to another student'),
                { status: 409 }
            );
        }
        throw err;
    }
}

// ============================================================================
// 2. GET ACADEMIC INFO
// ============================================================================

async function getAcademicInfo(studentId, collegeId) {
    const result = await query(
        `SELECT sai.*
         FROM student_academic_information sai
         WHERE sai.student_id = $1 AND sai.college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        return null;
    }

    return formatAcademicInfo(result.rows[0]);
}

// ============================================================================
// HELPER — Format response (exclude internal fields)
// ============================================================================

function formatAcademicInfo(record) {
    const { id, ...rest } = record;
    return rest;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    saveAcademicInfo,
    getAcademicInfo,
};
