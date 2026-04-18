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

// Columns returned by INSERT/UPDATE on student_round_results
const RESULT_RETURNING_COLUMNS = [
    'result_id', 'application_id', 'round_id', 'student_id', 'result_status',
    'score', 'remarks', 'attended', 'scheduled_at', 'completed_at', 'created_at',
].join(', ');

// ============================================================================
// HELPER — Verify round exists and belongs to college
// ============================================================================

async function verifyRound(roundId, collegeId) {
    const result = await query(
        `SELECT jr.round_id, jr.job_id, jr.round_number, jr.round_name, jr.round_description,
                jr.round_type, jr.round_date, jr.round_venue, jr.round_status, jr.is_processed, jr.created_at,
                j.job_title, j.job_status, j.college_id, c.company_name
         FROM job_rounds jr
         JOIN job_postings j ON jr.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE jr.round_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [roundId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Verify result exists and belongs to college
// ============================================================================

async function verifyResult(resultId, collegeId) {
    const result = await query(
        `SELECT rr.result_id, rr.application_id, rr.round_id, rr.student_id, rr.result_status,
                rr.score, rr.remarks, rr.attended, rr.scheduled_at, rr.completed_at, rr.created_at,
                jr.round_name, jr.round_number, jr.round_status, jr.is_processed, jr.job_id,
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
        throw Object.assign(new Error(ERROR_MESSAGES.RESULT_NOT_FOUND), { status: 404 });
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
// HELPER — Check round is eligible for result entry (throws on invalid)
// ============================================================================

const NON_RESULT_STATUSES = new Set([STATUS.APPLICATION.REJECTED, STATUS.APPLICATION.WITHDRAWN]);

function checkRoundEligibleForResults(round, context = 'add') {
    if (round.round_status === STATUS.ROUND.CANCELLED) {
        const msg = context === 'update'
            ? ERROR_MESSAGES.CANNOT_UPDATE_RESULT_CANCELLED_ROUND
            : ERROR_MESSAGES.CANNOT_ADD_RESULT_CANCELLED_ROUND;
        throw Object.assign(new Error(msg), { status: 400 });
    }
    if (round.job_status === STATUS.JOB.CANCELLED) {
        const msg = context === 'update'
            ? ERROR_MESSAGES.CANNOT_UPDATE_RESULT_CANCELLED_JOB
            : ERROR_MESSAGES.CANNOT_ADD_RESULT_CANCELLED_JOB;
        throw Object.assign(new Error(msg), { status: 400 });
    }
    // Results can only be added/updated when round is in_progress or completed
    if (round.round_status === STATUS.ROUND.PENDING) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_NOT_STARTED), { status: 400 });
    }
    // Cannot add new results after round has been processed/finalized
    if (context === 'add' && round.is_processed) {
        throw Object.assign(new Error('Cannot add results to a processed round. Unprocess the round first or update existing results.'), { status: 400 });
    }
}

// ============================================================================
// HELPER — Check student passed the previous round (for round_number > 1)
// ============================================================================

async function checkPreviousRoundPassed(applicationId, jobId, currentRoundNumber) {
    if (currentRoundNumber <= 1) return; // No previous round to check

    // Find the previous round and check for a passed result
    const result = await query(
        `SELECT rr.result_status
         FROM student_round_results rr
         JOIN job_rounds jr ON rr.round_id = jr.round_id
         WHERE jr.job_id = $1 AND jr.round_number = $2 AND rr.application_id = $3
         LIMIT 1`,
        [jobId, currentRoundNumber - 1, applicationId]
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error(`${ERROR_MESSAGES.PREVIOUS_ROUND_NOT_PASSED} (no result found in round ${currentRoundNumber - 1})`),
            { status: 400 }
        );
    }

    const prevStatus = result.rows[0].result_status;
    if (prevStatus !== STATUS.ROUND_RESULT.PASSED && prevStatus !== STATUS.ROUND_RESULT.ON_HOLD) {
        throw Object.assign(
            new Error(`${ERROR_MESSAGES.PREVIOUS_ROUND_NOT_PASSED} (result: ${prevStatus})`),
            { status: 400 }
        );
    }
}

// ============================================================================
// HELPER — Batch-check previous round results for bulk operations
// Returns a Map<application_id, { passed: boolean, reason: string }>
// ============================================================================

async function batchCheckPreviousRound(applicationIds, jobId, currentRoundNumber) {
    if (currentRoundNumber <= 1) return null; // No gate needed

    const result = await query(
        `SELECT rr.application_id, rr.result_status
         FROM student_round_results rr
         JOIN job_rounds jr ON rr.round_id = jr.round_id
         WHERE jr.job_id = $1 AND jr.round_number = $2 AND rr.application_id = ANY($3)`,
        [jobId, currentRoundNumber - 1, applicationIds]
    );

    const prevResults = new Map(result.rows.map(r => [r.application_id, r.result_status]));
    const gateMap = new Map();

    for (const appId of applicationIds) {
        const status = prevResults.get(appId);
        if (!status) {
            gateMap.set(appId, { passed: false, reason: `No result in round ${currentRoundNumber - 1}` });
        } else if (status === STATUS.ROUND_RESULT.PASSED || status === STATUS.ROUND_RESULT.ON_HOLD) {
            gateMap.set(appId, { passed: true, reason: null });
        } else {
            gateMap.set(appId, { passed: false, reason: `Result in round ${currentRoundNumber - 1}: ${status}` });
        }
    }

    return gateMap;
}

// ============================================================================
// HELPER — Validate completed_at > scheduled_at (returns error string or null)
// ============================================================================

function validateResultDates(scheduledAt, completedAt) {
    if (completedAt && scheduledAt) {
        if (new Date(completedAt) < new Date(scheduledAt)) {
            return ERROR_MESSAGES.RESULT_DATES_INVALID;
        }
    }
    return null;
}

// ============================================================================
// HELPER — Categorize bulk items into toInsert / skipped / errors
// ============================================================================

function categorizeResults(items, appsMap, existingSet, previousRoundGate = null) {
    const toInsert = [];
    const skipped = [];
    const errors = [];

    for (const item of items) {
        const app = appsMap.get(item.application_id);

        if (!app) {
            errors.push({ application_id: item.application_id, reason: 'Application not found for this job' });
            continue;
        }

        if (NON_RESULT_STATUSES.has(app.application_status)) {
            skipped.push({
                application_id: item.application_id,
                student_name: `${app.first_name} ${app.last_name}`,
                reason: `Application is ${app.application_status}`,
            });
            continue;
        }

        // Gate: check previous round result
        if (previousRoundGate) {
            const gate = previousRoundGate.get(item.application_id);
            if (gate && !gate.passed) {
                skipped.push({
                    application_id: item.application_id,
                    student_name: `${app.first_name} ${app.last_name}`,
                    reason: `Did not pass previous round (${gate.reason})`,
                });
                continue;
            }
        }

        if (existingSet.has(item.application_id)) {
            skipped.push({
                application_id: item.application_id,
                student_name: `${app.first_name} ${app.last_name}`,
                reason: 'Result already exists for this round',
            });
            continue;
        }

        const dateError = validateResultDates(item.scheduled_at, item.completed_at);
        if (dateError) {
            skipped.push({
                application_id: item.application_id,
                student_name: `${app.first_name} ${app.last_name}`,
                reason: 'Completed date cannot be before scheduled date',
            });
            continue;
        }

        toInsert.push({
            ...item,
            student_id: app.student_id,
            student_name: `${app.first_name} ${app.last_name}`,
        });

        existingSet.add(item.application_id);
    }

    return { toInsert, skipped, errors };
}

// ============================================================================
// HELPER — Build status summary from aggregation rows
// ============================================================================

function buildStatusSummary(summaryRows) {
    const summary = {
        total: 0, pending: 0, passed: 0, failed: 0, on_hold: 0, absent: 0,
        avg_score: null,
    };

    let totalScore = 0;
    let scoreCount = 0;
    for (const row of summaryRows) {
        const count = Number.parseInt(row.cnt, 10);
        summary[row.result_status] = count;
        summary.total += count;
        if (row.avg_score !== null) {
            totalScore += Number.parseFloat(row.avg_score) * count;
            scoreCount += count;
        }
    }
    summary.avg_score = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 100) / 100 : null;
    return summary;
}

// ============================================================================
// HELPER — Map DB rows to result response objects
// ============================================================================

function mapResultRow(row) {
    return {
        result_id: row.result_id,
        application_id: row.application_id,
        round_id: row.round_id,
        student_id: row.student_id,
        result_status: row.result_status,
        score: row.score === null ? null : Number.parseFloat(row.score),
        remarks: row.remarks ?? null,
        attended: row.attended,
        scheduled_at: row.scheduled_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        student_name: `${row.first_name} ${row.last_name}`,
        student_email: row.student_email,
        dept_name: row.dept_name ?? null,
        application_status: row.application_status,
    };
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
    const round = await verifyRound(roundId, collegeId);
    checkRoundEligibleForResults(round, 'add');

    // Verify application belongs to this job
    const app = await verifyApplication(data.application_id, round.job_id, collegeId);
    if (!app) {
        throw Object.assign(new Error(ERROR_MESSAGES.INVALID_APPLICATION_FOR_RESULT), { status: 404 });
    }

    if (NON_RESULT_STATUSES.has(app.application_status)) {
        throw Object.assign(
            new Error(`Cannot add round result for a ${app.application_status} application`),
            { status: 400 }
        );
    }

    // Gate: student must have passed the previous round
    await checkPreviousRoundPassed(data.application_id, round.job_id, round.round_number);

    // Check duplicate (unique: application_id + round_id)
    const dup = await query(
        `SELECT result_id FROM student_round_results
         WHERE application_id = $1 AND round_id = $2 LIMIT 1`,
        [data.application_id, roundId]
    );
    if (dup.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.RESULT_ALREADY_EXISTS), { status: 409 });
    }

    // Validate dates
    const dateError = validateResultDates(data.scheduled_at, data.completed_at);
    if (dateError) {
        throw Object.assign(new Error(dateError), { status: 400 });
    }

    // Insert
    const result = await query(
        `INSERT INTO student_round_results
           (application_id, round_id, student_id, result_status, score, remarks, attended, scheduled_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${RESULT_RETURNING_COLUMNS}`,
        [
            data.application_id, roundId, app.student_id,
            data.result_status ?? 'pending', data.score ?? null, data.remarks ?? null,
            data.attended ?? false, data.scheduled_at ?? null, data.completed_at ?? null,
        ]
    );

    logger.info(`${LOG.AUTH} Round result added`, {
        resultId: result.rows[0].result_id, roundId,
        applicationId: data.application_id, studentId: app.student_id, collegeId,
    });

    return {
        ...result.rows[0],
        student_name: `${app.first_name} ${app.last_name}`,
        student_email: app.student_email,
        round_name: round.round_name, round_number: round.round_number,
        job_title: round.job_title, company_name: round.company_name,
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
    const round = await verifyRound(roundId, collegeId);
    checkRoundEligibleForResults(round, 'add');

    // Batch-fetch applications + existing results (prevents N+1)
    const applicationIds = [...new Set(results.map(r => r.application_id))];

    const [appsResult, existingResults, previousRoundGate] = await Promise.all([
        query(
            `SELECT a.application_id, a.student_id, a.application_status,
                    s.first_name, s.last_name
             FROM student_applications a
             JOIN students s ON a.student_id = s.student_id
             WHERE a.application_id = ANY($1) AND a.job_id = $2 AND a.college_id = $3`,
            [applicationIds, round.job_id, collegeId]
        ),
        query(
            `SELECT application_id FROM student_round_results
             WHERE round_id = $1 AND application_id = ANY($2)`,
            [roundId, applicationIds]
        ),
        batchCheckPreviousRound(applicationIds, round.job_id, round.round_number),
    ]);
    const appsMap = new Map(appsResult.rows.map(r => [r.application_id, r]));
    const existingSet = new Set(existingResults.rows.map(r => r.application_id));

    // Categorize via extracted helper
    const { toInsert, skipped, errors } = categorizeResults(results, appsMap, existingSet, previousRoundGate);

    // Bulk insert inside transaction
    const created = [];
    if (toInsert.length > 0) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            const insertResult = await client.query(
                `INSERT INTO student_round_results
                   (application_id, round_id, student_id, result_status, score, remarks, attended, scheduled_at, completed_at)
                 SELECT unnest($1::uuid[]), $2, unnest($3::uuid[]), unnest($4::text[]),
                        unnest($5::numeric[]), unnest($6::text[]), unnest($7::boolean[]),
                        unnest($8::timestamptz[]), unnest($9::timestamptz[])
                 RETURNING result_id, application_id`,
                [
                    toInsert.map(i => i.application_id), roundId,
                    toInsert.map(i => i.student_id), toInsert.map(i => i.result_status ?? 'pending'),
                    toInsert.map(i => i.score ?? null), toInsert.map(i => i.remarks ?? null),
                    toInsert.map(i => i.attended ?? false), toInsert.map(i => i.scheduled_at ?? null),
                    toInsert.map(i => i.completed_at ?? null),
                ]
            );

            const insertMap = new Map(insertResult.rows.map(r => [r.application_id, r.result_id]));
            for (const item of toInsert) {
                created.push({
                    result_id: insertMap.get(item.application_id),
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
        roundId, createdCount: created.length,
        skippedCount: skipped.length, errorCount: errors.length, collegeId,
    });

    return {
        round_name: round.round_name, round_number: round.round_number,
        job_title: round.job_title, company_name: round.company_name,
        summary: {
            total_requested: results.length,
            created: created.length, skipped: skipped.length, errors: errors.length,
        },
        created, skipped, errors,
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
    const round = await verifyRound(roundId, collegeId);
    const { page, limit, offset } = getPagination(filters);

    // Build WHERE conditions
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
    const SORTABLE = {
        student_name: 's.first_name', score: 'rr.score',
        result_status: 'rr.result_status', scheduled_at: 'rr.scheduled_at',
        completed_at: 'rr.completed_at', created_at: 'rr.created_at',
    };
    const sortCol = SORTABLE[filters.sort_by] || 'rr.created_at';
    const sortOrd = filters.sort_order === 'desc' ? 'DESC' : 'ASC';

    // Count + Fetch + Summary (parallel)
    const [countResult, resultRows, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM student_round_results rr
             JOIN students s ON rr.student_id = s.student_id WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT rr.result_id, rr.application_id, rr.round_id, rr.student_id, rr.result_status,
                    rr.score, rr.remarks, rr.attended, rr.scheduled_at, rr.completed_at, rr.created_at,
                    s.first_name, s.last_name, s.student_email,
                    d.dept_name, a.application_status
             FROM student_round_results rr
             JOIN students s ON rr.student_id = s.student_id
             JOIN student_applications a ON rr.application_id = a.application_id
             LEFT JOIN departments d ON s.dept_id = d.dept_id
             WHERE ${whereClause}
             ORDER BY ${sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT result_status, COUNT(*) AS cnt, AVG(score) AS avg_score
             FROM student_round_results WHERE round_id = $1 GROUP BY result_status`,
            [roundId]
        ),
    ]);

    return {
        results: resultRows.rows.map(mapResultRow),
        total: Number.parseInt(countResult.rows[0]?.total ?? '0', 10),
        page, limit,
        round_name: round.round_name, round_number: round.round_number,
        round_status: round.round_status, is_processed: !!round.is_processed,
        job_title: round.job_title,
        company_name: round.company_name,
        status_summary: buildStatusSummary(summaryResult.rows),
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
    const existing = await verifyResult(resultId, collegeId);
    checkRoundEligibleForResults(existing, 'update');

    // Validate dates (merge existing + new)
    const effectiveScheduled = data.scheduled_at === undefined ? existing.scheduled_at : data.scheduled_at;
    const effectiveCompleted = data.completed_at === undefined ? existing.completed_at : data.completed_at;
    const dateError = validateResultDates(effectiveScheduled, effectiveCompleted);
    if (dateError) {
        throw Object.assign(new Error(dateError), { status: 400 });
    }

    // Build dynamic UPDATE
    const fieldsToUpdate = UPDATABLE_FIELDS.filter(f => data[f] !== undefined);
    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.NO_FIELDS_TO_UPDATE), { status: 400 });
    }

    const setClauses = fieldsToUpdate.map((field, i) => `${field} = $${i + 2}`).join(', ');
    const values = [resultId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE student_round_results SET ${setClauses}
         WHERE result_id = $1 RETURNING ${RESULT_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Round result updated`, {
        resultId, updatedFields: fieldsToUpdate,
        roundId: existing.round_id, studentId: existing.student_id, collegeId,
    });

    return {
        ...result.rows[0],
        score: result.rows[0].score === null ? null : Number.parseFloat(result.rows[0].score),
        student_name: `${existing.first_name} ${existing.last_name}`,
        student_email: existing.student_email,
        round_name: existing.round_name, round_number: existing.round_number,
        job_title: existing.job_title, company_name: existing.company_name,
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
