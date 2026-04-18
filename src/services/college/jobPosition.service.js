/**
 * ============================================================================
 * JOB POSITION SERVICE — Position Management (COLLEGEADMIN / TPO)
 * ============================================================================
 *   - addPosition(jobId, collegeId, data)
 *   - updatePosition(positionId, collegeId, data)
 *   - updatePositionStatus(positionId, collegeId, newStatus)
 * ============================================================================
 */

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

// Explicit columns for RETURNING / SELECT (no wildcard)
const POSITION_RETURNING_COLUMNS = [
    'position_id', 'job_id', 'position_name', 'position_description',
    'vacancies', 'position_status', 'created_at',
].join(', ');

// Updatable fields
const FIELDS = ['position_name', 'position_description', 'vacancies'];

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
// HELPER — Verify position exists and belongs to college
// ============================================================================

async function verifyPosition(positionId, collegeId) {
    const result = await query(
        `SELECT p.position_id, p.job_id, p.position_name, p.position_description,
                p.vacancies, p.position_status, p.created_at,
                j.job_title, j.job_status, j.college_id, c.company_name
         FROM job_positions p
         JOIN job_postings j ON p.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE p.position_id = $1 AND j.college_id = $2
         LIMIT 1`,
        [positionId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.POSITION_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Format position for response
// ============================================================================

function formatPosition(record) {
    return {
        position_id: record.position_id,
        job_id: record.job_id,
        position_name: record.position_name,
        position_description: record.position_description || null,
        vacancies: record.vacancies,
        position_status: record.position_status,
        created_at: record.created_at,
        // Joined fields (when available)
        ...(record.job_title !== undefined && { job_title: record.job_title }),
        ...(record.company_name !== undefined && { company_name: record.company_name }),
        ...(record.applications_count !== undefined && {
            applications_count: Number.parseInt(record.applications_count, 10),
        }),
    };
}

// ============================================================================
// 1. ADD POSITION
// ============================================================================

/**
 * Add a new position to an existing job posting.
 * Cannot add to cancelled jobs.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Created position
 */
async function addPosition(jobId, collegeId, data) {
    // 1. Verify job exists
    const job = await verifyJob(jobId, collegeId);

    // 2. Cannot add to cancelled jobs
    if (job.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_ADD_POSITION_CANCELLED_JOB),
            { status: 400 }
        );
    }

    // 3. Check duplicate position name within this job
    const duplicateCheck = await query(
        `SELECT position_id FROM job_positions
         WHERE job_id = $1 AND LOWER(position_name) = LOWER($2)
         LIMIT 1`,
        [jobId, data.position_name]
    );

    if (duplicateCheck.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.POSITION_DUPLICATE_NAME),
            { status: 409 }
        );
    }

    // 4. Insert
    const result = await query(
        `INSERT INTO job_positions (job_id, position_name, position_description, vacancies)
         VALUES ($1, $2, $3, $4)
         RETURNING ${POSITION_RETURNING_COLUMNS}`,
        [jobId, data.position_name, data.position_description ?? null, data.vacancies ?? null]
    );

    logger.info(`${LOG.AUTH} Position added to job`, {
        positionId: result.rows[0].position_id,
        jobId,
        positionName: data.position_name,
        collegeId,
    });

    return formatPosition({
        ...result.rows[0],
        job_title: job.job_title,
        company_name: job.company_name,
    });
}

// ============================================================================
// 2. UPDATE POSITION
// ============================================================================

/**
 * Update position details. Cannot edit positions in cancelled jobs.
 *
 * @param {string} positionId
 * @param {string} collegeId
 * @param {Object} data
 * @returns {Object} Updated position
 */
async function updatePosition(positionId, collegeId, data) {
    // 1. Verify position and job
    const existing = await verifyPosition(positionId, collegeId);

    // 2. Cannot edit in cancelled jobs
    if (existing.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_EDIT_POSITION_CANCELLED_JOB),
            { status: 400 }
        );
    }

    // 3. If name changing, check duplicate
    if (data.position_name && data.position_name.toLowerCase() !== existing.position_name.toLowerCase()) {
        const duplicateCheck = await query(
            `SELECT position_id FROM job_positions
             WHERE job_id = $1 AND LOWER(position_name) = LOWER($2) AND position_id != $3
             LIMIT 1`,
            [existing.job_id, data.position_name, positionId]
        );

        if (duplicateCheck.rows.length) {
            throw Object.assign(
                new Error(ERROR_MESSAGES.POSITION_DUPLICATE_NAME),
                { status: 409 }
            );
        }
    }

    // 4. If vacancies changing, ensure not reducing below active offers
    if (data.vacancies !== undefined && data.vacancies < existing.vacancies) {
        const activeOffers = await query(
            `SELECT COUNT(*) AS cnt FROM placement_results
             WHERE position_id = $1 AND placement_status IN ('offered', 'accepted', 'joined')`,
            [positionId]
        );
        const activeCount = Number.parseInt(activeOffers.rows[0]?.cnt ?? '0', 10);
        if (data.vacancies < activeCount) {
            throw Object.assign(
                new Error(`Cannot reduce vacancies to ${data.vacancies} — there are ${activeCount} active offers/placements for this position`),
                { status: 400 }
            );
        }
    }

    // 5. Build dynamic UPDATE
    const fieldsToUpdate = FIELDS.filter(f => data[f] !== undefined);

    if (!fieldsToUpdate.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.NO_FIELDS_TO_UPDATE), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 2}`)
        .join(', ');
    const values = [positionId, ...fieldsToUpdate.map(f => data[f])];

    const result = await query(
        `UPDATE job_positions
         SET ${setClauses}
         WHERE position_id = $1
         RETURNING ${POSITION_RETURNING_COLUMNS}`,
        values
    );

    logger.info(`${LOG.AUTH} Position updated`, {
        positionId,
        updatedFields: fieldsToUpdate,
        jobId: existing.job_id,
        collegeId,
    });

    return formatPosition({
        ...result.rows[0],
        job_title: existing.job_title,
        company_name: existing.company_name,
    });
}

// ============================================================================
// 3. UPDATE POSITION STATUS
// ============================================================================

/**
 * Change position status (active / inactive / filled).
 * Cannot modify positions in cancelled jobs.
 *
 * @param {string} positionId
 * @param {string} collegeId
 * @param {string} newStatus
 * @returns {Object} Updated position
 */
async function updatePositionStatus(positionId, collegeId, newStatus) {
    // 1. Verify position
    const existing = await verifyPosition(positionId, collegeId);

    // 2. Cannot modify in cancelled jobs
    if (existing.job_status === STATUS.JOB.CANCELLED) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.CANNOT_MODIFY_POSITION_CANCELLED_JOB),
            { status: 400 }
        );
    }

    // 3. Same status?
    if (existing.position_status === newStatus) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.POSITION_ALREADY_STATUS),
            { status: 400 }
        );
    }

    // 4. Update
    const result = await query(
        `UPDATE job_positions
         SET position_status = $1
         WHERE position_id = $2
         RETURNING ${POSITION_RETURNING_COLUMNS}`,
        [newStatus, positionId]
    );

    logger.info(`${LOG.AUTH} Position status changed`, {
        positionId,
        previousStatus: existing.position_status,
        newStatus,
        jobId: existing.job_id,
        collegeId,
    });

    return formatPosition({
        ...result.rows[0],
        job_title: existing.job_title,
        company_name: existing.company_name,
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addPosition,
    updatePosition,
    updatePositionStatus,
};
