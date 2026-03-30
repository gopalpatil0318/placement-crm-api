/**
 * ============================================================================
 * STUDENT NOTIFICATION SERVICE — Notification Business Logic (Student-Side)
 * ============================================================================
 *   - getMyNotifications(studentId, collegeId, filters)              — #168
 *   - getUnreadCount(studentId, collegeId)                           — #169
 *   - markAsRead(notificationId, studentId, collegeId)               — #170
 *   - markAllAsRead(studentId, collegeId)                            — #171
 * ============================================================================
 */

const { query } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const {
    ERROR_MESSAGES,
    STATUS,
} = require('../../config/constants');

const { RECIPIENT_TYPE } = STATUS;

// ============================================================================
// 1. GET MY NOTIFICATIONS — #168
// ============================================================================

async function getMyNotifications(studentId, collegeId, filters = {}) {
    const { page, limit, offset } = getPagination(filters);

    const conditions = [
        `n.recipient_type = $1`,
        'n.recipient_id = $2',
        'n.college_id = $3',
    ];
    const params = [RECIPIENT_TYPE.STUDENT, studentId, collegeId];
    let paramIndex = 4;

    // Filter: is_read (true/false)
    if (filters.is_read !== undefined && filters.is_read !== null) {
        conditions.push(`n.is_read = $${paramIndex}`);
        params.push(filters.is_read);
        paramIndex++;
    }

    // Filter: notification_type
    if (filters.notification_type) {
        conditions.push(`n.notification_type = $${paramIndex}`);
        params.push(filters.notification_type);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Count + fetch in parallel (both independent)
    const [countResult, notificationResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total FROM notifications n WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT
                 n.notification_id,
                 n.title,
                 n.body,
                 n.notification_type,
                 n.related_entity_type,
                 n.related_entity_id,
                 n.is_read,
                 n.read_at,
                 n.created_at
             FROM notifications n
             WHERE ${whereClause}
             ORDER BY n.created_at ${sortOrd}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0]?.total ?? '0', 10);

    const notifications = notificationResult.rows.map(row => ({
        notification_id: row.notification_id,
        title: row.title,
        body: row.body || null,
        notification_type: row.notification_type,
        related_entity_type: row.related_entity_type || null,
        related_entity_id: row.related_entity_id || null,
        is_read: row.is_read,
        read_at: row.read_at || null,
        created_at: row.created_at,
    }));

    return { notifications, total, page, limit };
}

// ============================================================================
// 2. GET UNREAD COUNT — #169
// ============================================================================

async function getUnreadCount(studentId, collegeId) {
    const result = await query(
        `SELECT COUNT(*) AS unread_count
         FROM notifications
         WHERE recipient_type = $1
           AND recipient_id = $2
           AND college_id = $3
           AND is_read = false`,
        [RECIPIENT_TYPE.STUDENT, studentId, collegeId]
    );

    return {
        unread_count: Number.parseInt(result.rows[0]?.unread_count ?? '0', 10),
    };
}

// ============================================================================
// 3. MARK AS READ — #170
// ============================================================================

async function markAsRead(notificationId, studentId, collegeId) {
    // Verify ownership + update in single query
    const result = await query(
        `UPDATE notifications
         SET is_read = true,
             read_at = NOW()
         WHERE notification_id = $1
           AND recipient_type = $2
           AND recipient_id = $3
           AND college_id = $4
         RETURNING notification_id, title, notification_type, is_read, read_at`,
        [notificationId, RECIPIENT_TYPE.STUDENT, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(
            new Error(ERROR_MESSAGES.NOTIFICATION_NOT_FOUND),
            { status: 404 }
        );
    }

    return result.rows[0];
}

// ============================================================================
// 4. MARK ALL AS READ — #171
// ============================================================================

async function markAllAsRead(studentId, collegeId) {
    const result = await query(
        `UPDATE notifications
         SET is_read = true,
             read_at = NOW()
         WHERE recipient_type = $1
           AND recipient_id = $2
           AND college_id = $3
           AND is_read = false`,
        [RECIPIENT_TYPE.STUDENT, studentId, collegeId]
    );

    return {
        marked_count: result.rowCount,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getMyNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
};
