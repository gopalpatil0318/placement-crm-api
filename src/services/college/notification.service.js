/**
 * ============================================================================
 * COLLEGE NOTIFICATION SERVICE — Notification Business Logic (College-Side)
 * ============================================================================
 *   - sendNotification(collegeId, userId, data)          — #96
 *   - sendBulkNotification(collegeId, userId, data)      — #97
 *   - getSentNotifications(collegeId, filters)            — #98
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
// 1. SEND NOTIFICATION (targeted — to specific recipient IDs) — #96
// ============================================================================

async function sendNotification(collegeId, userId, data) {
    const {
        recipient_type, recipient_ids, title, body,
        notification_type, related_entity_type, related_entity_id,
    } = data;

    // Validate that recipient IDs actually exist in the college
    const table = recipient_type === 'student' ? 'students' : 'users';
    const idCol = recipient_type === 'student' ? 'student_id' : 'user_id';

    const validResult = await query(
        `SELECT ${idCol} AS id FROM ${table}
         WHERE ${idCol} = ANY($1) AND college_id = $2`,
        [recipient_ids, collegeId]
    );

    const validIds = validResult.rows.map(r => r.id);
    const invalidCount = recipient_ids.length - validIds.length;

    if (validIds.length === 0) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.NO_RECIPIENTS_FOUND),
            { status: 400 }
        );
    }

    // Batch insert using UNNEST
    const insertResult = await query(
        `INSERT INTO notifications
            (college_id, recipient_type, recipient_id, title, body,
             notification_type, related_entity_type, related_entity_id)
         SELECT $1, $2, rid, $3, $4, $5, $6, $7
         FROM UNNEST($8::uuid[]) AS rid`,
        [
            collegeId, recipient_type, title.trim(),
            body ? body.trim() : null,
            notification_type,
            related_entity_type || null,
            related_entity_id || null,
            validIds,
        ]
    );

    logger.info(`${LOG.TRANSACTION} Notifications sent`, {
        college_id: collegeId,
        sent_by: userId,
        type: notification_type,
        sent_count: insertResult.rowCount,
        invalid_count: invalidCount,
    });

    return {
        sent_count: insertResult.rowCount,
        invalid_count: invalidCount,
        notification_type,
        recipient_type,
    };
}

// ============================================================================
// 2. SEND BULK NOTIFICATION (filter-based) — #97
// ============================================================================

async function sendBulkNotification(collegeId, userId, data) {
    const {
        title, body, notification_type,
        related_entity_type, related_entity_id,
        filters,
    } = data;

    const { recipient_type } = filters;

    // Build target recipient list based on filters
    let targetIds;
    if (recipient_type === 'student') {
        targetIds = await getFilteredStudentIds(collegeId, filters);
    } else {
        targetIds = await getFilteredUserIds(collegeId, filters);
    }

    if (targetIds.length === 0) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.NO_RECIPIENTS_FOUND),
            { status: 400 }
        );
    }

    // Batch insert with deduplication (skip if same type+entity+recipient already exists)
    const client = await getClient();
    let sentCount = 0;
    let skippedCount = 0;

    try {
        await client.query('BEGIN');

        // Count already-notified recipients (same type + entity combo)
        if (related_entity_id) {
            const existingResult = await client.query(
                `SELECT COUNT(*) AS cnt FROM notifications
                 WHERE college_id = $1
                   AND recipient_type = $2
                   AND recipient_id = ANY($3)
                   AND notification_type = $4
                   AND related_entity_id = $5`,
                [collegeId, recipient_type, targetIds, notification_type, related_entity_id]
            );
            skippedCount = parseInt(existingResult.rows[0].cnt, 10);
        }

        // Insert with dedup when related_entity_id is present
        let insertResult;
        if (related_entity_id) {
            insertResult = await client.query(
                `INSERT INTO notifications
                    (college_id, recipient_type, recipient_id, title, body,
                     notification_type, related_entity_type, related_entity_id)
                 SELECT $1, $2, rid, $3, $4, $5, $6, $7
                 FROM UNNEST($8::uuid[]) AS rid
                 WHERE NOT EXISTS (
                     SELECT 1 FROM notifications n
                     WHERE n.college_id = $1
                       AND n.recipient_type = $2
                       AND n.recipient_id = rid
                       AND n.notification_type = $5
                       AND n.related_entity_id = $7
                 )`,
                [
                    collegeId, recipient_type, title.trim(),
                    body ? body.trim() : null,
                    notification_type,
                    related_entity_type || null,
                    related_entity_id,
                    targetIds,
                ]
            );
        } else {
            // No entity reference — always insert (e.g., general announcements)
            insertResult = await client.query(
                `INSERT INTO notifications
                    (college_id, recipient_type, recipient_id, title, body,
                     notification_type, related_entity_type, related_entity_id)
                 SELECT $1, $2, rid, $3, $4, $5, $6, $7
                 FROM UNNEST($8::uuid[]) AS rid`,
                [
                    collegeId, recipient_type, title.trim(),
                    body ? body.trim() : null,
                    notification_type,
                    related_entity_type || null,
                    null,
                    targetIds,
                ]
            );
        }

        sentCount = insertResult.rowCount;
        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Bulk notifications sent`, {
            college_id: collegeId,
            sent_by: userId,
            type: notification_type,
            sent_count: sentCount,
            skipped_count: skippedCount,
            total_eligible: targetIds.length,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }

    return {
        sent_count: sentCount,
        skipped_count: skippedCount,
        total_eligible: targetIds.length,
        notification_type,
        recipient_type,
    };
}

// ============================================================================
// HELPER — Get filtered student IDs
// ============================================================================

async function getFilteredStudentIds(collegeId, filters) {
    const conditions = ['s.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Filter: department IDs
    if (filters.dept_ids && filters.dept_ids.length > 0) {
        conditions.push(`s.dept_id = ANY($${paramIndex})`);
        params.push(filters.dept_ids);
        paramIndex++;
    }

    // Filter: passout years
    if (filters.passout_years && filters.passout_years.length > 0) {
        conditions.push(`s.student_passout_year = ANY($${paramIndex})`);
        params.push(filters.passout_years);
        paramIndex++;
    }

    // Filter: student status
    if (filters.student_status) {
        conditions.push(`s.student_status = $${paramIndex}`);
        params.push(filters.student_status);
        paramIndex++;
    }

    // Filter: profile approved
    if (filters.profile_status) {
        conditions.push(`s.profile_is_approved = $${paramIndex}`);
        params.push(filters.profile_status === 'approved');
        paramIndex++;
    }

    // Filter: profile completeness
    if (filters.is_profile_complete === true) {
        conditions.push('s.profile_complete = true');
    } else if (filters.is_profile_complete === false) {
        conditions.push('s.profile_complete = false');
    }

    // Exclude specific IDs
    if (filters.exclude_ids && filters.exclude_ids.length > 0) {
        conditions.push(`s.student_id != ALL($${paramIndex})`);
        params.push(filters.exclude_ids);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');
    const result = await query(
        `SELECT s.student_id AS id FROM students s WHERE ${whereClause}`,
        params
    );

    return result.rows.map(r => r.id);
}

// ============================================================================
// HELPER — Get filtered user IDs
// ============================================================================

async function getFilteredUserIds(collegeId, filters) {
    const conditions = ['u.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Filter: user roles
    if (filters.user_roles && filters.user_roles.length > 0) {
        conditions.push(`u.user_role = ANY($${paramIndex})`);
        params.push(filters.user_roles);
        paramIndex++;
    }

    // Exclude specific IDs
    if (filters.exclude_ids && filters.exclude_ids.length > 0) {
        conditions.push(`u.user_id != ALL($${paramIndex})`);
        params.push(filters.exclude_ids);
        paramIndex++;
    }

    // Only active users
    conditions.push(`u.user_status = 'active'`);

    const whereClause = conditions.join(' AND ');
    const result = await query(
        `SELECT u.user_id AS id FROM users u WHERE ${whereClause}`,
        params
    );

    return result.rows.map(r => r.id);
}

// ============================================================================
// 3. GET SENT NOTIFICATIONS — #98
// ============================================================================

async function getSentNotifications(collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = ['n.college_id = $1'];
    const params = [collegeId];
    let paramIndex = 2;

    // Filter: notification type
    if (filters.notification_type) {
        conditions.push(`n.notification_type = $${paramIndex}`);
        params.push(filters.notification_type);
        paramIndex++;
    }

    // Filter: recipient type
    if (filters.recipient_type) {
        conditions.push(`n.recipient_type = $${paramIndex}`);
        params.push(filters.recipient_type);
        paramIndex++;
    }

    // Filter: search (title or body)
    if (filters.search) {
        conditions.push(
            `(n.title ILIKE $${paramIndex} OR n.body ILIKE $${paramIndex})`
        );
        params.push(`%${filters.search}%`);
        paramIndex++;
    }

    // Filter: date range
    if (filters.date_from) {
        conditions.push(`n.created_at >= $${paramIndex}`);
        params.push(filters.date_from);
        paramIndex++;
    }
    if (filters.date_to) {
        conditions.push(`n.created_at <= $${paramIndex}`);
        params.push(filters.date_to);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns
    const SORTABLE = {
        created_at: 'n.created_at',
        title: 'n.title',
        notification_type: 'n.notification_type',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.created_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Run count, fetch, and summary in parallel (all independent)
    const [countResult, notificationResult, summaryResult] = await Promise.all([
        // Group notifications by batch count
        query(
            `SELECT COUNT(DISTINCT (n.title, n.notification_type, DATE_TRUNC('second', n.created_at))) AS total
             FROM notifications n
             WHERE ${whereClause}`,
            params
        ),

        // Aggregated sent notifications — grouped by batch
        query(
            `SELECT
                 n.title,
                 n.body,
                 n.notification_type,
                 n.recipient_type,
                 n.related_entity_type,
                 n.related_entity_id,
                 DATE_TRUNC('second', n.created_at) AS sent_at,
                 COUNT(*) AS total_recipients,
                 COUNT(*) FILTER (WHERE n.is_read = true) AS read_count,
                 COUNT(*) FILTER (WHERE n.is_read = false) AS unread_count
             FROM notifications n
             WHERE ${whereClause}
             GROUP BY n.title, n.body, n.notification_type, n.recipient_type,
                      n.related_entity_type, n.related_entity_id,
                      DATE_TRUNC('second', n.created_at)
             ORDER BY ${sortCol === 'n.created_at' ? 'sent_at' : sortCol} ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),

        // Summary stats
        query(
            `SELECT
                 COUNT(*) AS total_sent,
                 COUNT(DISTINCT recipient_id) AS unique_recipients,
                 COUNT(*) FILTER (WHERE is_read = true) AS total_read,
                 COUNT(*) FILTER (WHERE is_read = false) AS total_unread,
                 COUNT(*) FILTER (WHERE notification_type = 'general') AS general_count,
                 COUNT(*) FILTER (WHERE notification_type = 'new_job_posted') AS job_posted_count,
                 COUNT(*) FILTER (WHERE notification_type = 'deadline_reminder') AS deadline_reminder_count,
                 COUNT(*) FILTER (WHERE notification_type = 'round_result') AS round_result_count,
                 COUNT(*) FILTER (WHERE notification_type = 'offer_received') AS offer_received_count,
                 COUNT(*) FILTER (WHERE notification_type = 'restriction_applied') AS restriction_count,
                 COUNT(*) FILTER (WHERE notification_type = 'training_enrollment') AS training_count
             FROM notifications
             WHERE college_id = $1`,
            [collegeId]
        ),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    const stats = summaryResult.rows[0];

    const notifications = notificationResult.rows.map(row => ({
        title: row.title,
        body: row.body || null,
        notification_type: row.notification_type,
        recipient_type: row.recipient_type,
        related_entity_type: row.related_entity_type || null,
        related_entity_id: row.related_entity_id || null,
        sent_at: row.sent_at,
        total_recipients: parseInt(row.total_recipients, 10),
        read_count: parseInt(row.read_count, 10),
        unread_count: parseInt(row.unread_count, 10),
    }));

    return {
        notifications,
        total,
        page,
        limit,
        summary: {
            total_sent: parseInt(stats.total_sent, 10),
            unique_recipients: parseInt(stats.unique_recipients, 10),
            total_read: parseInt(stats.total_read, 10),
            total_unread: parseInt(stats.total_unread, 10),
            by_type: {
                general: parseInt(stats.general_count, 10),
                new_job_posted: parseInt(stats.job_posted_count, 10),
                deadline_reminder: parseInt(stats.deadline_reminder_count, 10),
                round_result: parseInt(stats.round_result_count, 10),
                offer_received: parseInt(stats.offer_received_count, 10),
                restriction_applied: parseInt(stats.restriction_count, 10),
                training_enrollment: parseInt(stats.training_count, 10),
            },
        },
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    sendNotification,
    sendBulkNotification,
    getSentNotifications,
};
