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
 *   - bulkUpdateEnrollments(programId, collegeId, updates)      [MF3]
 *   - getStudentTrainingReport(studentId, collegeId)            [GAP-1]
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
    ENROLLMENT_VALID_TRANSITIONS,
} = require('../../config/constants');

// ============================================================================
// EXPLICIT COLUMN CONSTANTS (no SELECT * or RETURNING *)
// ============================================================================

const PROGRAM_SELECT_COLUMNS = [
    'tp.program_id', 'tp.college_id', 'tp.program_name', 'tp.program_description',
    'tp.program_type', 'tp.trainer_name', 'tp.trainer_organization',
    'tp.start_date', 'tp.end_date', 'tp.total_sessions', 'tp.session_duration_hours',
    'tp.target_dept_ids', 'tp.target_passout_year', 'tp.max_enrollment',
    'tp.enrollment_deadline', 'tp.program_status', 'tp.allow_enrollments',
    'tp.program_fee', 'tp.fee_currency',
    'tp.min_attendance_pct', 'tp.created_by', 'tp.created_at', 'tp.updated_at',
].join(', ');

const PROGRAM_RETURNING_COLUMNS = [
    'program_id', 'college_id', 'program_name', 'program_description',
    'program_type', 'trainer_name', 'trainer_organization',
    'start_date', 'end_date', 'total_sessions', 'session_duration_hours',
    'target_dept_ids', 'target_passout_year', 'max_enrollment',
    'enrollment_deadline', 'program_status', 'allow_enrollments',
    'program_fee', 'fee_currency',
    'min_attendance_pct', 'created_by', 'created_at', 'updated_at',
].join(', ');

const ENROLLMENT_SELECT_COLUMNS = [
    'te.enrollment_id', 'te.program_id', 'te.student_id', 'te.college_id',
    'te.enrolled_at', 'te.sessions_attended', 'te.completion_status',
    'te.completion_percentage', 'te.certificate_issued', 'te.certificate_url',
    'te.student_feedback', 'te.student_rating', 'te.completed_at',
    'te.payment_status', 'te.amount_paid',
    'te.created_at', 'te.updated_at',
].join(', ');

const ENROLLMENT_RETURNING_COLUMNS = [
    'enrollment_id', 'program_id', 'student_id', 'college_id',
    'enrolled_at', 'sessions_attended', 'completion_status',
    'completion_percentage', 'certificate_issued', 'certificate_url',
    'student_feedback', 'student_rating', 'completed_at',
    'payment_status', 'amount_paid',
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
    'program_fee',
    'fee_currency',
    'min_attendance_pct',
];

const ENROLLMENT_UPDATE_FIELDS = [
    'completion_status',
    'certificate_issued',
    'certificate_url',
    'payment_status',
    'amount_paid',
];

// ============================================================================
// HELPER — Convert date to yyyy-MM-dd string (pg returns Date objects for DATE columns)
// ============================================================================

function toDateString(val) {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString().split('T')[0];
    if (typeof val === 'string' && val.includes('T')) return val.split('T')[0];
    return val;
}

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
        start_date: toDateString(record.start_date),
        end_date: toDateString(record.end_date),
        total_sessions: record.total_sessions || null,
        session_duration_hours: record.session_duration_hours ? Number.parseFloat(record.session_duration_hours) : null,
        target_dept_ids: record.target_dept_ids || null,
        target_passout_year: record.target_passout_year || null,
        max_enrollment: record.max_enrollment || null,
        enrollment_deadline: toDateString(record.enrollment_deadline),
        program_status: record.program_status,
        allow_enrollments: record.allow_enrollments ?? false,
        program_fee: record.program_fee ? Number.parseFloat(record.program_fee) : 0,
        fee_currency: record.fee_currency || 'INR',
        min_attendance_pct: record.min_attendance_pct ? Number.parseFloat(record.min_attendance_pct) : 0,
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
        payment_status: record.payment_status || 'not_applicable',
        amount_paid: record.amount_paid ? Number.parseFloat(record.amount_paid) : 0,
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

    // Filter: search (name, description, trainer) — GAP-5: escape ILIKE special chars
    if (filters.search?.trim()) {
        conditions.push(
            `(tp.program_name ILIKE $${paramIndex} OR tp.program_description ILIKE $${paramIndex} OR tp.trainer_name ILIKE $${paramIndex})`
        );
        params.push(`%${escapeILIKE(filters.search.trim())}%`);
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
                     COUNT(*) FILTER (WHERE te.completion_status NOT IN ('dropped', 'failed')) AS enrolled_count,
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
                 COUNT(*) FILTER (WHERE te.completion_status NOT IN ('dropped', 'failed')) AS enrolled_count,
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

        // Verify program exists and belongs to this college (B14.11: fetch dates for cross-validation)
        // A1: FOR UPDATE prevents lost-update anomaly under concurrent edits
        const existing = await client.query(
            `SELECT ${PROGRAM_SELECT_COLUMNS}
             FROM training_programs tp
             WHERE program_id = $1 AND college_id = $2
             FOR UPDATE
             LIMIT 1`,
            [programId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
        }

        const existingProgram = existing.rows[0];

        // Cannot update a cancelled program
        if (existingProgram.program_status === STATUS.TRAINING.CANCELLED) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_CANCELLED_NOT_UPDATABLE), { status: 400 });
        }

        // Check duplicate name (if updating name)
        if (data.program_name) {
            await checkDuplicateName(client, collegeId, data.program_name, programId);
        }

        // B14.11: Validate date ordering — cross-reference existing dates when only one is provided
        {
            const effectiveStart = data.start_date === undefined ? existingProgram.start_date : data.start_date;
            const effectiveEnd = data.end_date === undefined ? existingProgram.end_date : data.end_date;
            if (effectiveStart && effectiveEnd && new Date(effectiveEnd) < new Date(effectiveStart)) {
                throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_END_BEFORE_START), { status: 400 });
            }
        }

        // B14.14: When updating max_enrollment, ensure new max >= current active enrollments
        if (data.max_enrollment !== undefined && data.max_enrollment !== null) {
            const countResult = await client.query(
                `SELECT COUNT(*) FILTER (WHERE completion_status NOT IN ('dropped', 'failed')) AS active_count
                 FROM training_enrollments
                 WHERE program_id = $1`,
                [programId]
            );
            const activeCount = Number.parseInt(countResult.rows[0].active_count, 10);
            if (data.max_enrollment < activeCount) {
                throw Object.assign(
                    new Error(ERROR_MESSAGES.ENROLLMENT_MAX_BELOW_CURRENT),
                    { status: 400 }
                );
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

        // Capture old values for audit (only changed fields)
        const oldSnapshot = {};
        for (const f of fieldsToUpdate) {
            oldSnapshot[f] = existingProgram[f] ?? null;
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
        const formatted = formatProgram(result.rows[0]);
        formatted._old = oldSnapshot;
        return formatted;
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
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock & verify program exists
        const existing = await client.query(
            `SELECT program_id, program_status, allow_enrollments
             FROM training_programs
             WHERE program_id = $1 AND college_id = $2
             FOR UPDATE`,
            [programId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
        }

        const current = existing.rows[0];
        const currentStatus = current.program_status;

        // Validate status transition (new state machine — no enrollment_open)
        const VALID_TRANSITIONS = {
            [STATUS.TRAINING.DRAFT]: [STATUS.TRAINING.UPCOMING, STATUS.TRAINING.CANCELLED],
            [STATUS.TRAINING.UPCOMING]: [STATUS.TRAINING.IN_PROGRESS, STATUS.TRAINING.ON_HOLD, STATUS.TRAINING.CANCELLED],
            [STATUS.TRAINING.IN_PROGRESS]: [STATUS.TRAINING.ON_HOLD, STATUS.TRAINING.COMPLETED, STATUS.TRAINING.CANCELLED],
            [STATUS.TRAINING.ON_HOLD]: [STATUS.TRAINING.IN_PROGRESS, STATUS.TRAINING.CANCELLED],
            [STATUS.TRAINING.COMPLETED]: [STATUS.TRAINING.IN_PROGRESS], // Can resume for extra sessions
            [STATUS.TRAINING.CANCELLED]: [STATUS.TRAINING.DRAFT], // Can reopen as draft
        };

        const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
        if (!allowedTransitions.includes(newStatus)) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.TRAINING_INVALID_TRANSITION),
                { status: 400 }
            );
        }

        // B14.3: When cancelling, cascade — drop all active enrollments + close enrollment
        let droppedCount = 0;
        let enrollmentsPromoted = 0;
        if (newStatus === STATUS.TRAINING.CANCELLED) {
            const cascadeResult = await client.query(
                `UPDATE training_enrollments
                 SET completion_status = 'dropped', updated_at = NOW()
                 WHERE program_id = $1 AND completion_status IN ('enrolled', 'in_progress')`,
                [programId]
            );
            droppedCount = cascadeResult.rowCount;
        }

        // Auto-cascade: when program moves to in_progress, promote all 'enrolled' → 'in_progress'
        if (newStatus === STATUS.TRAINING.IN_PROGRESS) {
            const promoteResult = await client.query(
                `UPDATE training_enrollments
                 SET completion_status = 'in_progress', updated_at = NOW()
                 WHERE program_id = $1 AND completion_status = 'enrolled'`,
                [programId]
            );
            enrollmentsPromoted = promoteResult.rowCount;
        }

        // Auto-close enrollment access when moving to completed/cancelled/on_hold
        const closeEnrollmentStatuses = [STATUS.TRAINING.COMPLETED, STATUS.TRAINING.CANCELLED, STATUS.TRAINING.ON_HOLD];
        const forceCloseEnrollment = closeEnrollmentStatuses.includes(newStatus);

        const result = await client.query(
            `UPDATE training_programs
             SET program_status = $3,
                 ${forceCloseEnrollment ? 'allow_enrollments = false,' : ''}
                 updated_at = NOW()
             WHERE program_id = $1 AND college_id = $2
             RETURNING ${PROGRAM_RETURNING_COLUMNS}, allow_enrollments`,
            [programId, collegeId, newStatus]
        );

        await client.query('COMMIT');

        return {
            ...formatProgram(result.rows[0]),
            _previousStatus: currentStatus,
            ...(droppedCount > 0 && { enrollments_dropped: droppedCount }),
            ...(enrollmentsPromoted > 0 && { enrollments_promoted: enrollmentsPromoted }),
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 5b. TOGGLE ENROLLMENT ACCESS (independent of program status)
// ============================================================================

async function toggleEnrollmentAccess(programId, collegeId, allowEnrollments) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT program_id, program_status, allow_enrollments
             FROM training_programs
             WHERE program_id = $1 AND college_id = $2
             FOR UPDATE`,
            [programId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
        }

        const program = existing.rows[0];

        // Cannot open enrollments for draft, completed, or cancelled programs
        const blockedStatuses = [STATUS.TRAINING.DRAFT, STATUS.TRAINING.COMPLETED, STATUS.TRAINING.CANCELLED];
        if (allowEnrollments && blockedStatuses.includes(program.program_status)) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.TRAINING_ENROLLMENT_ACCESS_INVALID),
                { status: 400 }
            );
        }

        const result = await client.query(
            `UPDATE training_programs
             SET allow_enrollments = $3, updated_at = NOW()
             WHERE program_id = $1 AND college_id = $2
             RETURNING ${PROGRAM_RETURNING_COLUMNS}, allow_enrollments`,
            [programId, collegeId, allowEnrollments]
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

    // Filter: search (student name or email) — GAP-5: escape ILIKE special chars
    if (filters.search?.trim()) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.student_email ILIKE $${paramIndex})`
        );
        params.push(`%${escapeILIKE(filters.search.trim())}%`);
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
// HELPERS — enrollment update validation & SET clause builder
// ============================================================================

function checkMinAttendancePct(enrollment, data) {
    const minPct = enrollment.min_attendance_pct ? Number.parseFloat(enrollment.min_attendance_pct) : 0;
    if (minPct <= 0) return;

    const currentPct = data.completion_percentage === undefined
        ? Number.parseFloat(enrollment.completion_percentage || 0)
        : data.completion_percentage;
    if (currentPct < minPct) {
        throw Object.assign(
            new Error(`Cannot mark as completed — attendance is ${currentPct}% but minimum required is ${minPct}%`),
            { status: 400 }
        );
    }
}

function validateEnrollmentUpdate(enrollment, data) {
    // Cannot update enrollment if program is cancelled
    if (enrollment.program_status === STATUS.TRAINING.CANCELLED) {
        throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_CANCELLED_PROGRAM), { status: 400 });
    }

    // B14.7: Validate enrollment status transition using state machine
    if (data.completion_status && data.completion_status !== enrollment.completion_status) {
        const allowed = ENROLLMENT_VALID_TRANSITIONS[enrollment.completion_status] || [];
        if (!allowed.includes(data.completion_status)) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_INVALID_TRANSITION), { status: 400 });
        }
    }

    // GAP-4: When marking as completed, enforce minimum attendance percentage
    if (data.completion_status === STATUS.ENROLLMENT.COMPLETED) {
        checkMinAttendancePct(enrollment, data);
    }
}

function buildEnrollmentSetClauses(enrollment, data) {
    const fieldsToUpdate = ENROLLMENT_UPDATE_FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NO_FIELDS), { status: 400 });
    }

    const setClauses = fieldsToUpdate.map((f, i) => `${f} = $${i + 3}`);
    const values = [/* enrollmentId, collegeId, */ ...fieldsToUpdate.map(f => data[f] ?? null)];

    // Auto-set completed_at when status changes to completed
    if (data.completion_status === STATUS.ENROLLMENT.COMPLETED && enrollment.completion_status !== STATUS.ENROLLMENT.COMPLETED) {
        setClauses.push('completed_at = NOW()');
    }

    // Auto-clear completed_at if status changed away from completed
    if (data.completion_status && data.completion_status !== STATUS.ENROLLMENT.COMPLETED && enrollment.completion_status === STATUS.ENROLLMENT.COMPLETED) {
        setClauses.push('completed_at = NULL');
    }

    return { setClauses, values };
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
            `SELECT ${ENROLLMENT_SELECT_COLUMNS}, tp.total_sessions, tp.program_status, tp.min_attendance_pct, tp.program_name
             FROM training_enrollments te
             JOIN training_programs tp ON te.program_id = tp.program_id
             WHERE te.enrollment_id = $1 AND te.college_id = $2
             FOR UPDATE OF te`,
            [enrollmentId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.ENROLLMENT_NOT_FOUND), { status: 404 });
        }

        const enrollment = existing.rows[0];
        const programName = enrollment.program_name;

        // Capture old values for audit (only fields that are being updated)
        const oldSnapshot = {};
        for (const field of Object.keys(data)) {
            if (data[field] !== undefined && enrollment[field] !== undefined) {
                oldSnapshot[field] = enrollment[field];
            }
        }

        validateEnrollmentUpdate(enrollment, data);
        const { setClauses, values } = buildEnrollmentSetClauses(enrollment, data);

        await client.query(
            `UPDATE training_enrollments
             SET ${setClauses.join(', ')}, updated_at = NOW()
             WHERE enrollment_id = $1 AND college_id = $2`,
            [enrollmentId, collegeId, ...values]
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
        const formatted = formatEnrollment(enriched.rows[0]);
        formatted._old = oldSnapshot;
        formatted._programName = programName;
        return formatted;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 8. BULK UPDATE ENROLLMENTS (MF3)
// ============================================================================

async function bulkUpdateEnrollments(programId, collegeId, updates) {
    if (!updates?.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.BULK_ENROLLMENT_NO_ITEMS), { status: 400 });
    }

    const enrollmentIds = updates.map(u => u.enrollment_id);

    // Detect duplicate enrollment_ids in the request
    const uniqueIds = new Set(enrollmentIds);
    if (uniqueIds.size !== enrollmentIds.length) {
        throw Object.assign(
            new Error('Duplicate enrollment IDs found in the request'),
            { status: 400 }
        );
    }

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Verify program exists and belongs to this college
        const programCheck = await client.query(
            `SELECT program_id, program_name, program_status, total_sessions, min_attendance_pct
             FROM training_programs
             WHERE program_id = $1 AND college_id = $2
             FOR UPDATE`,
            [programId, collegeId]
        );

        if (!programCheck.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
        }

        const program = programCheck.rows[0];

        // Lock and fetch all target enrollments in one query
        const existing = await client.query(
            `SELECT ${ENROLLMENT_SELECT_COLUMNS}
             FROM training_enrollments te
             WHERE te.program_id = $1 AND te.college_id = $2
             AND te.enrollment_id = ANY($3::uuid[])
             FOR UPDATE OF te`,
            [programId, collegeId, enrollmentIds]
        );

        // Verify all IDs were found and belong to this program
        if (existing.rows.length !== enrollmentIds.length) {
            const foundIds = new Set(existing.rows.map(r => r.enrollment_id));
            const missing = enrollmentIds.filter(id => !foundIds.has(id));
            throw Object.assign(
                new Error(`${ERROR_MESSAGES.BULK_ENROLLMENT_INVALID_IDS}: ${missing.join(', ')}`),
                { status: 400 }
            );
        }

        // Index existing enrollments by ID for fast lookup
        const enrollmentMap = new Map(existing.rows.map(r => [r.enrollment_id, r]));

        const results = [];
        const errors = [];

        for (const update of updates) {
            const { enrollment_id, ...data } = update;
            const enrollment = enrollmentMap.get(enrollment_id);

            // Attach program-level fields the helpers need
            enrollment.program_status = program.program_status;
            enrollment.total_sessions = program.total_sessions;
            enrollment.min_attendance_pct = program.min_attendance_pct;

            try {
                validateEnrollmentUpdate(enrollment, data);
                const { setClauses, values } = buildEnrollmentSetClauses(enrollment, data);

                await client.query(
                    `UPDATE training_enrollments
                     SET ${setClauses.join(', ')}, updated_at = NOW()
                     WHERE enrollment_id = $1 AND college_id = $2`,
                    [enrollment_id, collegeId, ...values]
                );

                results.push({ enrollment_id, status: 'updated' });
            } catch (err) {
                errors.push({ enrollment_id, error: err.message });
            }
        }

        // If ALL updates failed, rollback
        if (results.length === 0 && errors.length > 0) {
            await client.query('ROLLBACK');
            throw Object.assign(
                new Error('All enrollment updates failed'),
                { status: 400, details: errors }
            );
        }

        await client.query('COMMIT');

        return {
            program_id: programId,
            program_name: program.program_name,
            total: updates.length,
            updated: results.length,
            failed: errors.length,
            results,
            errors,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 9. STUDENT TRAINING REPORT (GAP-1)
// ============================================================================

async function getStudentTrainingReport(studentId, collegeId) {
    // Verify student exists and belongs to this college
    const studentCheck = await query(
        `SELECT student_id, CONCAT(first_name, ' ', last_name) AS student_name,
                student_email, dept_id, student_passout_year AS passout_year
         FROM students
         WHERE student_id = $1 AND college_id = $2`,
        [studentId, collegeId]
    );

    if (!studentCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.STUDENT_NOT_FOUND), { status: 404 });
    }

    const student = studentCheck.rows[0];

    // Fetch all enrollments with program details
    const enrollmentResult = await query(
        `SELECT ${ENROLLMENT_SELECT_COLUMNS},
                tp.program_name, tp.program_type, tp.program_status,
                tp.trainer_name, tp.trainer_organization,
                tp.start_date, tp.end_date, tp.total_sessions,
                tp.program_fee, tp.fee_currency, tp.min_attendance_pct
         FROM training_enrollments te
         JOIN training_programs tp ON te.program_id = tp.program_id
         WHERE te.student_id = $1 AND te.college_id = $2
         ORDER BY te.enrolled_at DESC`,
        [studentId, collegeId]
    );

    const enrollments = enrollmentResult.rows.map(row => ({
        ...formatEnrollment(row),
        program_name: row.program_name,
        program_type: row.program_type || null,
        program_status: row.program_status,
        trainer_name: row.trainer_name || null,
        trainer_organization: row.trainer_organization || null,
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        total_sessions: row.total_sessions || null,
        program_fee: row.program_fee ? Number.parseFloat(row.program_fee) : 0,
        fee_currency: row.fee_currency || 'INR',
        attendance_percentage: row.total_sessions && row.total_sessions > 0
            ? Number.parseFloat(((row.sessions_attended / row.total_sessions) * 100).toFixed(1))
            : null,
    }));

    // Build summary stats
    const summary = {
        total_enrollments: enrollments.length,
        completed: enrollments.filter(e => e.completion_status === STATUS.ENROLLMENT.COMPLETED).length,
        in_progress: enrollments.filter(e => e.completion_status === STATUS.ENROLLMENT.IN_PROGRESS).length,
        enrolled: enrollments.filter(e => e.completion_status === STATUS.ENROLLMENT.ENROLLED).length,
        dropped: enrollments.filter(e => e.completion_status === STATUS.ENROLLMENT.DROPPED).length,
        failed: enrollments.filter(e => e.completion_status === STATUS.ENROLLMENT.FAILED).length,
        avg_completion_percentage: enrollments.length
            ? Math.round(enrollments.reduce((sum, e) => sum + (e.completion_percentage || 0), 0) / enrollments.length)
            : 0,
        total_amount_paid: enrollments.reduce((sum, e) => sum + (e.amount_paid || 0), 0),
        certificates_earned: enrollments.filter(e => e.certificate_issued).length,
    };

    return { student, enrollments, summary };
}

// ============================================================================
// SESSION COLUMN CONSTANTS
// ============================================================================

const SESSION_SELECT_COLUMNS = [
    'ts.session_id', 'ts.program_id', 'ts.college_id', 'ts.session_number',
    'ts.session_date', 'ts.session_topic', 'ts.venue',
    'ts.created_by', 'ts.created_at', 'ts.updated_at',
].join(', ');

const SESSION_RETURNING_COLUMNS = [
    'session_id', 'program_id', 'college_id', 'session_number',
    'session_date', 'session_topic', 'venue',
    'created_by', 'created_at', 'updated_at',
].join(', ');

function formatSession(record) {
    return {
        session_id: record.session_id,
        program_id: record.program_id,
        session_number: record.session_number,
        session_date: toDateString(record.session_date),
        session_topic: record.session_topic || null,
        venue: record.venue || null,
        created_by: record.created_by || null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        // Attendance summary (when available)
        ...(record.present_count !== undefined && {
            present_count: Number.parseInt(record.present_count, 10),
        }),
        ...(record.absent_count !== undefined && {
            absent_count: Number.parseInt(record.absent_count, 10),
        }),
        ...(record.total_marked !== undefined && {
            total_marked: Number.parseInt(record.total_marked, 10),
        }),
    };
}

// ============================================================================
// 10. CREATE TRAINING SESSION (B16)
// ============================================================================

async function createTrainingSession(programId, collegeId, userId, data) {
    // Verify program exists and belongs to this college
    const programCheck = await query(
        `SELECT program_id, program_name, total_sessions
         FROM training_programs
         WHERE program_id = $1 AND college_id = $2`,
        [programId, collegeId]
    );

    if (!programCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
    }

    const program = programCheck.rows[0];

    // Validate session_number does not exceed total_sessions (when set)
    if (program.total_sessions && data.session_number > program.total_sessions) {
        throw Object.assign(new Error(ERROR_MESSAGES.SESSION_NUMBER_EXCEEDS_TOTAL), { status: 400 });
    }

    // Check for duplicate session_number via unique constraint (race-safe)
    try {
        const result = await query(
            `INSERT INTO training_sessions (program_id, college_id, session_number, session_date, session_topic, venue, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING ${SESSION_RETURNING_COLUMNS}`,
            [programId, collegeId, data.session_number, data.session_date || null, data.session_topic || null, data.venue || null, userId]
        );

        const formatted = formatSession(result.rows[0]);
        formatted._programName = program.program_name;
        return formatted;
    } catch (err) {
        if (err.code === '23505' && err.constraint === 'training_sessions_program_session_uq') {
            throw Object.assign(new Error(ERROR_MESSAGES.SESSION_DUPLICATE_NUMBER), { status: 409 });
        }
        throw err;
    }
}

// ============================================================================
// 11. GET TRAINING SESSIONS (B16)
// ============================================================================

async function getTrainingSessions(programId, collegeId) {
    // Verify program exists
    const programCheck = await query(
        `SELECT program_id FROM training_programs
         WHERE program_id = $1 AND college_id = $2`,
        [programId, collegeId]
    );

    if (!programCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NOT_FOUND), { status: 404 });
    }

    // Get total active enrolled count for percentage context
    const enrolledResult = await query(
        `SELECT COUNT(*) AS total_enrolled
         FROM training_enrollments
         WHERE program_id = $1 AND college_id = $2
         AND completion_status NOT IN ('dropped', 'failed')`,
        [programId, collegeId]
    );
    const totalEnrolled = Number.parseInt(enrolledResult.rows[0].total_enrolled, 10);

    // B2: Add safety LIMIT to prevent unbounded result sets
    const result = await query(
        `SELECT ${SESSION_SELECT_COLUMNS},
                COALESCE(att.present_count, 0) AS present_count,
                COALESCE(att.absent_count, 0) AS absent_count,
                COALESCE(att.total_marked, 0) AS total_marked
         FROM training_sessions ts
         LEFT JOIN (
             SELECT session_id,
                    SUM(CASE WHEN present THEN 1 ELSE 0 END) AS present_count,
                    SUM(CASE WHEN NOT present THEN 1 ELSE 0 END) AS absent_count,
                    COUNT(*) AS total_marked
             FROM training_session_attendance
             GROUP BY session_id
         ) att ON ts.session_id = att.session_id
         WHERE ts.program_id = $1 AND ts.college_id = $2
         ORDER BY ts.session_number ASC
         LIMIT 500`,
        [programId, collegeId]
    );

    const sessions = result.rows.map(row => ({
        ...formatSession(row),
        total_enrolled: totalEnrolled,
    }));

    return { sessions, total_enrolled: totalEnrolled };
}

// ============================================================================
// 12. UPDATE TRAINING SESSION (B16)
// ============================================================================

async function updateTrainingSession(sessionId, collegeId, data) {
    const fields = ['session_date', 'session_topic', 'venue'].filter(f => data[f] !== undefined);

    // Also allow updating session_number if provided
    if (data.session_number !== undefined) {
        fields.unshift('session_number');
    }

    if (!fields.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.TRAINING_NO_FIELDS), { status: 400 });
    }

    // Fetch old values + program name for audit
    const oldResult = await query(
        `SELECT ts.session_id, ts.session_number, ts.session_date, ts.session_topic, ts.venue, tp.program_name
         FROM training_sessions ts
         JOIN training_programs tp ON ts.program_id = tp.program_id
         WHERE ts.session_id = $1 AND ts.college_id = $2`,
        [sessionId, collegeId]
    );
    if (!oldResult.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.SESSION_NOT_FOUND), { status: 404 });
    }
    const oldSession = oldResult.rows[0];
    const oldSnapshot = {};
    for (const f of fields) {
        oldSnapshot[f] = oldSession[f] ?? null;
    }

    const setClauses = fields.map((f, i) => `${f} = $${i + 3}`);
    const values = fields.map(f => data[f] ?? null);

    try {
        const result = await query(
            `UPDATE training_sessions
             SET ${setClauses.join(', ')}, updated_at = NOW()
             WHERE session_id = $1 AND college_id = $2
             RETURNING ${SESSION_RETURNING_COLUMNS}`,
            [sessionId, collegeId, ...values]
        );

        if (!result.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SESSION_NOT_FOUND), { status: 404 });
        }

        const formatted = formatSession(result.rows[0]);
        formatted._old = oldSnapshot;
        formatted._programName = oldSession.program_name;
        return formatted;
    } catch (err) {
        if (err.code === '23505' && err.constraint === 'training_sessions_program_session_uq') {
            throw Object.assign(new Error(ERROR_MESSAGES.SESSION_DUPLICATE_NUMBER), { status: 409 });
        }
        throw err;
    }
}

// ============================================================================
// 13. DELETE TRAINING SESSION (B16)
// ============================================================================

async function deleteTrainingSession(sessionId, collegeId) {
    // B1: Wrap in transaction to prevent race condition where attendance could be
    // inserted between the check and the delete
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Lock the session row first and get details for audit
        const sessionCheck = await client.query(
            `SELECT ts.session_id, ts.session_number, ts.session_date, ts.session_topic, ts.venue,
                    tp.program_name, tp.program_id
             FROM training_sessions ts
             JOIN training_programs tp ON ts.program_id = tp.program_id
             WHERE ts.session_id = $1 AND ts.college_id = $2
             FOR UPDATE OF ts`,
            [sessionId, collegeId]
        );

        if (!sessionCheck.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SESSION_NOT_FOUND), { status: 404 });
        }

        // Check if session has any attendance records (safe under lock)
        const attendanceCheck = await client.query(
            `SELECT COUNT(*) AS count
             FROM training_session_attendance
             WHERE session_id = $1`,
            [sessionId]
        );

        if (Number.parseInt(attendanceCheck.rows[0].count, 10) > 0) {
            throw Object.assign(new Error(ERROR_MESSAGES.SESSION_HAS_ATTENDANCE), { status: 400 });
        }

        await client.query(
            `DELETE FROM training_sessions WHERE session_id = $1`,
            [sessionId]
        );

        await client.query('COMMIT');
        const deleted = sessionCheck.rows[0];
        return {
            session_id: sessionId,
            session_number: deleted.session_number,
            program_name: deleted.program_name,
            program_id: deleted.program_id,
            session_date: deleted.session_date,
            session_topic: deleted.session_topic,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 14. MARK SESSION ATTENDANCE (B16)
// ============================================================================

async function markSessionAttendance(sessionId, collegeId, userId, attendanceData) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Verify session exists and get program context
        const sessionCheck = await client.query(
            `SELECT ts.session_id, ts.program_id, ts.session_number, tp.program_name
             FROM training_sessions ts
             JOIN training_programs tp ON ts.program_id = tp.program_id
             WHERE ts.session_id = $1 AND ts.college_id = $2
             FOR UPDATE OF ts`,
            [sessionId, collegeId]
        );

        if (!sessionCheck.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SESSION_NOT_FOUND), { status: 404 });
        }

        const session = sessionCheck.rows[0];
        const programId = session.program_id;
        const enrollmentIds = attendanceData.map(a => a.enrollment_id);

        // Verify all enrollment_ids belong to this program + college + NOT dropped/failed
        const enrollmentCheck = await client.query(
            `SELECT enrollment_id
             FROM training_enrollments
             WHERE program_id = $1 AND college_id = $2
             AND enrollment_id = ANY($3::uuid[])
             AND completion_status NOT IN ('dropped', 'failed')
             FOR UPDATE`,
            [programId, collegeId, enrollmentIds]
        );

        const validIds = new Set(enrollmentCheck.rows.map(r => r.enrollment_id));
        const invalidIds = enrollmentIds.filter(id => !validIds.has(id));

        if (invalidIds.length) {
            throw Object.assign(
                new Error(`${ERROR_MESSAGES.ENROLLMENT_INVALID_FOR_ATTENDANCE}: ${invalidIds.join(', ')}`),
                { status: 400 }
            );
        }

        // A4: Batch UPSERT attendance records (single multi-row INSERT instead of N individual queries)
        const upsertValues = [];
        const upsertParams = [];
        let presentCount = 0;
        let absentCount = 0;

        for (let i = 0; i < attendanceData.length; i++) {
            const record = attendanceData[i];
            const offset = i * 5;
            upsertValues.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
            upsertParams.push(sessionId, record.enrollment_id, collegeId, record.present, userId);
            if (record.present) { presentCount++; } else { absentCount++; }
        }

        await client.query(
            `INSERT INTO training_session_attendance (session_id, enrollment_id, college_id, present, marked_by)
             VALUES ${upsertValues.join(', ')}
             ON CONFLICT (session_id, enrollment_id)
             DO UPDATE SET present = EXCLUDED.present, marked_at = NOW(), marked_by = EXCLUDED.marked_by`,
            upsertParams
        );

        // A4: Batch recalculate sessions_attended + completion_percentage (single UPDATE with subquery)
        const totalSessionsResult = await client.query(
            `SELECT total_sessions FROM training_programs WHERE program_id = $1`,
            [programId]
        );
        const totalSessions = totalSessionsResult.rows[0]?.total_sessions || 0;

        await client.query(
            `UPDATE training_enrollments te
             SET sessions_attended = sub.attended,
                 completion_percentage = CASE
                     WHEN $2::int > 0 THEN ROUND((sub.attended * 100.0 / $2::int)::numeric)
                     ELSE 0
                 END,
                 updated_at = NOW()
             FROM (
                 SELECT tsa.enrollment_id, COUNT(*) FILTER (WHERE tsa.present = true) AS attended
                 FROM training_session_attendance tsa
                 JOIN training_sessions ts ON tsa.session_id = ts.session_id
                 WHERE ts.program_id = $1 AND tsa.enrollment_id = ANY($3::uuid[])
                 GROUP BY tsa.enrollment_id
             ) sub
             WHERE te.enrollment_id = sub.enrollment_id`,
            [programId, totalSessions, enrollmentIds]
        );

        await client.query('COMMIT');

        return {
            session_id: sessionId,
            session_number: session.session_number,
            program_id: programId,
            program_name: session.program_name,
            total_marked: attendanceData.length,
            present_count: presentCount,
            absent_count: absentCount,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 15. GET SESSION ATTENDANCE (per-student records for a session)
// ============================================================================

async function getSessionAttendance(sessionId, collegeId) {
    // Verify session exists and belongs to this college
    const sessionCheck = await query(
        `SELECT ts.session_id, ts.program_id, ts.session_number
         FROM training_sessions ts
         WHERE ts.session_id = $1 AND ts.college_id = $2
         LIMIT 1`,
        [sessionId, collegeId]
    );

    if (!sessionCheck.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.SESSION_NOT_FOUND), { status: 404 });
    }

    const records = await query(
        `SELECT tsa.enrollment_id, tsa.present, tsa.marked_at, tsa.marked_by
         FROM training_session_attendance tsa
         WHERE tsa.session_id = $1 AND tsa.college_id = $2
         ORDER BY tsa.marked_at`,
        [sessionId, collegeId]
    );

    return {
        session_id: sessionCheck.rows[0].session_id,
        program_id: sessionCheck.rows[0].program_id,
        session_number: sessionCheck.rows[0].session_number,
        records: records.rows,
    };
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
    toggleEnrollmentAccess,
    getTrainingEnrollments,
    updateEnrollment,
    bulkUpdateEnrollments,
    getStudentTrainingReport,
    createTrainingSession,
    getTrainingSessions,
    updateTrainingSession,
    deleteTrainingSession,
    markSessionAttendance,
    getSessionAttendance,
};
