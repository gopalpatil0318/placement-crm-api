/**
 * ============================================================================
 * STUDENT SEMESTER GRADES SERVICE — Add, List, Update
 * ============================================================================
 * Functions:
 *   - addSemesterGrade(studentId, collegeId, deptId, data)
 *   - getAllSemesterGrades(studentId, collegeId, deptId)
 *   - updateSemesterGrade(gradeId, studentId, collegeId, data)
 *
 * Key validations:
 *   - semester_number <= department.total_semesters
 *   - UNIQUE(student_id, semester_number) prevents duplicate semesters
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    DB_ERROR_CODES,
} = require('../../config/constants');

// Explicit columns returned from all queries (excludes student_id, college_id, dept_id)
const RETURNING_COLUMNS = `grade_id, semester_number, academic_year, sgpa, cgpa,
    backlogs_in_semester, backlog_subjects, semester_status, created_at, updated_at`;

// Columns that can be updated (excludes grade_id, student_id, college_id, dept_id, semester_number)
const UPDATABLE_FIELDS = [
    'academic_year', 'sgpa', 'cgpa',
    'backlogs_in_semester', 'backlog_subjects', 'semester_status',
];

// ============================================================================
// 1. ADD SEMESTER GRADE
// ============================================================================

async function addSemesterGrade(studentId, collegeId, deptId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Get department's total_semesters to validate
        const deptResult = await client.query(
            `SELECT total_semesters FROM departments
             WHERE dept_id = $1 AND college_id = $2
             LIMIT 1`,
            [deptId, collegeId]
        );

        if (!deptResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.DEPARTMENT_NOT_FOUND), { status: 404 });
        }

        const totalSemesters = deptResult.rows[0].total_semesters;

        // 2. Validate semester_number does not exceed department limit
        if (data.semester_number > totalSemesters) {
            throw Object.assign(
                new Error(`Your department has only ${totalSemesters} semesters. Cannot add semester ${data.semester_number}`),
                { status: 400 }
            );
        }

        // 3. Insert the semester grade
        const result = await client.query(
            `INSERT INTO student_semester_grades
               (student_id, college_id, dept_id, semester_number,
                academic_year, sgpa, cgpa,
                backlogs_in_semester, backlog_subjects, semester_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING ${RETURNING_COLUMNS}`,
            [
                studentId, collegeId, deptId, data.semester_number,
                data.academic_year || null,
                data.sgpa != null ? data.sgpa : null,
                data.cgpa != null ? data.cgpa : null,
                data.backlogs_in_semester != null ? data.backlogs_in_semester : 0,
                data.backlog_subjects || [],
                data.semester_status || 'in_progress',
            ]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Semester ${data.semester_number} grade added`, {
            studentId,
            semester_number: data.semester_number,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        // Handle duplicate semester for same student
        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            throw Object.assign(
                new Error(`Semester ${data.semester_number} grade already exists. Use update instead`),
                { status: 409 }
            );
        }
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. GET ALL SEMESTER GRADES
// ============================================================================

async function getAllSemesterGrades(studentId, collegeId, deptId) {
    // Parallel: fetch grades + department total_semesters
    const [gradesResult, deptResult] = await Promise.all([
        query(
            `SELECT ${RETURNING_COLUMNS}
             FROM student_semester_grades
             WHERE student_id = $1 AND college_id = $2
             ORDER BY semester_number ASC`,
            [studentId, collegeId]
        ),
        query(
            `SELECT total_semesters FROM departments
             WHERE dept_id = $1 AND college_id = $2
             LIMIT 1`,
            [deptId, collegeId]
        ),
    ]);

    const totalSemesters = deptResult.rows[0]?.total_semesters || 8;

    return {
        total_semesters_in_dept: totalSemesters,
        completed_semesters: gradesResult.rows.length,
        grades: gradesResult.rows,
    };
}

// ============================================================================
// 3. UPDATE SEMESTER GRADE
// ============================================================================

async function updateSemesterGrade(gradeId, studentId, collegeId, data) {
    // 1. Build dynamic UPDATE query with only provided fields
    const fieldsToUpdate = UPDATABLE_FIELDS.filter(f => data[f] !== undefined);

    if (fieldsToUpdate.length === 0) {
        throw Object.assign(new Error('At least one field must be provided to update'), { status: 400 });
    }

    // Build SET clause: field1 = $3, field2 = $4, ...
    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 4}`)
        .concat(['updated_at = NOW()']);

    const values = [
        gradeId, studentId, collegeId,
        ...fieldsToUpdate.map(f => data[f]),
    ];

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 2. Update — WHERE ensures ownership (student_id + college_id + grade_id)
        const result = await client.query(
            `UPDATE student_semester_grades
             SET ${setClauses.join(', ')}
             WHERE grade_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING ${RETURNING_COLUMNS}`,
            values
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Semester grade not found or does not belong to you'),
                { status: 404 }
            );
        }

        // 3. Auto-reset profile approval when student updates semester grades
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

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Semester grade updated`, {
            gradeId,
            studentId,
            semester_number: result.rows[0].semester_number,
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
    addSemesterGrade,
    getAllSemesterGrades,
    updateSemesterGrade,
};
