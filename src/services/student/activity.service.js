/**
 * ============================================================================
 * STUDENT ACTIVITY SERVICE — CRUD with Max 10 Limit
 * ============================================================================
 * Functions:
 *   - addActivity(studentId, collegeId, data)
 *   - getAllActivities(studentId, collegeId)
 *   - updateActivity(activityId, studentId, collegeId, data)
 *   - deleteActivity(activityId, studentId, collegeId)
 *
 * Business Rules:
 *   - Maximum 10 activities per student
 *   - is_ongoing = true → end_date auto-cleared
 *   - Ownership check on update/delete
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');
const { maybeResetApproval } = require('../../utils/approvalResetHelper');
const { BUCKETS, resolveFileUrls, resolveFileUrl } = require('../../utils/storageHelper');
const { cleanupOldFile, cleanupOldFiles, cleanupRecordFiles } = require('../../utils/fileCleanupHelper');

const MAX_ACTIVITIES = 10;

const ACTIVITY_FIELDS = [
    'activity_name', 'activity_description', 'activity_type',
    'organizing_body', 'role_position', 'start_date', 'end_date',
    'is_ongoing', 'hours_contributed', 'certificate_url', 'proof_urls',
];

const RETURNING_COLUMNS = `activity_id, activity_name, activity_description,
    activity_type, organizing_body, role_position, start_date, end_date,
    is_ongoing, hours_contributed, certificate_url, proof_urls,
    created_at, updated_at`;

// ============================================================================
// 1. ADD ACTIVITY
// ============================================================================

async function addActivity(studentId, collegeId, data) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // 1. Check max limit
        const countResult = await client.query(
            `SELECT COUNT(*) AS cnt FROM student_activities
             WHERE student_id = $1 AND college_id = $2`,
            [studentId, collegeId]
        );

        const currentCount = Number.parseInt(countResult.rows[0].cnt);
        if (currentCount >= MAX_ACTIVITIES) {
            throw Object.assign(
                new Error(`Maximum ${MAX_ACTIVITIES} activities allowed. Please remove an existing one before adding new`),
                { status: 400 }
            );
        }

        // 2. If ongoing, clear end_date
        if (data.is_ongoing === true) {
            data.end_date = null;
        }

        // 3. Validate end_date >= start_date (when both provided and not ongoing)
        if (data.end_date && data.start_date && new Date(data.end_date) < new Date(data.start_date)) {
            throw Object.assign(new Error('End date must be after start date'), { status: 400 });
        }

        // 4. Build insert
        const fieldsToInsert = ACTIVITY_FIELDS.filter(f => data[f] !== undefined);
        const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
        const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];
        const placeholders = insertValues.map((_, i) => `$${i + 1}`);

        const result = await client.query(
            `INSERT INTO student_activities (${insertColumns.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING ${RETURNING_COLUMNS}`,
            insertValues
        );

        // 5. Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'activities');

        await client.query('COMMIT');

        logger.info(`${LOG.API_END} Activity added`, {
            studentId,
            activity_id: result.rows[0].activity_id,
            activity_count: currentCount + 1,
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
// 2. GET ALL ACTIVITIES
// ============================================================================

async function getAllActivities(studentId, collegeId) {
    const result = await query(
        `SELECT ${RETURNING_COLUMNS} FROM student_activities
         WHERE student_id = $1 AND college_id = $2
         ORDER BY start_date DESC NULLS LAST, created_at DESC`,
        [studentId, collegeId]
    );

    // Resolve storage paths to signed download URLs
    await resolveFileUrls(result.rows, [
        { field: 'certificate_url', bucket: BUCKETS.PRIVATE },
    ]);
    // Resolve proof_urls arrays (each row has an array of paths)
    const proofTasks = [];
    for (const row of result.rows) {
        if (Array.isArray(row.proof_urls) && row.proof_urls.length > 0) {
            for (let i = 0; i < row.proof_urls.length; i++) {
                const url = row.proof_urls[i];
                proofTasks.push(
                    resolveFileUrl(url, BUCKETS.PRIVATE).then((resolved) => {
                        row.proof_urls[i] = resolved;
                    })
                );
            }
        }
    }
    if (proofTasks.length > 0) {
        await Promise.all(proofTasks);
    }

    return {
        total_activities: result.rows.length,
        max_activities: MAX_ACTIVITIES,
        activities: result.rows,
    };
}

// ============================================================================
// 3. UPDATE ACTIVITY
// ============================================================================

async function updateActivity(activityId, studentId, collegeId, data) {
    if (data.is_ongoing === true) {
        data.end_date = null;
    }

    // Validate end_date >= start_date (when both provided and not ongoing)
    if (data.end_date && data.start_date && new Date(data.end_date) < new Date(data.start_date)) {
        throw Object.assign(new Error('End date must be after start date'), { status: 400 });
    }

    const fieldsToUpdate = ACTIVITY_FIELDS.filter(f => data[f] !== undefined);

    if (fieldsToUpdate.length === 0) {
        throw Object.assign(new Error('At least one field must be provided to update'), { status: 400 });
    }

    const setClauses = fieldsToUpdate
        .map((field, index) => `${field} = $${index + 4}`)
        .concat(['updated_at = NOW()']);

    const values = [
        activityId, studentId, collegeId,
        ...fieldsToUpdate.map(f => data[f]),
    ];

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Fetch old file paths for cleanup after update
        const oldResult = await client.query(
            `SELECT certificate_url, proof_urls FROM student_activities
             WHERE activity_id = $1 AND student_id = $2 AND college_id = $3 LIMIT 1`,
            [activityId, studentId, collegeId]
        );
        const oldRow = oldResult.rows[0] || {};

        const result = await client.query(
            `UPDATE student_activities
             SET ${setClauses.join(', ')}
             WHERE activity_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING ${RETURNING_COLUMNS}`,
            values
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Activity not found or does not belong to you'),
                { status: 404 }
            );
        }

        // Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'activities');

        await client.query('COMMIT');

        // Cleanup old files if replaced (fire-and-forget, after COMMIT)
        if (data.certificate_url !== undefined) {
            cleanupOldFile(BUCKETS.PRIVATE, oldRow.certificate_url, data.certificate_url);
        }
        if (data.proof_urls !== undefined) {
            cleanupOldFiles(BUCKETS.PRIVATE, oldRow.proof_urls, data.proof_urls);
        }

        logger.info(`${LOG.API_END} Activity updated`, {
            studentId,
            activity_id: activityId,
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
// 4. DELETE ACTIVITY
// ============================================================================

async function deleteActivity(activityId, studentId, collegeId) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `DELETE FROM student_activities
             WHERE activity_id = $1 AND student_id = $2 AND college_id = $3
             RETURNING activity_id, activity_name, certificate_url, proof_urls`,
            [activityId, studentId, collegeId]
        );

        if (!result.rows.length) {
            throw Object.assign(
                new Error('Activity not found or does not belong to you'),
                { status: 404 }
            );
        }

        // Conditionally reset profile approval (respects verification settings)
        await maybeResetApproval(client, studentId, collegeId, 'activities');

        await client.query('COMMIT');

        // Cleanup files from storage (fire-and-forget, after COMMIT)
        cleanupRecordFiles(BUCKETS.PRIVATE, result.rows[0], ['certificate_url', 'proof_urls']);

        logger.info(`${LOG.API_END} Activity deleted`, {
            studentId,
            activity_id: activityId,
            name: result.rows[0].activity_name,
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
    addActivity,
    getAllActivities,
    updateActivity,
    deleteActivity,
};
