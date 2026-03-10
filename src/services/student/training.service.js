/**
 * ============================================================================
 * STUDENT TRAINING SERVICE — Training Programs Business Logic (Student-Side)
 * ============================================================================
 *   - getAvailableTrainings(studentId, collegeId, filters)
 *   - enrollInTraining(programId, studentId, collegeId)
 *   - getEnrolledTrainings(studentId, collegeId, filters)
 *   - submitTrainingFeedback(enrollmentId, studentId, collegeId, data)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// ============================================================================
// 1. GET AVAILABLE TRAININGS
// ============================================================================
// Shows programs with status 'enrollment_open' that student hasn't enrolled in,
// that target the student's department and passout year (if targeting is set).

async function getAvailableTrainings(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    // Get student's dept and passout year for targeting checks
    const studentResult = await query(
        `SELECT dept_id, student_passout_year AS passout_year FROM students
         WHERE student_id = $1 AND college_id = $2`,
        [studentId, collegeId]
    );

    if (!studentResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const student = studentResult.rows[0];

    // Build WHERE clause
    const conditions = [
        'tp.college_id = $1',
        "tp.program_status = 'enrollment_open'",
        // Not already enrolled
        `NOT EXISTS (
            SELECT 1 FROM training_enrollments te
            WHERE te.program_id = tp.program_id AND te.student_id = $2
        )`,
        // Target dept: either no targeting (null) or student's dept is in the list
        `(tp.target_dept_ids IS NULL OR $3 = ANY(tp.target_dept_ids))`,
        // Target passout year: either no targeting (null) or matches student's year
        `(tp.target_passout_year IS NULL OR tp.target_passout_year = $4)`,
    ];
    const params = [collegeId, studentId, student.dept_id, student.passout_year];
    let paramIndex = 5;

    // Filter: program_type
    if (filters.program_type) {
        conditions.push(`tp.program_type = $${paramIndex}`);
        params.push(filters.program_type);
        paramIndex++;
    }

    // Filter: search (name, description, trainer)
    if (filters.search) {
        conditions.push(
            `(tp.program_name ILIKE $${paramIndex} OR tp.program_description ILIKE $${paramIndex} OR tp.trainer_name ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        program_name: 'tp.program_name',
        start_date: 'tp.start_date',
        end_date: 'tp.end_date',
        enrollment_deadline: 'tp.enrollment_deadline',
        created_at: 'tp.created_at',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.created_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count + fetch in parallel (both independent)
    const [countResult, programResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM training_programs tp WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT tp.*,
                    u.user_name AS created_by_name,
                    (SELECT COUNT(*) FROM training_enrollments te WHERE te.program_id = tp.program_id) AS enrolled_count
             FROM training_programs tp
             LEFT JOIN users u ON tp.created_by = u.user_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);
    const total = parseInt(countResult.rows[0].total, 10);

    const programs = programResult.rows.map(row => ({
        program_id: row.program_id,
        program_name: row.program_name,
        program_description: row.program_description || null,
        program_type: row.program_type || null,
        trainer_name: row.trainer_name || null,
        trainer_organization: row.trainer_organization || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        total_sessions: row.total_sessions || null,
        session_duration_hours: row.session_duration_hours ? parseFloat(row.session_duration_hours) : null,
        max_enrollment: row.max_enrollment || null,
        enrollment_deadline: row.enrollment_deadline || null,
        enrolled_count: parseInt(row.enrolled_count, 10),
        spots_remaining: row.max_enrollment
            ? Math.max(0, row.max_enrollment - parseInt(row.enrolled_count, 10))
            : null,
        is_deadline_passed: row.enrollment_deadline
            ? new Date(row.enrollment_deadline) < new Date()
            : false,
        created_by_name: row.created_by_name || null,
        created_at: row.created_at,
    }));

    return { programs, total, page, limit };
}

// ============================================================================
// 2. ENROLL IN TRAINING
// ============================================================================

async function enrollInTraining(programId, studentId, collegeId) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Lock & verify program exists, is open, and has capacity
        const programResult = await client.query(
            `SELECT tp.*,
                    (SELECT COUNT(*) FROM training_enrollments te WHERE te.program_id = tp.program_id) AS enrolled_count
             FROM training_programs tp
             WHERE tp.program_id = $1 AND tp.college_id = $2
             FOR UPDATE OF tp`,
            [programId, collegeId]
        );

        if (!programResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
        }

        const program = programResult.rows[0];

        // Must be enrollment_open
        if (program.program_status !== STATUS.TRAINING.ENROLLMENT_OPEN) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.ENROLLMENT_CLOSED),
                { status: 400 }
            );
        }

        // Check enrollment deadline
        if (program.enrollment_deadline && new Date(program.enrollment_deadline) < new Date()) {
            throw Object.assign(
                new Error('Enrollment deadline has passed for this program'),
                { status: 400 }
            );
        }

        // Check max enrollment capacity (atomic under row lock)
        const enrolledCount = parseInt(program.enrolled_count, 10);
        if (program.max_enrollment && enrolledCount >= program.max_enrollment) {
            throw Object.assign(
                new Error('This program has reached its maximum enrollment capacity'),
                { status: 400 }
            );
        }

        // Check student dept/year targeting
        const studentResult = await client.query(
            `SELECT dept_id, student_passout_year AS passout_year FROM students
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        );

        if (!studentResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
        }

        const student = studentResult.rows[0];

        if (program.target_dept_ids && program.target_dept_ids.length > 0) {
            if (!program.target_dept_ids.includes(student.dept_id)) {
                throw Object.assign(
                    new Error('This program is not available for your department'),
                    { status: 400 }
                );
            }
        }

        if (program.target_passout_year && program.target_passout_year !== student.passout_year) {
            throw Object.assign(
                new Error('This program is not available for your passout year'),
                { status: 400 }
            );
        }

        // Check if already enrolled (UNIQUE constraint will also catch this)
        const existingEnrollment = await client.query(
            `SELECT enrollment_id FROM training_enrollments
             WHERE program_id = $1 AND student_id = $2`,
            [programId, studentId]
        );

        if (existingEnrollment.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.ALREADY_ENROLLED),
                { status: 409 }
            );
        }

        // Insert enrollment
        const result = await client.query(
            `INSERT INTO training_enrollments (program_id, student_id, college_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [programId, studentId, collegeId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Student enrolled in training program`, {
            programId,
            studentId,
            programName: program.program_name,
            collegeId,
        });

        return {
            enrollment_id: result.rows[0].enrollment_id,
            program_id: result.rows[0].program_id,
            program_name: program.program_name,
            program_type: program.program_type,
            trainer_name: program.trainer_name || null,
            start_date: program.start_date || null,
            end_date: program.end_date || null,
            total_sessions: program.total_sessions || null,
            completion_status: result.rows[0].completion_status,
            enrolled_at: result.rows[0].enrolled_at,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 3. GET ENROLLED TRAININGS
// ============================================================================

async function getEnrolledTrainings(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['te.student_id = $1', 'te.college_id = $2'];
    const params = [studentId, collegeId];
    let paramIndex = 3;

    // Filter: completion_status
    if (filters.completion_status) {
        conditions.push(`te.completion_status = $${paramIndex}`);
        params.push(filters.completion_status);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        enrolled_at: 'te.enrolled_at',
        completion_percentage: 'te.completion_percentage',
        sessions_attended: 'te.sessions_attended',
        program_name: 'tp.program_name',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.enrolled_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count, fetch, and summary in parallel (all independent)
    const [countResult, enrollmentResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM training_enrollments te
             JOIN training_programs tp ON te.program_id = tp.program_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT te.*,
                    tp.program_name,
                    tp.program_description,
                    tp.program_type,
                    tp.trainer_name,
                    tp.trainer_organization,
                    tp.start_date,
                    tp.end_date,
                    tp.total_sessions,
                    tp.session_duration_hours,
                    tp.program_status
             FROM training_enrollments te
             JOIN training_programs tp ON te.program_id = tp.program_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT
                 COUNT(*) AS total_enrolled,
                 COUNT(*) FILTER (WHERE te.completion_status = 'enrolled') AS enrolled_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'in_progress') AS in_progress_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'completed') AS completed_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'dropped') AS dropped_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'failed') AS failed_count,
                 COUNT(*) FILTER (WHERE te.certificate_issued = true) AS certificates_earned
             FROM training_enrollments te
             WHERE te.student_id = $1 AND te.college_id = $2`,
            [studentId, collegeId]
        ),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const stats = summaryResult.rows[0];

    const enrollments = enrollmentResult.rows.map(row => ({
        enrollment_id: row.enrollment_id,
        program_id: row.program_id,
        program_name: row.program_name,
        program_description: row.program_description || null,
        program_type: row.program_type || null,
        program_status: row.program_status,
        trainer_name: row.trainer_name || null,
        trainer_organization: row.trainer_organization || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        total_sessions: row.total_sessions || null,
        session_duration_hours: row.session_duration_hours ? parseFloat(row.session_duration_hours) : null,
        enrolled_at: row.enrolled_at,
        sessions_attended: row.sessions_attended,
        completion_status: row.completion_status,
        completion_percentage: row.completion_percentage ? parseFloat(row.completion_percentage) : 0,
        certificate_issued: row.certificate_issued,
        certificate_url: row.certificate_url || null,
        student_feedback: row.student_feedback || null,
        student_rating: row.student_rating || null,
        completed_at: row.completed_at || null,
        // Computed
        has_submitted_feedback: !!(row.student_feedback || row.student_rating),
        attendance_percentage: row.total_sessions
            ? parseFloat(((row.sessions_attended / row.total_sessions) * 100).toFixed(1))
            : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }));

    return {
        enrollments,
        total,
        page,
        limit,
        summary: {
            total_enrolled: parseInt(stats.total_enrolled, 10),
            enrolled_count: parseInt(stats.enrolled_count, 10),
            in_progress_count: parseInt(stats.in_progress_count, 10),
            completed_count: parseInt(stats.completed_count, 10),
            dropped_count: parseInt(stats.dropped_count, 10),
            failed_count: parseInt(stats.failed_count, 10),
            certificates_earned: parseInt(stats.certificates_earned, 10),
        },
    };
}

// ============================================================================
// 4. SUBMIT TRAINING FEEDBACK
// ============================================================================

async function submitTrainingFeedback(enrollmentId, studentId, collegeId, data) {
    // Verify enrollment exists and belongs to this student
    const enrollmentResult = await query(
        `SELECT te.*, tp.program_name, tp.program_status
         FROM training_enrollments te
         JOIN training_programs tp ON te.program_id = tp.program_id
         WHERE te.enrollment_id = $1 AND te.student_id = $2 AND te.college_id = $3`,
        [enrollmentId, studentId, collegeId]
    );

    if (!enrollmentResult.rows.length) {
        throw Object.assign(new Error('Enrollment not found'), { status: 404 });
    }

    const enrollment = enrollmentResult.rows[0];

    // Cannot submit feedback for a program that hasn't started
    if (enrollment.program_status === STATUS.TRAINING.UPCOMING || enrollment.program_status === STATUS.TRAINING.ENROLLMENT_OPEN) {
        throw Object.assign(
            new Error('You can only submit feedback for programs that are in progress or completed'),
            { status: 400 }
        );
    }

    // Cannot submit if student dropped out
    if (enrollment.completion_status === 'dropped') {
        throw Object.assign(
            new Error('Cannot submit feedback for a program you dropped out of'),
            { status: 400 }
        );
    }

    // Check if already submitted feedback
    if (enrollment.student_feedback || enrollment.student_rating) {
        throw Object.assign(
            new Error('You have already submitted feedback for this program'),
            { status: 409 }
        );
    }

    // Update enrollment with feedback
    const result = await query(
        `UPDATE training_enrollments
         SET student_rating = $1,
             student_feedback = $2,
             updated_at = NOW()
         WHERE enrollment_id = $3
         RETURNING *`,
        [data.student_rating, data.student_feedback, enrollmentId]
    );

    logger.info(`${LOG.AUTH} Student submitted training feedback`, {
        enrollmentId,
        studentId,
        programName: enrollment.program_name,
        rating: data.student_rating,
        collegeId,
    });

    return {
        enrollment_id: result.rows[0].enrollment_id,
        program_id: result.rows[0].program_id,
        program_name: enrollment.program_name,
        student_rating: result.rows[0].student_rating,
        student_feedback: result.rows[0].student_feedback,
        completion_status: result.rows[0].completion_status,
        sessions_attended: result.rows[0].sessions_attended,
        completion_percentage: result.rows[0].completion_percentage
            ? parseFloat(result.rows[0].completion_percentage)
            : 0,
        updated_at: result.rows[0].updated_at,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getAvailableTrainings,
    enrollInTraining,
    getEnrolledTrainings,
    submitTrainingFeedback,
};
