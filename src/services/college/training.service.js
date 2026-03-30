/**
 * ============================================================================
 * TRAINING SERVICE — Training Program Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - createTrainingProgram(collegeId, userId, data)
 *   - getAllTrainingPrograms(collegeId, filters)
 *   - getTrainingProgramById(programId, collegeId)
 *   - updateTrainingProgram(programId, collegeId, data)
 *   - toggleTrainingStatus(programId, collegeId, newStatus)
 *   - getTrainingEnrollments(programId, collegeId, filters)
 *   - updateEnrollment(enrollmentId, collegeId, data)
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
// EXPLICIT COLUMN CONSTANTS (no SELECT * or RETURNING *)
// ============================================================================

const PROGRAM_SELECT_COLUMNS = [
    'tp.program_id', 'tp.college_id', 'tp.program_name', 'tp.program_description',
    'tp.program_type', 'tp.trainer_name', 'tp.trainer_organization',
    'tp.start_date', 'tp.end_date', 'tp.total_sessions', 'tp.session_duration_hours',
    'tp.target_dept_ids', 'tp.target_passout_year', 'tp.max_enrollment',
    'tp.enrollment_deadline', 'tp.program_status', 'tp.created_by',
    'tp.created_at', 'tp.updated_at',
].join(', ');

const PROGRAM_RETURNING_COLUMNS = [
    'program_id', 'college_id', 'program_name', 'program_description',
    'program_type', 'trainer_name', 'trainer_organization',
    'start_date', 'end_date', 'total_sessions', 'session_duration_hours',
    'target_dept_ids', 'target_passout_year', 'max_enrollment',
    'enrollment_deadline', 'program_status', 'created_by',
    'created_at', 'updated_at',
].join(', ');

const ENROLLMENT_SELECT_COLUMNS = [
    'te.enrollment_id', 'te.program_id', 'te.student_id', 'te.college_id',
    'te.enrolled_at', 'te.sessions_attended', 'te.completion_status',
    'te.completion_percentage', 'te.certificate_issued', 'te.certificate_url',
    'te.student_feedback', 'te.student_rating', 'te.completed_at',
    'te.created_at', 'te.updated_at',
].join(', ');

const ENROLLMENT_RETURNING_COLUMNS = [
    'enrollment_id', 'program_id', 'student_id', 'college_id',
    'enrolled_at', 'sessions_attended', 'completion_status',
    'completion_percentage', 'certificate_issued', 'certificate_url',
    'student_feedback', 'student_rating', 'completed_at',
    'created_at', 'updated_at',
].join(', ');

// Columns that can be inserted/updated
const PROGRAM_FIELDS = [
    'program_name',
    'program_description',
    'program_type',
    'trainer_name',
    'trainer_organization',
    'start_date',
    'end_date',
    'total_sessions',
    'session_duration_hours',
    'target_dept_ids',
    'target_passout_year',
    'max_enrollment',
    'enrollment_deadline',
    'program_status',
];

const ENROLLMENT_UPDATE_FIELDS = [
    'sessions_attended',
    'completion_status',
    'completion_percentage',
    'certificate_issued',
    'certificate_url',
];

// ============================================================================
// HELPER — Format program for API response
// ============================================================================

function formatProgram(record) {
    return {
        program_id: record.program_id,
        college_id: record.college_id,
        program_name: record.program_name,
        program_description: record.program_description || null,
        program_type: record.program_type || null,
        trainer_name: record.trainer_name || null,
        trainer_organization: record.trainer_organization || null,
        start_date: record.start_date || null,
        end_date: record.end_date || null,
        total_sessions: record.total_sessions || null,
        session_duration_hours: record.session_duration_hours ? Number.parseFloat(record.session_duration_hours) : null,
        target_dept_ids: record.target_dept_ids || null,
        target_passout_year: record.target_passout_year || null,
        max_enrollment: record.max_enrollment || null,
        enrollment_deadline: record.enrollment_deadline || null,
        program_status: record.program_status,
        created_by: record.created_by || null,
        created_by_name: record.created_by_name || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        // Aggregated fields (when available)
        ...(record.enrolled_count !== undefined && { enrolled_count: Number.parseInt(record.enrolled_count, 10) }),
        ...(record.completed_count !== undefined && { completed_count: Number.parseInt(record.completed_count, 10) }),
        ...(record.dropped_count !== undefined && { dropped_count: Number.parseInt(record.dropped_count, 10) }),
        ...(record.avg_rating !== undefined && { avg_rating: record.avg_rating ? Math.round(Number.parseFloat(record.avg_rating) * 10) / 10 : null }),
        // Department names (when joined)
        ...(record.target_dept_names !== undefined && { target_dept_names: record.target_dept_names }),
    };
}

function formatEnrollment(record) {
    return {
        enrollment_id: record.enrollment_id,
        program_id: record.program_id,
        student_id: record.student_id,
        student_name: record.student_name || null,
        student_email: record.student_email || null,
        dept_name: record.dept_name || null,
        passout_year: record.passout_year || null,
        enrolled_at: record.enrolled_at,
        sessions_attended: record.sessions_attended,
        completion_status: record.completion_status,
        completion_percentage: record.completion_percentage ? Number.parseFloat(record.completion_percentage) : 0,
        certificate_issued: record.certificate_issued,
        certificate_url: record.certificate_url || null,
        student_feedback: record.student_feedback || null,
        student_rating: record.student_rating || null,
        completed_at: record.completed_at || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
}

// ============================================================================
// HELPERS — shared validation logic
// ============================================================================

async function checkDuplicateName(client, collegeId, programName, excludeProgramId = null) {
    const params = [collegeId, programName];
    let sql = `SELECT program_id FROM training_programs
               WHERE college_id = $1 AND LOWER(program_name) = LOWER($2)`;
    if (excludeProgramId) {
        sql += ` AND program_id != $3`;
        params.push(excludeProgramId);
    }
    sql += ' LIMIT 1';
    const result = await client.query(sql, params);
    if (result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_DUPLICATE_NAME), { status: 409 });
    }
}

async function validateDeptIds(client, collegeId, deptIds) {
    if (!deptIds || deptIds.length === 0) return;
    const deptCheck = await client.query(
        `SELECT dept_id FROM departments WHERE college_id = $1 AND dept_id = ANY($2)`,
        [collegeId, deptIds]
    );
    if (deptCheck.rows.length !== deptIds.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_INVALID_DEPT_IDS), { status: 400 });
    }
}

// ============================================================================
// 1. CREATE TRAINING PROGRAM
// ============================================================================

async function createTrainingProgram(collegeId, userId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        await checkDuplicateName(client, collegeId, data.program_name);
        await validateDeptIds(client, collegeId, data.target_dept_ids);

        // Build dynamic INSERT from available fields
        const fieldsToInsert = PROGRAM_FIELDS.filter(f => data[f] !== undefined);
        const columns = ['college_id', 'created_by', ...fieldsToInsert];
        const placeholders = columns.map((_, i) => `$${i + 1}`);
        const values = [collegeId, userId, ...fieldsToInsert.map(f => data[f] ?? null)];

        const result = await client.query(
            `INSERT INTO training_programs (${columns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING ${PROGRAM_RETURNING_COLUMNS}`,
            values
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Training program created`, {
            programId: result.rows[0].program_id,
            programName: data.program_name,
            collegeId,
        });

        return formatProgram(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. GET ALL TRAINING PROGRAMS (with filters, sorting, pagination)
// ============================================================================

async function getAllTrainingPrograms(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['tp.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Filter: status
    if (filters.program_status) {
        conditions.push(`tp.program_status = $${paramIndex}`);
        params.push(filters.program_status);
        paramIndex++;
    }

    // Filter: type
    if (filters.program_type) {
        conditions.push(`tp.program_type = $${paramIndex}`);
        params.push(filters.program_type);
        paramIndex++;
    }

    // Filter: passout year
    if (filters.target_passout_year) {
        conditions.push(`tp.target_passout_year = $${paramIndex}`);
        params.push(filters.target_passout_year);
        paramIndex++;
    }

    // Filter: search (name, description, trainer)
    if (filters.search?.trim()) {
        conditions.push(
            `(tp.program_name ILIKE $${paramIndex} OR tp.program_description ILIKE $${paramIndex} OR tp.trainer_name ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search.trim()}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Allowed sort columns (whitelist)
    const SORTABLE_COLUMNS = {
        program_name: 'tp.program_name',
        created_at: 'tp.created_at',
        start_date: 'tp.start_date',
        end_date: 'tp.end_date',
        program_type: 'tp.program_type',
        program_status: 'tp.program_status',
    };
    const sortColumn = SORTABLE_COLUMNS[filters.sort_by] || 'tp.created_at';
    const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count and fetch in parallel, using LEFT JOIN aggregate instead of correlated subqueries
    const [countResult, programResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM training_programs tp WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT ${PROGRAM_SELECT_COLUMNS},
                    u.user_name AS created_by_name,
                    COALESCE(es.enrolled_count, 0) AS enrolled_count,
                    COALESCE(es.completed_count, 0) AS completed_count,
                    COALESCE(es.dropped_count, 0) AS dropped_count,
                    es.avg_rating
             FROM training_programs tp
             LEFT JOIN users u ON tp.created_by = u.user_id
             LEFT JOIN (
                 SELECT
                     te.program_id,
                     COUNT(*) AS enrolled_count,
                     COUNT(*) FILTER (WHERE te.completion_status = 'completed') AS completed_count,
                     COUNT(*) FILTER (WHERE te.completion_status = 'dropped') AS dropped_count,
                     AVG(te.student_rating) AS avg_rating
                 FROM training_enrollments te
                 GROUP BY te.program_id
             ) es ON es.program_id = tp.program_id
             WHERE ${whereClause}
             ORDER BY ${sortColumn} ${sortOrder}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    return {
        programs: programResult.rows.map(formatProgram),
        total,
        page,
        limit,
    };
}

// ============================================================================
// 3. GET TRAINING PROGRAM BY ID (with enrollment stats + dept names)
// ============================================================================

async function getTrainingProgramById(programId, collegeId) {
    const programResult = await query(
        `SELECT ${PROGRAM_SELECT_COLUMNS},
                u.user_name AS created_by_name,
                COALESCE(es.enrolled_count, 0) AS enrolled_count,
                COALESCE(es.completed_count, 0) AS completed_count,
                COALESCE(es.dropped_count, 0) AS dropped_count,
                COALESCE(es.in_progress_count, 0) AS in_progress_count,
                COALESCE(es.failed_count, 0) AS failed_count,
                es.avg_rating,
                es.avg_completion_percentage,
                es.avg_sessions_attended
         FROM training_programs tp
         LEFT JOIN users u ON tp.created_by = u.user_id
         LEFT JOIN (
             SELECT
                 te.program_id,
                 COUNT(*) AS enrolled_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'completed') AS completed_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'dropped') AS dropped_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'in_progress') AS in_progress_count,
                 COUNT(*) FILTER (WHERE te.completion_status = 'failed') AS failed_count,
                 AVG(te.student_rating) AS avg_rating,
                 AVG(te.completion_percentage) AS avg_completion_percentage,
                 AVG(te.sessions_attended) AS avg_sessions_attended
             FROM training_enrollments te
             WHERE te.program_id = $1
             GROUP BY te.program_id
         ) es ON es.program_id = tp.program_id
         WHERE tp.program_id = $1 AND tp.college_id = $2
         LIMIT 1`,
        [programId, collegeId]
    );

    if (!programResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
    }

    const program = programResult.rows[0];

    // Resolve department names if target_dept_ids exists
    let targetDeptNames = null;
    if (program.target_dept_ids && program.target_dept_ids.length > 0) {
        const deptResult = await query(
            `SELECT dept_id, dept_name FROM departments
             WHERE dept_id = ANY($1) AND college_id = $2
             ORDER BY dept_name ASC`,
            [program.target_dept_ids, collegeId]
        );
        targetDeptNames = deptResult.rows.map(d => ({ dept_id: d.dept_id, dept_name: d.dept_name }));
    }

    const formatted = formatProgram(program);

    return {
        ...formatted,
        target_dept_names: targetDeptNames,
        enrollment_stats: {
            enrolled_count: Number.parseInt(program.enrolled_count, 10),
            completed_count: Number.parseInt(program.completed_count, 10),
            in_progress_count: Number.parseInt(program.in_progress_count, 10),
            dropped_count: Number.parseInt(program.dropped_count, 10),
            failed_count: Number.parseInt(program.failed_count, 10),
            avg_rating: program.avg_rating ? Math.round(Number.parseFloat(program.avg_rating) * 10) / 10 : null,
            avg_completion_percentage: program.avg_completion_percentage
                ? Math.round(Number.parseFloat(program.avg_completion_percentage) * 10) / 10
                : null,
            avg_sessions_attended: program.avg_sessions_attended
                ? Math.round(Number.parseFloat(program.avg_sessions_attended) * 10) / 10
                : null,
        },
    };
}

// ============================================================================
// 4. UPDATE TRAINING PROGRAM
// ============================================================================

async function updateTrainingProgram(programId, collegeId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Verify program exists and belongs to this college
        const existing = await client.query(
            `SELECT program_id, program_status FROM training_programs
             WHERE program_id = $1 AND college_id = $2
             LIMIT 1`,
            [programId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
        }

        // Cannot update a cancelled program
        if (existing.rows[0].program_status === STATUS.TRAINING.CANCELLED) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_CANCELLED_NOT_UPDATABLE), { status: 400 });
        }

        // Check duplicate name (if updating name)
        if (data.program_name) {
            await checkDuplicateName(client, collegeId, data.program_name, programId);
        }

        // Validate date ordering if both dates provided
        if (data.start_date && data.end_date) {
            if (new Date(data.end_date) < new Date(data.start_date)) {
                throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_END_BEFORE_START), { status: 400 });
            }
        }

        // Validate target_dept_ids if provided
        await validateDeptIds(client, collegeId, data.target_dept_ids);

        // Build dynamic SET clause (excludes program_status — use toggle for status)
        const updateableFields = PROGRAM_FIELDS.filter(f => f !== 'program_status');
        const fieldsToUpdate = updateableFields.filter(f => data[f] !== undefined);

        if (!fieldsToUpdate.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NO_FIELDS), { status: 400 });
        }

        const setClauses = fieldsToUpdate.map((f, i) => `${f} = $${i + 3}`);
        const values = [programId, collegeId, ...fieldsToUpdate.map(f => data[f] ?? null)];

        const result = await client.query(
            `UPDATE training_programs
             SET ${setClauses.join(', ')}, updated_at = NOW()
             WHERE program_id = $1 AND college_id = $2
             RETURNING ${PROGRAM_RETURNING_COLUMNS}`,
            values
        );

        await client.query('COMMIT');
        return formatProgram(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 5. TOGGLE TRAINING STATUS
// ============================================================================

async function toggleTrainingStatus(programId, collegeId, newStatus) {
    // Verify program exists
    const existing = await query(
        `SELECT program_id, program_status
         FROM training_programs
         WHERE program_id = $1 AND college_id = $2
         LIMIT 1`,
        [programId, collegeId]
    );

    if (!existing.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
    }

    const current = existing.rows[0];
    const currentStatus = current.program_status;

    // Validate status transition
    const VALID_TRANSITIONS = {
        [STATUS.TRAINING.UPCOMING]: [STATUS.TRAINING.ENROLLMENT_OPEN, STATUS.TRAINING.CANCELLED],
        [STATUS.TRAINING.ENROLLMENT_OPEN]: [STATUS.TRAINING.IN_PROGRESS, STATUS.TRAINING.CANCELLED],
        [STATUS.TRAINING.IN_PROGRESS]: [STATUS.TRAINING.COMPLETED, STATUS.TRAINING.CANCELLED],
        [STATUS.TRAINING.COMPLETED]: [], // Terminal state
        [STATUS.TRAINING.CANCELLED]: [STATUS.TRAINING.UPCOMING], // Can reopen
    };

    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.TRAINING_INVALID_TRANSITION),
            { status: 400 }
        );
    }

    const result = await query(
        `UPDATE training_programs
         SET program_status = $3, updated_at = NOW()
         WHERE program_id = $1 AND college_id = $2
         RETURNING ${PROGRAM_RETURNING_COLUMNS}`,
        [programId, collegeId, newStatus]
    );

    return formatProgram(result.rows[0]);
}

// ============================================================================
// 6. GET TRAINING ENROLLMENTS (for a specific program)
// ============================================================================

async function getTrainingEnrollments(programId, collegeId, filters = {}) {
    // Verify program exists and belongs to this college
    const programCheck = await query(
        `SELECT program_id, program_name, total_sessions FROM training_programs
         WHERE program_id = $1 AND college_id = $2
         LIMIT 1`,
        [programId, collegeId]
    );

    if (!programCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
    }

    const { page, limit, offset } = getPagination(filters);

    const conditions = ['te.program_id = $1', 'te.college_id = $2'];
    const params = [programId, collegeId];
    let paramIndex = 3;

    // Filter: completion_status
    if (filters.completion_status) {
        conditions.push(`te.completion_status = $${paramIndex}`);
        params.push(filters.completion_status);
        paramIndex++;
    }

    // Filter: search (student name or email)
    if (filters.search?.trim()) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.student_email ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search.trim()}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Allowed sort columns (whitelist)
    const SORTABLE_COLUMNS = {
        enrolled_at: 'te.enrolled_at',
        sessions_attended: 'te.sessions_attended',
        completion_percentage: 'te.completion_percentage',
        student_name: 's.first_name',
        student_rating: 'te.student_rating',
    };
    const sortColumn = SORTABLE_COLUMNS[filters.sort_by] || 'te.enrolled_at';
    const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Run count, fetch, and summary in parallel (all independent)
    const [countResult, enrollmentResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM training_enrollments te
             JOIN students s ON te.student_id = s.student_id
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT ${ENROLLMENT_SELECT_COLUMNS},
                    CONCAT(s.first_name, ' ', s.last_name) AS student_name,
                    s.student_email,
                    d.dept_name,
                    s.student_passout_year AS passout_year
             FROM training_enrollments te
             JOIN students s ON te.student_id = s.student_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY ${sortColumn} ${sortOrder}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT
                 COUNT(*) AS total_enrolled,
                 COUNT(*) FILTER (WHERE completion_status = 'enrolled') AS enrolled_count,
                 COUNT(*) FILTER (WHERE completion_status = 'in_progress') AS in_progress_count,
                 COUNT(*) FILTER (WHERE completion_status = 'completed') AS completed_count,
                 COUNT(*) FILTER (WHERE completion_status = 'dropped') AS dropped_count,
                 COUNT(*) FILTER (WHERE completion_status = 'failed') AS failed_count,
                 AVG(completion_percentage) AS avg_completion,
                 AVG(sessions_attended) AS avg_sessions,
                 AVG(student_rating) AS avg_rating
             FROM training_enrollments
             WHERE program_id = $1 AND college_id = $2`,
            [programId, collegeId]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    const summary = summaryResult.rows[0];

    return {
        program: {
            program_id: programCheck.rows[0].program_id,
            program_name: programCheck.rows[0].program_name,
            total_sessions: programCheck.rows[0].total_sessions,
        },
        enrollments: enrollmentResult.rows.map(formatEnrollment),
        summary: {
            total_enrolled: Number.parseInt(summary.total_enrolled, 10),
            enrolled_count: Number.parseInt(summary.enrolled_count, 10),
            in_progress_count: Number.parseInt(summary.in_progress_count, 10),
            completed_count: Number.parseInt(summary.completed_count, 10),
            dropped_count: Number.parseInt(summary.dropped_count, 10),
            failed_count: Number.parseInt(summary.failed_count, 10),
            avg_completion: summary.avg_completion ? Math.round(Number.parseFloat(summary.avg_completion) * 10) / 10 : 0,
            avg_sessions: summary.avg_sessions ? Math.round(Number.parseFloat(summary.avg_sessions) * 10) / 10 : 0,
            avg_rating: summary.avg_rating ? Math.round(Number.parseFloat(summary.avg_rating) * 10) / 10 : null,
        },
        total,
        page,
        limit,
    };
}

// ============================================================================
// 7. UPDATE ENROLLMENT
// ============================================================================

async function updateEnrollment(enrollmentId, collegeId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Verify enrollment exists and belongs to this college
        const existing = await client.query(
            `SELECT ${ENROLLMENT_SELECT_COLUMNS}, tp.total_sessions, tp.program_status
             FROM training_enrollments te
             JOIN training_programs tp ON te.program_id = tp.program_id
             WHERE te.enrollment_id = $1 AND te.college_id = $2`,
            [enrollmentId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_NOT_FOUND), { status: 404 });
        }

        const enrollment = existing.rows[0];

        // Cannot update enrollment if program is cancelled
        if (enrollment.program_status === STATUS.TRAINING.CANCELLED) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_CANCELLED_PROGRAM), { status: 400 });
        }

        // Validate sessions_attended does not exceed total_sessions
        if (data.sessions_attended !== undefined && enrollment.total_sessions) {
            if (data.sessions_attended > enrollment.total_sessions) {
                throw Object.assign(
                    new Error(`${ERROR_MESSAGES.ENROLLMENT_SESSIONS_EXCEED} (${enrollment.total_sessions})`),
                    { status: 400 }
                );
            }
        }

        // If marking as completed, set completed_at
        const fieldsToUpdate = ENROLLMENT_UPDATE_FIELDS.filter(f => data[f] !== undefined);

        if (!fieldsToUpdate.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NO_FIELDS), { status: 400 });
        }

        // Build dynamic SET clause
        const setClauses = fieldsToUpdate.map((f, i) => `${f} = $${i + 3}`);
        const values = [enrollmentId, collegeId, ...fieldsToUpdate.map(f => data[f] ?? null)];

        // Auto-set completed_at when status changes to completed
        if (data.completion_status === STATUS.ENROLLMENT.COMPLETED && enrollment.completion_status !== STATUS.ENROLLMENT.COMPLETED) {
            setClauses.push('completed_at = NOW()');
        }

        // Auto-clear completed_at if status changed away from completed
        if (data.completion_status && data.completion_status !== STATUS.ENROLLMENT.COMPLETED && enrollment.completion_status === STATUS.ENROLLMENT.COMPLETED) {
            setClauses.push('completed_at = NULL');
        }

        await client.query(
            `UPDATE training_enrollments
             SET ${setClauses.join(', ')}, updated_at = NOW()
             WHERE enrollment_id = $1 AND college_id = $2
             RETURNING ${ENROLLMENT_RETURNING_COLUMNS}`,
            values
        );

        // Fetch student details for response
        const enriched = await client.query(
            `SELECT ${ENROLLMENT_SELECT_COLUMNS},
                    CONCAT(s.first_name, ' ', s.last_name) AS student_name,
                    s.student_email,
                    d.dept_name,
                    s.student_passout_year AS passout_year
             FROM training_enrollments te
             JOIN students s ON te.student_id = s.student_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE te.enrollment_id = $1`,
            [enrollmentId]
        );

        await client.query('COMMIT');
        return formatEnrollment(enriched.rows[0]);
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
    createTrainingProgram,
    getAllTrainingPrograms,
    getTrainingProgramById,
    updateTrainingProgram,
    toggleTrainingStatus,
    getTrainingEnrollments,
    updateEnrollment,
};
