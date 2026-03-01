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

const { query } = require('../../config/db');
const logger = require('../../config/logger');
const { LOG } = require('../../config/constants');

const MAX_ACTIVITIES = 10;

const ACTIVITY_FIELDS = [
    'activity_name', 'activity_description', 'activity_type',
    'organizing_body', 'role_position', 'start_date', 'end_date',
    'is_ongoing', 'hours_contributed', 'certificate_url', 'proof_urls',
];

// ============================================================================
// 1. ADD ACTIVITY
// ============================================================================

async function addActivity(studentId, collegeId, data) {
    // 1. Check max limit
    const countResult = await query(
        `SELECT COUNT(*) AS cnt FROM student_activities
         WHERE student_id = $1 AND college_id = $2`,
        [studentId, collegeId]
    );

    const currentCount = parseInt(countResult.rows[0].cnt);
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

    // 3. Build insert
    const fieldsToInsert = ACTIVITY_FIELDS.filter(f => data[f] !== undefined);
    const insertColumns = ['student_id', 'college_id', ...fieldsToInsert];
    const insertValues = [studentId, collegeId, ...fieldsToInsert.map(f => data[f])];
    const placeholders = insertValues.map((_, i) => `$${i + 1}`);

    const result = await query(
        `INSERT INTO student_activities (${insertColumns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        insertValues
    );

    logger.info(`${LOG.API_END} Activity added`, {
        studentId,
        activity_id: result.rows[0].activity_id,
        activity_count: currentCount + 1,
    });

    return formatActivity(result.rows[0]);
}

// ============================================================================
// 2. GET ALL ACTIVITIES
// ============================================================================

async function getAllActivities(studentId, collegeId) {
    const result = await query(
        `SELECT * FROM student_activities
         WHERE student_id = $1 AND college_id = $2
         ORDER BY start_date DESC NULLS LAST, created_at DESC`,
        [studentId, collegeId]
    );

    return {
        total_activities: result.rows.length,
        max_activities: MAX_ACTIVITIES,
        activities: result.rows.map(formatActivity),
    };
}

// ============================================================================
// 3. UPDATE ACTIVITY
// ============================================================================

async function updateActivity(activityId, studentId, collegeId, data) {
    if (data.is_ongoing === true) {
        data.end_date = null;
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

    const result = await query(
        `UPDATE student_activities
         SET ${setClauses.join(', ')}
         WHERE activity_id = $1 AND student_id = $2 AND college_id = $3
         RETURNING *`,
        values
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error('Activity not found or does not belong to you'),
            { status: 404 }
        );
    }

    logger.info(`${LOG.API_END} Activity updated`, {
        studentId,
        activity_id: activityId,
    });

    return formatActivity(result.rows[0]);
}

// ============================================================================
// 4. DELETE ACTIVITY
// ============================================================================

async function deleteActivity(activityId, studentId, collegeId) {
    const result = await query(
        `DELETE FROM student_activities
         WHERE activity_id = $1 AND student_id = $2 AND college_id = $3
         RETURNING activity_id, activity_name`,
        [activityId, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error('Activity not found or does not belong to you'),
            { status: 404 }
        );
    }

    logger.info(`${LOG.API_END} Activity deleted`, {
        studentId,
        activity_id: activityId,
        name: result.rows[0].activity_name,
    });

    return result.rows[0];
}

// ============================================================================
// HELPER — Format activity response
// ============================================================================

function formatActivity(record) {
    return {
        activity_id: record.activity_id,
        activity_name: record.activity_name,
        activity_description: record.activity_description,
        activity_type: record.activity_type,
        organizing_body: record.organizing_body,
        role_position: record.role_position,
        start_date: record.start_date,
        end_date: record.end_date,
        is_ongoing: record.is_ongoing,
        hours_contributed: record.hours_contributed,
        certificate_url: record.certificate_url,
        proof_urls: record.proof_urls,
        created_at: record.created_at,
        updated_at: record.updated_at,
    };
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
