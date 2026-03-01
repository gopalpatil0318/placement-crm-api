/**
 * ============================================================================
 * STUDENT PERSONAL INFO SERVICE — Upsert & Retrieve
 * ============================================================================
 * Functions:
 *   - savePersonalInfo(studentId, collegeId, data)  — INSERT or UPDATE
 *   - getPersonalInfo(studentId, collegeId)          — SELECT
 *
 * Uses PostgreSQL ON CONFLICT (student_id) DO UPDATE for atomic upsert.
 * When same_as_permanent = true, current address fields are auto-copied.
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
} = require('../../config/constants');

// All columns that can be set/updated (excludes id, student_id, college_id, timestamps)
const PERSONAL_FIELDS = [
    'mobile_number', 'alternate_mobile',
    'birth_date', 'gender', 'blood_group',
    'aadhaar_number', 'caste', 'category', 'nationality',
    'father_name', 'father_mobile', 'father_occupation', 'father_annual_income',
    'mother_name', 'mother_mobile', 'mother_occupation', 'mother_annual_income',
    'guardian_name', 'guardian_mobile',
    'permanent_address', 'permanent_city', 'permanent_district',
    'permanent_state', 'permanent_pincode',
    'current_address', 'current_city', 'current_district',
    'current_state', 'current_pincode',
    'same_as_permanent',
];

// ============================================================================
// 1. SAVE PERSONAL INFO (Upsert — create or update)
// ============================================================================

async function savePersonalInfo(studentId, collegeId, data) {
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

    // 2. Handle same_as_permanent — copy permanent address to current
    //    If permanent fields aren't in the request, fetch from DB first
    if (data.same_as_permanent === true) {
        const permFields = ['permanent_address', 'permanent_city', 'permanent_district', 'permanent_state', 'permanent_pincode'];
        const hasPermanentInRequest = permFields.some(f => data[f] !== undefined);

        let permSource = data;

        if (!hasPermanentInRequest) {
            // Fetch existing permanent address from DB
            const existingResult = await query(
                `SELECT permanent_address, permanent_city, permanent_district, permanent_state, permanent_pincode
                 FROM student_personal_information
                 WHERE student_id = $1 AND college_id = $2
                 LIMIT 1`,
                [studentId, collegeId]
            );
            if (existingResult.rows.length) {
                permSource = existingResult.rows[0];
            }
        }

        data.current_address = permSource.permanent_address || null;
        data.current_city = permSource.permanent_city || null;
        data.current_district = permSource.permanent_district || null;
        data.current_state = permSource.permanent_state || null;
        data.current_pincode = permSource.permanent_pincode || null;
    }

    // 3. Build columns and values for INSERT
    //    Only include fields that are present in the data
    const fieldsToSet = PERSONAL_FIELDS.filter(f => data[f] !== undefined);

    // Always include student_id and college_id
    const insertColumns = ['student_id', 'college_id', ...fieldsToSet];
    const insertValues = [studentId, collegeId, ...fieldsToSet.map(f => data[f])];
    const insertPlaceholders = insertValues.map((_, i) => `$${i + 1}`);

    // 4. Build the ON CONFLICT UPDATE SET clause
    //    Only update columns that were provided in the request
    const updateSetClauses = fieldsToSet
        .map(f => `${f} = EXCLUDED.${f}`)
        .concat(['updated_at = NOW()']);

    // 5. Execute upsert
    const result = await query(
        `INSERT INTO student_personal_information (${insertColumns.join(', ')})
         VALUES (${insertPlaceholders.join(', ')})
         ON CONFLICT (student_id)
         DO UPDATE SET ${updateSetClauses.join(', ')}
         RETURNING *,
           (xmax = 0) AS is_new`,
        insertValues
    );

    const record = result.rows[0];

    // 6. Determine if it was an insert or update (xmax = 0 means INSERT, >0 means UPDATE)
    const isNew = record.is_new;

    logger.info(`${LOG.AUTH} Student personal info ${isNew ? 'created' : 'updated'}`, {
        studentId,
        collegeId,
    });

    // 7. Return clean data (exclude internal id)
    return {
        is_new: isNew,
        personal_info: formatPersonalInfo(record),
    };
}

// ============================================================================
// 2. GET PERSONAL INFO
// ============================================================================

async function getPersonalInfo(studentId, collegeId) {
    const result = await query(
        `SELECT spi.*
         FROM student_personal_information spi
         WHERE spi.student_id = $1 AND spi.college_id = $2
         LIMIT 1`,
        [studentId, collegeId]
    );

    if (!result.rows.length) {
        // Return null instead of 404 — personal info may not be filled yet
        return null;
    }

    return formatPersonalInfo(result.rows[0]);
}

// ============================================================================
// HELPER — Format response (exclude internal fields)
// ============================================================================

function formatPersonalInfo(record) {
    // Remove internal DB fields from response
    const { id, ...rest } = record;
    return rest;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    savePersonalInfo,
    getPersonalInfo,
};
