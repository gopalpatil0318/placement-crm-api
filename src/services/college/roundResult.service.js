/**
 * ============================================================================
 * ROUND RESULT SERVICE — Student Round Results Management
 * ============================================================================
 *   - addRoundResult(roundId, collegeId, data)
 *   - bulkAddRoundResults(roundId, collegeId, results)
 *   - getRoundResults(roundId, collegeId, filters)
 *   - updateRoundResult(resultId, collegeId, data)
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

// Fields that can be dynamically updated
const UPDATABLE_FIELDS = ['result_status', 'score', 'remarks', 'attended', 'scheduled_at', 'completed_at'];

// ============================================================================
// HELPER — Verify round exists and belongs to college
// ============================================================================

async function verifyRound(roundId, collegeId) {
    const result = await query(
        `SELECT jr.*, j.job_title, j.job_status, j.college_id, c.company_name
         FROM job_rounds jr
         JOIN job_postings j ON jr.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE jr.round_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [roundId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error('Round not found'), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Verify result exists and belongs to college
// ============================================================================

async function verifyResult(resultId, collegeId) {
    const result = await query(
        `SELECT rr.*,
                jr.round_name, jr.round_number, jr.round_status, jr.job_id,
                j.job_title, j.job_status,
                c.company_name,
                s.first_name, s.last_name, s.student_email
         FROM student_round_results rr
         JOIN job_rounds jr ON rr.round_id = jr.round_id
         JOIN job_postings j ON jr.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         JOIN students s ON rr.student_id = s.student_id
         WHERE rr.result_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [resultId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error('Round result not found'), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Verify application belongs to the round's job + college
// ============================================================================

async function verifyApplication(applicationId, jobId, collegeId) {
    const result = await query(
        `SELECT a.application_id, a.student_id, a.application_status,
                s.first_name, s.last_name, s.student_email
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         WHERE a.application_id = $1 AND a.job_id = $2 AND a.college_id = $3
         LIMIT 1`,
        [applicationId, jobId, collegeId]
    );

    if (!result.rows.length) {
        return null;
    }

    return result.rows[0];
}

// ============================================================================
// 1. ADD SINGLE ROUND RESULT
// ============================================================================

/**
 * Add a result for a single student in a round.
 * Validates: round exists, application exists for the job, not duplicate.
 * Cannot add results to cancelled rounds or cancelled jobs.
 *
 * @param {string} roundId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Created result
 */
async function addRoundResult(roundId, collegeId, data) {
    // 1. Verify round
    const round = await verifyRound(roundId, collegeId);

    // 2. Cannot add to cancelled rounds
    if (round.round_status === STATUS.ROUND.CANCELLED) {
        throw Object.assign(
            new Error('Cannot add results to a cancelled round'),
            { status: 400 }
        );
    }

    // 3. Cannot add to cancelled jobs
    if (round.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error('Cannot add results for a cancelled job'),
            { status: 400 }
        );
    }

    // 4. Verify application belongs to this job
    const app = await verifyApplication(data.application_id, round.job_id, collegeId);
    if (!app) {
        throw Object.assign(
            new Error('Application not found for this job or does not belong to this college'),
            { status: 404 }
        );
    }

    // 5. Check application is not rejected/withdrawn
    if (['rejected', 'withdrawn'].includes(app.application_status)) {
        throw Object.assign(
            new Error(`Cannot add round result for a ${app.application_status} application`),
            { status: 400 }
        );
    }

    // 6. Check duplicate (unique: application_id + round_id)
    const duplicateCheck = await query(
        `SELECT result_id FROM student_round_results
         WHERE application_id = $1 AND round_id = $2
         LIMIT 1`,
        [data.application_id, roundId]
    );

    if (duplicateCheck.rows.length) {
        throw Object.assign(
            new Error('Result already exists for this student in this round. Use update instead'),
            { status: 409 }
        );
    }

    // 7. Validate completed_at > scheduled_at if both provided
    if (data.completed_at && data.scheduled_at) {
        const completedDate = new Date(data.completed_at);
        const scheduledDate = new Date(data.scheduled_at);
        if (completedDate < scheduledDate) {
            throw Object.assign(
                new Error('Completed date cannot be before scheduled date'),
                { status: 400 }
            );
        }
    }

    // 8. Insert
    const result = await query(
        `INSERT INTO student_round_results
           (application_id, round_id, student_id, result_status, score, remarks, attended, scheduled_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
            data.application_id,
            roundId,
            app.student_id,
            data.result_status ?? 'pending',
            data.score ?? null,
            data.remarks ?? null,
            data.attended ?? false,
            data.scheduled_at ?? null,
            data.completed_at ?? null,
        ]
    );

    logger.info(`${LOG.AUTH} Round result added`, {
        resultId: result.rows[0].result_id,
        roundId,
        applicationId: data.application_id,
        studentId: app.student_id,
        resultStatus: data.result_status ?? 'pending',
        collegeId,
    });

    return {
        ...result.rows[0],
        student_name: `${app.first_name} ${app.last_name}`,
        student_email: app.student_email,
        round_name: round.round_name,
        round_number: round.round_number,
        job_title: round.job_title,
        company_name: round.company_name,
    };
}

// ============================================================================
// 2. BULK ADD ROUND RESULTS
// ============================================================================

/**
 * Bulk add results for multiple students in a single round.
 * Validates each application, skips duplicates, reports results.
 *
 * @param {string} roundId
 * @param {string} collegeId
 * @param {Object[]} results
 * @returns {{ created, skipped, errors }}
 */
async function bulkAddRoundResults(roundId, collegeId, results) {
    // 1. Verify round
    const round = await verifyRound(roundId, collegeId);

    if (round.round_status === STATUS.ROUND.CANCELLED) {
        throw Object.assign(
            new Error('Cannot add results to a cancelled round'),
            { status: 400 }
        );
    }

    if (round.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error('Cannot add results for a cancelled job'),
            { status: 400 }
        );
    }

    // 2. Get all application IDs from the request
    const applicationIds = [...new Set(results.map(r => r.application_id))];

    // 3. Fetch all valid applications in one query
    const appsResult = await query(
        `SELECT a.application_id, a.student_id, a.application_status,
                s.first_name, s.last_name
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         WHERE a.application_id = ANY($1) AND a.job_id = $2 AND a.college_id = $3`,
        [applicationIds, round.job_id, collegeId]
    );

    const appsMap = new Map();
    for (const row of appsResult.rows) {
        appsMap.set(row.application_id, row);
    }

    // 4. Check existing results to detect duplicates
    const existingResults = await query(
        `SELECT application_id FROM student_round_results
         WHERE round_id = $1 AND application_id = ANY($2)`,
        [roundId, applicationIds]
    );

    const existingSet = new Set(existingResults.rows.map(r => r.application_id));

    // 5. Categorize
    const toInsert = [];
    const skipped = [];
    const errors = [];

    for (const item of results) {
        const app = appsMap.get(item.application_id);

        if (!app) {
            errors.push({ application_id: item.application_id, reason: 'Application not found for this job' });
            continue;
        }

        if (['rejected', 'withdrawn'].includes(app.application_status)) {
            skipped.push({
                application_id: item.application_id,
                student_name: `${app.first_name} ${app.last_name}`,
                reason: `Application is ${app.application_status}`,
            });
            continue;
        }

        if (existingSet.has(item.application_id)) {
            skipped.push({
                application_id: item.application_id,
                student_name: `${app.first_name} ${app.last_name}`,
                reason: 'Result already exists for this round',
            });
            continue;
        }

        // Validate completed_at > scheduled_at
        if (item.completed_at && item.scheduled_at) {
            const completedDate = new Date(item.completed_at);
            const scheduledDate = new Date(item.scheduled_at);
            if (completedDate < scheduledDate) {
                skipped.push({
                    application_id: item.application_id,
                    student_name: `${app.first_name} ${app.last_name}`,
                    reason: 'Completed date cannot be before scheduled date',
                });
                continue;
            }
        }

        toInsert.push({
            ...item,
            student_id: app.student_id,
            student_name: `${app.first_name} ${app.last_name}`,
        });

        // Prevent processing same application_id twice within request
        existingSet.add(item.application_id);
    }

    // 6. Bulk insert using a transaction
    const created = [];
    if (toInsert.length > 0) {
        const client = await getClient();
        try {
            await client.query('BEGIN');

            for (const item of toInsert) {
                const res = await client.query(
                    `INSERT INTO student_round_results
                       (application_id, round_id, student_id, result_status, score, remarks, attended, scheduled_at, completed_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     RETURNING result_id`,
                    [
                        item.application_id,
                        roundId,
                        item.student_id,
                        item.result_status ?? 'pending',
                        item.score ?? null,
                        item.remarks ?? null,
                        item.attended ?? false,
                        item.scheduled_at ?? null,
                        item.completed_at ?? null,
                    ]
                );
                created.push({
                    result_id: res.rows[0].result_id,
                    application_id: item.application_id,
                    student_name: item.student_name,
                    result_status: item.result_status ?? 'pending',
                });
            }

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    logger.info(`${LOG.AUTH} Bulk round results added`, {
        roundId,
        createdCount: created.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        collegeId,
    });

    return {
        round_name: round.round_name,
        round_number: round.round_number,
        job_title: round.job_title,
        company_name: round.company_name,
        summary: {
            total_requested: results.length,
            created: created.length,
            skipped: skipped.length,
            errors: errors.length,
        },
        created,
        skipped,
        errors,
    };
}

// ============================================================================
// 3. GET ROUND RESULTS (paginated, filtered, sorted)
// ============================================================================

/**
 * List all results for a round with filtering, search, and pagination.
 *
 * @param {string} roundId
 * @param {string} collegeId
 * @param {Object} filters
 * @returns {{ results, total, page, limit, round info, status_summary }}
 */
async function getRoundResults(roundId, collegeId, filters = {}) {
    // 1. Verify round
    const round = await verifyRound(roundId, collegeId);

    const { page, limit, offset } = getPagination(filters);

    // 2. WHERE conditions
    const conditions = ['rr.round_id = $1'];
    const params = [roundId];
    let paramIndex = 2;

    if (filters.result_status) {
        conditions.push(`rr.result_status = $${paramIndex}`);
        params.push(filters.result_status);
        paramIndex++;
    }

    if (filters.attended !== undefined && filters.attended !== '') {
        conditions.push(`rr.attended = $${paramIndex}`);
        params.push(filters.attended === 'true');
        paramIndex++;
    }

    if (filters.search) {
        conditions.push(
            `(s.first_name ILIKE $${paramIndex} OR s.last_name ILIKE $${paramIndex} OR s.student_email ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // 3. Sort columns
    const SORTABLE = {
        student_name: 's.first_name',
        score: 'rr.score',
        result_status: 'rr.result_status',
        scheduled_at: 'rr.scheduled_at',
        completed_at: 'rr.completed_at',
        created_at: 'rr.created_at',
    };
    const sortCol = SORTABLE[filters.sort_by] || 'rr.created_at';
    const sortOrd = filters.sort_order === 'desc' ? 'DESC' : 'ASC';

    // 4. Count
    const countResult = await query(
        `SELECT COUNT(*) AS total
         FROM student_round_results rr
         JOIN students s ON rr.student_id = s.student_id
         WHERE ${whereClause}`,
        params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // 5. Fetch results with student info
    const resultRows = await query(
        `SELECT rr.*,
                s.first_name, s.last_name, s.student_email,
                d.dept_name,
                a.application_status
         FROM student_round_results rr
         JOIN students s ON rr.student_id = s.student_id
         JOIN student_applications a ON rr.application_id = a.application_id
         LEFT JOIN departments d ON s.dept_id = d.dept_id
         WHERE ${whereClause}
         ORDER BY ${sortCol} ${sortOrd}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
    );

    // 6. Status summary (unfiltered)
    const summaryResult = await query(
        `SELECT result_status, COUNT(*) AS cnt,
                AVG(score) AS avg_score
         FROM student_round_results
         WHERE round_id = $1
         GROUP BY result_status`,
        [roundId]
    );

    const statusSummary = {
        total: 0, pending: 0, passed: 0, failed: 0, on_hold: 0, absent: 0,
        avg_score: null,
    };

    let totalScore = 0;
    let scoreCount = 0;
    for (const row of summaryResult.rows) {
        const count = parseInt(row.cnt, 10);
        statusSummary[row.result_status] = count;
        statusSummary.total += count;
        if (row.avg_score !== null) {
            totalScore += parseFloat(row.avg_score) * count;
            scoreCount += count;
        }
    }
    statusSummary.avg_score = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 100) / 100 : null;

    return {
        results: resultRows.rows.map(row => ({
            result_id: row.result_id,
            application_id: row.application_id,
            round_id: row.round_id,
            student_id: row.student_id,
            result_status: row.result_status,
            score: row.score !== null ? parseFloat(row.score) : null,
            remarks: row.remarks ?? null,
            attended: row.attended,
            scheduled_at: row.scheduled_at,
            completed_at: row.completed_at,
            created_at: row.created_at,
            student_name: `${row.first_name} ${row.last_name}`,
            student_email: row.student_email,
            dept_name: row.dept_name ?? null,
            application_status: row.application_status,
        })),
        total,
        page,
        limit,
        round_name: round.round_name,
        round_number: round.round_number,
        round_status: round.round_status,
        job_title: round.job_title,
        company_name: round.company_name,
        status_summary: statusSummary,
    };
}

// ============================================================================
// 4. UPDATE ROUND RESULT
// ============================================================================

/**
 * Update a single round result.
 * Cannot update results in cancelled rounds or cancelled jobs.
 *
 * @param {string} resultId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated result
 */
async function updateRoundResult(resultId, collegeId, data) {
    // 1. Verify result
    const existing = await verifyResult(resultId, collegeId);

    // 2. Cannot update in cancelled round
    if (existing.round_status === STATUS.ROUND.CANCELLED) {
        throw Object.assign(
            new Error('Cannot update results in a cancelled round'),
            { status: 400 }
        );
    }

    // 3. Cannot update in cancelled job
    if (existing.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error('Cannot update results for a cancelled job'),
            { status: 400 }
        );
    }

    // 4. Validate completed_at > scheduled_at
    const effectiveScheduled = data.scheduled_at !== undefined ? data.scheduled_at : existing.scheduled_at;
    const effectiveCompleted = data.completed_at !== undefined ? data.completed_at : existing.completed_at;

    if (effectiveCompleted && effectiveScheduled) {
        const completedDate = new Date(effectiveCompleted);
        const scheduledDate = new Date(effectiveScheduled);
        if (completedDate < scheduledDate) {
            throw Object.assign(
                new Error('Completed date cannot be before scheduled date'),
                { status: 400 }
            );
        }
    }

    // 5. Build dynamic UPDATE
    const fieldsToUpdate = UPDATABLE_FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error('No valid fields provided for update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 2}`)
        .join(', ');
    const values = [resultId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE student_round_results
         SET ${setClauses}
         WHERE result_id = $1
         RETURNING *`,
        values
    );

    logger.info(`${LOG.AUTH} Round result updated`, {
        resultId,
        updatedFields: fieldsToUpdate,
        roundId: existing.round_id,
        studentId: existing.student_id,
        collegeId,
    });

    return {
        ...result.rows[0],
        score: result.rows[0].score !== null ? parseFloat(result.rows[0].score) : null,
        student_name: `${existing.first_name} ${existing.last_name}`,
        student_email: existing.student_email,
        round_name: existing.round_name,
        round_number: existing.round_number,
        job_title: existing.job_title,
        company_name: existing.company_name,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addRoundResult,
    bulkAddRoundResults,
    getRoundResults,
    updateRoundResult,
};
