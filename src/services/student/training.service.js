/**
 * ============================================================================
 * STUDENT TRAINING SERVICE — Training Programs Business Logic (Student-Side)
 * ============================================================================
 *   - getAvailableTrainings(studentId, collegeId, filters)
 *   - enrollInTraining(programId, studentId, collegeId)
 *   - getEnrolledTrainings(studentId, collegeId, filters)
 *   - submitTrainingFeedback(enrollmentId, studentId, collegeId, data)
 *   - updateTrainingFeedback(enrollmentId, studentId, collegeId, data)
 *   - withdrawFromTraining(programId, studentId, collegeId)
 *   - getMySessionSchedule(programId, studentId, collegeId)   [GAP-2]
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const { escapeILIKE } = require('../../utils/sqlHelper');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// ============================================================================
// EXPLICIT COLUMN LISTS (no SELECT * / RETURNING *)
// ============================================================================

const PROGRAM_SELECT_COLUMNS = `
    tp.program_id, tp.program_name, tp.program_description, tp.program_type,
    tp.trainer_name, tp.trainer_organization, tp.start_date, tp.end_date,
    tp.total_sessions, tp.session_duration_hours, tp.max_enrollment,
    tp.enrollment_deadline, tp.program_status, tp.allow_enrollments,
    tp.target_dept_ids,
    tp.target_passout_year, tp.program_fee, tp.fee_currency, tp.min_attendance_pct,
    tp.created_by, tp.created_at
`.replaceAll('\n', '');

const ENROLLMENT_SELECT_COLUMNS = `
    te.enrollment_id, te.program_id, te.student_id, te.college_id,
    te.enrolled_at, te.sessions_attended, te.completion_status,
    te.completion_percentage, te.certificate_issued, te.certificate_url,
    te.student_feedback, te.student_rating, te.completed_at,
    te.payment_status, te.amount_paid,
    te.created_at, te.updated_at
`.replaceAll('\n', '');

const ENROLLMENT_RETURNING_COLUMNS = `
    enrollment_id, program_id, student_id, college_id, enrolled_at,
    sessions_attended, completion_status, completion_percentage,
    certificate_issued, certificate_url, student_feedback, student_rating,
    completed_at, payment_status, amount_paid,
    created_at, updated_at
`.replaceAll('\n', '');

// ============================================================================
// 1. GET AVAILABLE TRAININGS
// ============================================================================
// Shows programs with allow_enrollments = true that student hasn't enrolled in,
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
        'tp.allow_enrollments = true',
        `tp.program_status NOT IN ('draft', 'cancelled', 'completed')`,
        // Not already enrolled (B14.2: ignore dropped enrollments — allows re-enroll)
        `NOT EXISTS (
            SELECT 1 FROM training_enrollments te
            WHERE te.program_id = tp.program_id AND te.student_id = $2
            AND te.completion_status != 'dropped'
        )`,
        // Target dept: either no targeting (null/empty) or student's dept is in the list (B14.9)
        `(tp.target_dept_ids IS NULL OR tp.target_dept_ids = '{}' OR $3 = ANY(tp.target_dept_ids))`,
        // Target passout year: either no targeting (null) or matches student's year
        `(tp.target_passout_year IS NULL OR tp.target_passout_year = $4)`,
        // B14.8: hide programs with expired enrollment deadline
        `(tp.enrollment_deadline IS NULL OR tp.enrollment_deadline >= CURRENT_DATE)`,
    ];
    const params = [collegeId, studentId, student.dept_id, student.passout_year];
    let paramIndex = 5;

    // Filter: program_type
    if (filters.program_type) {
        conditions.push(`tp.program_type = $${paramIndex}`);
        params.push(filters.program_type);
        paramIndex++;
    }

    // Filter: search (name, description, trainer) — GAP-5: escape ILIKE special chars
    if (filters.search) {
        conditions.push(
            `(tp.program_name ILIKE $${paramIndex} OR tp.program_description ILIKE $${paramIndex} OR tp.trainer_name ILIKE $${paramIndex})`
        );
        params.push(`%${escapeILIKE(filters.search)}%`);
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
            `SELECT ${PROGRAM_SELECT_COLUMNS},
                    u.user_name AS created_by_name,
                    COALESCE(ec.enrolled_count, 0) AS enrolled_count
             FROM training_programs tp
             LEFT JOIN users u ON tp.created_by = u.user_id
             LEFT JOIN (
                 SELECT program_id, COUNT(*) AS enrolled_count
                 FROM training_enrollments
                 WHERE completion_status NOT IN ('dropped', 'failed')
                 GROUP BY program_id
             ) ec ON tp.program_id = ec.program_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);
    const total = Number.parseInt(countResult.rows[0].total, 10);

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
        session_duration_hours: row.session_duration_hours ? Number.parseFloat(row.session_duration_hours) : null,
        max_enrollment: row.max_enrollment || null,
        enrollment_deadline: row.enrollment_deadline || null,
        program_fee: row.program_fee ? Number.parseFloat(row.program_fee) : 0,
        fee_currency: row.fee_currency || 'INR',
        min_attendance_pct: row.min_attendance_pct ? Number.parseFloat(row.min_attendance_pct) : 0,
        enrolled_count: Number.parseInt(row.enrolled_count, 10),
        spots_remaining: row.max_enrollment
            ? Math.max(0, row.max_enrollment - Number.parseInt(row.enrolled_count, 10))
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
// HELPERS — student enrollment eligibility checks
// ============================================================================

function validateStudentEligibility(program, student) {
    // B14.1: profile must be complete and approved
    if (!student.profile_complete) {
        throw Object.assign(new Error(ERROR_MESSAGES.PROFILE_NOT_COMPLETE_FOR_ENROLLMENT), { status: 400 });
    }
    if (!student.profile_is_approved) {
        throw Object.assign(new Error(ERROR_MESSAGES.PROFILE_NOT_APPROVED_FOR_ENROLLMENT), { status: 400 });
    }

    if (program.target_dept_ids && program.target_dept_ids.length > 0) {
        if (!program.target_dept_ids.includes(student.dept_id)) {
            throw Object.assign(new Error(ERROR_MESSAGES.DEPT_NOT_ELIGIBLE), { status: 400 });
        }
    }

    if (program.target_passout_year && program.target_passout_year !== student.passout_year) {
        throw Object.assign(new Error(ERROR_MESSAGES.YEAR_NOT_ELIGIBLE), { status: 400 });
    }
}

// ============================================================================
// 2. ENROLL IN TRAINING
// ============================================================================

async function enrollInTraining(programId, studentId, collegeId) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // 1. Lock & verify program exists, is open, has capacity, and deadline not passed (B14.10)
        const programResult = await client.query(
            `SELECT ${PROGRAM_SELECT_COLUMNS},
                    (SELECT COUNT(*) FROM training_enrollments te
                     WHERE te.program_id = tp.program_id
                     AND te.completion_status NOT IN ('dropped', 'failed')) AS enrolled_count
             FROM training_programs tp
             WHERE tp.program_id = $1 AND tp.college_id = $2
             AND (tp.enrollment_deadline IS NULL OR tp.enrollment_deadline >= CURRENT_DATE)
             FOR UPDATE OF tp`,
            [programId, collegeId]
        );

        if (!programResult.rows.length) {
            // Disambiguate: is the program missing, or is the deadline expired?
            const exists = await client.query(
                `SELECT enrollment_deadline FROM training_programs
                 WHERE program_id = $1 AND college_id = $2 LIMIT 1`,
                [programId, collegeId]
            );
            if (exists.rows.length) {
                throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_DEADLINE_PASSED), { status: 400 });
            }
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
        }

        const program = programResult.rows[0];

        // Must have enrollment access enabled
        if (!program.allow_enrollments) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_CLOSED), { status: 400 });
        }

        // Cannot enroll in draft, completed, or cancelled programs
        const blockedStatuses = [STATUS.TRAINING.DRAFT, STATUS.TRAINING.COMPLETED, STATUS.TRAINING.CANCELLED];
        if (blockedStatuses.includes(program.program_status)) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_CLOSED), { status: 400 });
        }

        // Check max enrollment capacity (atomic under row lock)
        const enrolledCount = Number.parseInt(program.enrolled_count, 10);
        if (program.max_enrollment && enrolledCount >= program.max_enrollment) {
            throw Object.assign(new Error(ERROR_MESSAGES.MAX_ENROLLMENT_REACHED), { status: 400 });
        }

        // Check student dept/year targeting + profile status (B14.1)
        const studentResult = await client.query(
            `SELECT dept_id, student_passout_year AS passout_year,
                    profile_complete, profile_is_approved
             FROM students
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        );

        if (!studentResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
        }

        validateStudentEligibility(program, studentResult.rows[0]);

        // B14.2: Check if already actively enrolled (allow re-enroll if previously dropped)
        const existingEnrollment = await client.query(
            `SELECT enrollment_id FROM training_enrollments
             WHERE program_id = $1 AND student_id = $2
             AND completion_status != 'dropped'`,
            [programId, studentId]
        );

        if (existingEnrollment.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.ALREADY_ENROLLED),
                { status: 409 }
            );
        }

        // B14.2: Delete any previous dropped enrollment so UNIQUE constraint allows re-insert
        await client.query(
            `DELETE FROM training_enrollments
             WHERE program_id = $1 AND student_id = $2 AND completion_status = 'dropped'`,
            [programId, studentId]
        );

        // Insert enrollment — auto-set payment_status based on program fee (A3)
        const enrollPaymentStatus = program.program_fee && Number.parseFloat(program.program_fee) > 0
            ? 'pending'
            : 'not_applicable';

        const result = await client.query(
            `INSERT INTO training_enrollments (program_id, student_id, college_id, payment_status)
             VALUES ($1, $2, $3, $4)
             RETURNING ${ENROLLMENT_RETURNING_COLUMNS}`,
            [programId, studentId, collegeId, enrollPaymentStatus]
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
            `SELECT ${ENROLLMENT_SELECT_COLUMNS},
                    tp.program_name,
                    tp.program_description,
                    tp.program_type,
                    tp.trainer_name,
                    tp.trainer_organization,
                    tp.start_date,
                    tp.end_date,
                    tp.total_sessions,
                    tp.session_duration_hours,
                    tp.program_status,
                    tp.program_fee,
                    tp.fee_currency,
                    tp.min_attendance_pct
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
                 COUNT(*) FILTER (WHERE te.completion_status = $3) AS enrolled_count,
                 COUNT(*) FILTER (WHERE te.completion_status = $4) AS in_progress_count,
                 COUNT(*) FILTER (WHERE te.completion_status = $5) AS completed_count,
                 COUNT(*) FILTER (WHERE te.completion_status = $6) AS dropped_count,
                 COUNT(*) FILTER (WHERE te.completion_status = $7) AS failed_count,
                 COUNT(*) FILTER (WHERE te.certificate_issued = true) AS certificates_earned
             FROM training_enrollments te
             WHERE te.student_id = $1 AND te.college_id = $2`,
            [studentId, collegeId,
             STATUS.ENROLLMENT.ENROLLED, STATUS.ENROLLMENT.IN_PROGRESS,
             STATUS.ENROLLMENT.COMPLETED, STATUS.ENROLLMENT.DROPPED,
             STATUS.ENROLLMENT.FAILED]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);
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
        session_duration_hours: row.session_duration_hours ? Number.parseFloat(row.session_duration_hours) : null,
        program_fee: row.program_fee ? Number.parseFloat(row.program_fee) : 0,
        fee_currency: row.fee_currency || 'INR',
        min_attendance_pct: row.min_attendance_pct ? Number.parseFloat(row.min_attendance_pct) : 0,
        enrolled_at: row.enrolled_at,
        sessions_attended: row.sessions_attended,
        completion_status: row.completion_status,
        completion_percentage: row.completion_percentage ? Number.parseFloat(row.completion_percentage) : 0,
        certificate_issued: row.certificate_issued,
        certificate_url: row.certificate_url || null,
        student_feedback: row.student_feedback || null,
        student_rating: row.student_rating || null,
        completed_at: row.completed_at || null,
        payment_status: row.payment_status || 'not_applicable',
        amount_paid: row.amount_paid ? Number.parseFloat(row.amount_paid) : 0,
        // Computed
        has_submitted_feedback: !!(row.student_feedback || row.student_rating),
        attendance_percentage: row.total_sessions
            ? Number.parseFloat(((row.sessions_attended / row.total_sessions) * 100).toFixed(1))
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
            total_enrolled: Number.parseInt(stats.total_enrolled, 10),
            enrolled_count: Number.parseInt(stats.enrolled_count, 10),
            in_progress_count: Number.parseInt(stats.in_progress_count, 10),
            completed_count: Number.parseInt(stats.completed_count, 10),
            dropped_count: Number.parseInt(stats.dropped_count, 10),
            failed_count: Number.parseInt(stats.failed_count, 10),
            certificates_earned: Number.parseInt(stats.certificates_earned, 10),
        },
    };
}

// ============================================================================
// 4. SUBMIT TRAINING FEEDBACK
// ============================================================================

async function submitTrainingFeedback(enrollmentId, studentId, collegeId, data) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock & verify enrollment exists and belongs to this student
        const enrollmentResult = await client.query(
            `SELECT ${ENROLLMENT_SELECT_COLUMNS}, tp.program_name, tp.program_status
             FROM training_enrollments te
             JOIN training_programs tp ON te.program_id = tp.program_id
             WHERE te.enrollment_id = $1 AND te.student_id = $2 AND te.college_id = $3
             FOR UPDATE OF te`,
            [enrollmentId, studentId, collegeId]
        );

        if (!enrollmentResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_NOT_FOUND), { status: 404 });
        }

        const enrollment = enrollmentResult.rows[0];

        // Cannot submit feedback for a program that hasn't started
        if (enrollment.program_status === STATUS.TRAINING.DRAFT || enrollment.program_status === STATUS.TRAINING.UPCOMING) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.TRAINING_FEEDBACK_NOT_STARTED),
                { status: 400 }
            );
        }

        // Cannot submit if student dropped out
        if (enrollment.completion_status === STATUS.ENROLLMENT.DROPPED) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.TRAINING_FEEDBACK_DROP_FORBIDDEN),
                { status: 400 }
            );
        }

        // B14.12: Must attend at least one session before submitting feedback
        if (enrollment.sessions_attended === 0) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.TRAINING_FEEDBACK_NO_SESSIONS),
                { status: 400 }
            );
        }

        // Check if already submitted feedback (atomic under row lock)
        if (enrollment.student_feedback || enrollment.student_rating) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.TRAINING_FEEDBACK_ALREADY_SUBMITTED),
                { status: 409 }
            );
        }

        // Update enrollment with feedback
        const result = await client.query(
            `UPDATE training_enrollments
             SET student_rating = $1,
                 student_feedback = $2,
                 updated_at = NOW()
             WHERE enrollment_id = $3
             RETURNING ${ENROLLMENT_RETURNING_COLUMNS}`,
            [data.student_rating, data.student_feedback, enrollmentId]
        );

        await client.query('COMMIT');

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
                ? Number.parseFloat(result.rows[0].completion_percentage)
                : 0,
            updated_at: result.rows[0].updated_at,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 5. UPDATE TRAINING FEEDBACK (B14.13)
// ============================================================================

async function updateTrainingFeedback(enrollmentId, studentId, collegeId, data) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock & verify enrollment exists and belongs to this student
        const enrollmentResult = await client.query(
            `SELECT ${ENROLLMENT_SELECT_COLUMNS}, tp.program_name, tp.program_status
             FROM training_enrollments te
             JOIN training_programs tp ON te.program_id = tp.program_id
             WHERE te.enrollment_id = $1 AND te.student_id = $2 AND te.college_id = $3
             FOR UPDATE OF te`,
            [enrollmentId, studentId, collegeId]
        );

        if (!enrollmentResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_NOT_FOUND), { status: 404 });
        }

        const enrollment = enrollmentResult.rows[0];

        // Must have existing feedback to update
        if (!enrollment.student_feedback && !enrollment.student_rating) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.TRAINING_FEEDBACK_NOT_SUBMITTED),
                { status: 400 }
            );
        }

        // Update feedback
        const result = await client.query(
            `UPDATE training_enrollments
             SET student_rating = $1,
                 student_feedback = $2,
                 updated_at = NOW()
             WHERE enrollment_id = $3
             RETURNING ${ENROLLMENT_RETURNING_COLUMNS}`,
            [data.student_rating, data.student_feedback, enrollmentId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Student updated training feedback`, {
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
                ? Number.parseFloat(result.rows[0].completion_percentage)
                : 0,
            updated_at: result.rows[0].updated_at,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 6. WITHDRAW FROM TRAINING (B14.15)
// ============================================================================

async function withdrawFromTraining(programId, studentId, collegeId) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock & verify enrollment exists for this student + program
        const enrollmentResult = await client.query(
            `SELECT te.enrollment_id, te.completion_status, tp.program_status, tp.program_name
             FROM training_enrollments te
             JOIN training_programs tp ON te.program_id = tp.program_id
             WHERE te.program_id = $1 AND te.student_id = $2 AND te.college_id = $3
             AND te.completion_status != 'dropped'
             FOR UPDATE OF te`,
            [programId, studentId, collegeId]
        );

        if (!enrollmentResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_NOT_FOUND), { status: 404 });
        }

        const enrollment = enrollmentResult.rows[0];

        // Can only withdraw from enrolled or in_progress
        if (enrollment.completion_status !== STATUS.ENROLLMENT.ENROLLED &&
            enrollment.completion_status !== STATUS.ENROLLMENT.IN_PROGRESS) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.WITHDRAW_NOT_ALLOWED),
                { status: 400 }
            );
        }

        // Cannot withdraw from a completed or cancelled program
        if (enrollment.program_status === STATUS.TRAINING.COMPLETED ||
            enrollment.program_status === STATUS.TRAINING.CANCELLED) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.WITHDRAW_PROGRAM_ENDED),
                { status: 400 }
            );
        }

        // Set status to dropped
        const result = await client.query(
            `UPDATE training_enrollments
             SET completion_status = 'dropped', updated_at = NOW()
             WHERE enrollment_id = $1
             RETURNING ${ENROLLMENT_RETURNING_COLUMNS}`,
            [enrollment.enrollment_id]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Student withdrew from training program`, {
            programId,
            studentId,
            programName: enrollment.program_name,
            collegeId,
        });

        return {
            enrollment_id: result.rows[0].enrollment_id,
            program_id: result.rows[0].program_id,
            program_name: enrollment.program_name,
            completion_status: result.rows[0].completion_status,
            updated_at: result.rows[0].updated_at,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 7. GET MY SESSION SCHEDULE (GAP-2)
// ============================================================================

async function getMySessionSchedule(programId, studentId, collegeId) {
    // Verify student has an active enrollment in this program
    const enrollmentCheck = await query(
        `SELECT enrollment_id, completion_status
         FROM training_enrollments
         WHERE program_id = $1 AND student_id = $2 AND college_id = $3
         AND completion_status NOT IN ('dropped', 'failed')`,
        [programId, studentId, collegeId]
    );

    if (!enrollmentCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_NOT_FOUND), { status: 404 });
    }

    const enrollment = enrollmentCheck.rows[0];

    // Get program info
    const programResult = await query(
        `SELECT program_name, total_sessions, program_status
         FROM training_programs
         WHERE program_id = $1 AND college_id = $2`,
        [programId, collegeId]
    );

    if (!programResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
    }

    const program = programResult.rows[0];

    // Fetch sessions with attendance for this enrollment
    const sessionsResult = await query(
        `SELECT ts.session_id, ts.session_number, ts.session_date,
                ts.session_topic, ts.venue,
                tsa.present, tsa.marked_at
         FROM training_sessions ts
         LEFT JOIN training_session_attendance tsa
             ON ts.session_id = tsa.session_id AND tsa.enrollment_id = $1
         WHERE ts.program_id = $2 AND ts.college_id = $3
         ORDER BY ts.session_number ASC`,
        [enrollment.enrollment_id, programId, collegeId]
    );

    const sessions = sessionsResult.rows.map(row => ({
        session_id: row.session_id,
        session_number: row.session_number,
        session_date: row.session_date || null,
        session_topic: row.session_topic || null,
        venue: row.venue || null,
        present: row.present ?? null,
        marked_at: row.marked_at || null,
    }));

    const attended = sessions.filter(s => s.present === true).length;
    const total = sessions.length;

    return {
        program_id: programId,
        program_name: program.program_name,
        program_status: program.program_status,
        total_sessions: program.total_sessions || total,
        enrollment_id: enrollment.enrollment_id,
        completion_status: enrollment.completion_status,
        sessions_attended: attended,
        attendance_percentage: (program.total_sessions || total) > 0
            ? Number.parseFloat(((attended / (program.total_sessions || total)) * 100).toFixed(1))
            : 0,
        sessions,
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
    updateTrainingFeedback,
    withdrawFromTraining,
    getMySessionSchedule,
};
