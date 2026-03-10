/**
 * ============================================================================
 * JOB ROUND SERVICE — Selection Round Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - addRound(jobId, collegeId, data)
 *   - updateRound(roundId, collegeId, data)
 *   - updateRoundStatus(roundId, collegeId, newStatus)
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// Updatable fields (round_number is auto-calculated, never user-editable)
const FIELDS = ['round_name', 'round_description', 'round_type', 'round_date', 'round_venue'];

// Valid round status transitions
const VALID_TRANSITIONS = {
    pending: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'cancelled'],
    completed: [],    // terminal
    cancelled: [],    // terminal
};

// ============================================================================
// HELPER — Verify job exists and belongs to college
// ============================================================================

async function verifyJob(jobId, collegeId) {
    const result = await query(
        `SELECT j.job_id, j.job_title, j.job_status, c.company_name
         FROM job_postings j
         JOIN companies c ON j.company_id = c.company_id
         WHERE j.job_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [jobId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.JOB_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Verify round exists and belongs to college
// ============================================================================

async function verifyRound(roundId, collegeId) {
    const result = await query(
        `SELECT r.*, j.job_title, j.job_status, j.college_id, c.company_name
         FROM job_rounds r
         JOIN job_postings j ON r.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE r.round_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [roundId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Format round for response
// ============================================================================

function formatRound(record) {
    return {
        round_id: record.round_id,
        job_id: record.job_id,
        round_number: record.round_number,
        round_name: record.round_name,
        round_description: record.round_description ?? null,
        round_type: record.round_type ?? null,
        round_date: record.round_date ?? null,
        round_venue: record.round_venue ?? null,
        round_status: record.round_status,
        created_at: record.created_at,
        // Joined fields (when available)
        ...(record.job_title !== undefined && { job_title: record.job_title }),
        ...(record.company_name !== undefined && { company_name: record.company_name }),
    };
}

// ============================================================================
// 1. ADD ROUND
// ============================================================================

/**
 * Add a new selection round to an existing job posting.
 * round_number is auto-calculated as MAX existing + 1.
 * Cannot add to cancelled jobs.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Created round
 */
async function addRound(jobId, collegeId, data) {
    // 1. Verify job exists and belongs to college
    const job = await verifyJob(jobId, collegeId);

    // 2. Cannot add rounds to cancelled jobs
    if (job.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error('Cannot add rounds to a cancelled job'),
            { status: 400 }
        );
    }

    // 3. Check duplicate + calculate next round_number in parallel
    const [duplicateCheck, maxResult] = await Promise.all([
        query(
            `SELECT round_id FROM job_rounds
             WHERE job_id = $1 AND LOWER(round_name) = LOWER($2)
             LIMIT 1`,
            [jobId, data.round_name]
        ),
        query(
            `SELECT COALESCE(MAX(round_number), 0) AS max_number
             FROM job_rounds WHERE job_id = $1`,
            [jobId]
        ),
    ]);

    if (duplicateCheck.rows.length) {
        throw Object.assign(
            new Error(`Round "${data.round_name}" already exists for this job`),
            { status: 409 }
        );
    }

    const nextRoundNumber = parseInt(maxResult.rows[0].max_number, 10) + 1;

    // 5. Insert the round
    const result = await query(
        `INSERT INTO job_rounds (job_id, round_number, round_name, round_description, round_type, round_date, round_venue)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            jobId,
            nextRoundNumber,
            data.round_name,
            data.round_description ?? null,
            data.round_type ?? null,
            data.round_date ?? null,
            data.round_venue ?? null,
        ]
    );

    logger.info(`${LOG.AUTH} Round added to job`, {
        roundId: result.rows[0].round_id,
        jobId,
        roundNumber: nextRoundNumber,
        roundName: data.round_name,
        collegeId,
    });

    return formatRound({
        ...result.rows[0],
        job_title: job.job_title,
        company_name: job.company_name,
    });
}

// ============================================================================
// 2. UPDATE ROUND
// ============================================================================

/**
 * Update round details (name, description, type, date, venue).
 * Cannot edit rounds in cancelled jobs.
 * Cannot edit completed or cancelled rounds.
 *
 * @param {string} roundId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated round
 */
async function updateRound(roundId, collegeId, data) {
    // 1. Verify round and job
    const existing = await verifyRound(roundId, collegeId);

    // 2. Cannot edit in cancelled jobs
    if (existing.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error('Cannot edit rounds in a cancelled job'),
            { status: 400 }
        );
    }

    // 3. Cannot edit completed or cancelled rounds
    if (existing.round_status === STATUS.ROUND.COMPLETED || existing.round_status === STATUS.ROUND.CANCELLED) {
        throw Object.assign(
            new Error(`Cannot edit a round that is "${existing.round_status}"`),
            { status: 400 }
        );
    }

    // 4. If name is changing, check for duplicates
    if (data.round_name && data.round_name.toLowerCase() !== existing.round_name.toLowerCase()) {
        const duplicateCheck = await query(
            `SELECT round_id FROM job_rounds
             WHERE job_id = $1 AND LOWER(round_name) = LOWER($2) AND round_id != $3
             LIMIT 1`,
            [existing.job_id, data.round_name, roundId]
        );

        if (duplicateCheck.rows.length) {
            throw Object.assign(
                new Error(`Round "${data.round_name}" already exists for this job`),
                { status: 409 }
            );
        }
    }

    // 5. Build dynamic UPDATE
    const fieldsToUpdate = FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error('No valid fields provided for update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 2}`)
        .join(', ');
    const values = [roundId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE job_rounds
         SET ${setClauses}
         WHERE round_id = $1
         RETURNING *`,
        values
    );

    logger.info(`${LOG.AUTH} Round updated`, {
        roundId,
        updatedFields: fieldsToUpdate,
        jobId: existing.job_id,
        collegeId,
    });

    return formatRound({
        ...result.rows[0],
        job_title: existing.job_title,
        company_name: existing.company_name,
    });
}

// ============================================================================
// 3. UPDATE ROUND STATUS
// ============================================================================

/**
 * Change round status with enforced transitions:
 *   pending     → in_progress, cancelled
 *   in_progress → completed, cancelled
 *   completed   → (terminal)
 *   cancelled   → (terminal)
 *
 * Cannot modify rounds in cancelled jobs.
 *
 * @param {string} roundId
 * @param {string} collegeId
 * @param {string} newStatus
 * @returns {Object} Updated round
 */
async function updateRoundStatus(roundId, collegeId, newStatus) {
    // 1. Verify round
    const existing = await verifyRound(roundId, collegeId);

    // 2. Cannot modify in cancelled jobs
    if (existing.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error('Cannot modify rounds in a cancelled job'),
            { status: 400 }
        );
    }

    // 3. Same status check
    if (existing.round_status === newStatus) {
        throw Object.assign(
            new Error(`Round is already "${newStatus}"`),
            { status: 400 }
        );
    }

    // 4. Validate transition
    const allowedTransitions = VALID_TRANSITIONS[existing.round_status] ?? [];
    if (!allowedTransitions.includes(newStatus)) {
        throw Object.assign(
            new Error(
                `Cannot change round status from "${existing.round_status}" to "${newStatus}". ` +
                `Allowed transitions: ${allowedTransitions.length ? allowedTransitions.join(', ') : 'none (terminal state)'}`
            ),
            { status: 400 }
        );
    }

    // 5. Update
    const result = await query(
        `UPDATE job_rounds
         SET round_status = $1
         WHERE round_id = $2
         RETURNING *`,
        [newStatus, roundId]
    );

    logger.info(`${LOG.AUTH} Round status changed`, {
        roundId,
        previousStatus: existing.round_status,
        newStatus,
        jobId: existing.job_id,
        collegeId,
    });

    return formatRound({
        ...result.rows[0],
        job_title: existing.job_title,
        company_name: existing.company_name,
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addRound,
    updateRound,
    updateRoundStatus,
};
