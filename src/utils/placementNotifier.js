/**
 * ============================================================================
 * PLACEMENT NOTIFIER — Centralized Fire-and-Forget Notification Utility
 * ============================================================================
 * All placement lifecycle events route through this utility.
 * Every function is fire-and-forget: failures are logged but never thrown.
 *
 * Functions:
 *   notifyStudents(db, collegeId, notifications[])
 *   notifyAdmins(db, collegeId, notifications[])
 *   notifyJobPublished(collegeId, jobId, jobTitle, companyName)
 *   notifyRoundScheduled(collegeId, jobId, roundId, roundName, roundDate, jobTitle, companyName)
 *   notifyOfferCreated(db, collegeId, studentId, placementId, jobTitle, companyName, offerExpiresAt)
 *   notifyOfferAccepted(db, collegeId, studentId, placementId, jobTitle, companyName)
 *   notifyExpiringOffers(collegeId)
 * ============================================================================
 */

const { query } = require('../config/db');
const logger = require('../config/logger');
const { LOG, NOTIFICATION_TYPE, RECIPIENT_TYPE } = require('../config/constants');

// ============================================================================
// HELPERS
// ============================================================================

/** Safe date formatter — returns 'TBD' on invalid/null dates instead of crashing. */
function safeFormatDate(date, options = {}) {
    if (!date) return 'TBD';
    try {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return 'TBD';
        return d.toLocaleDateString('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric',
            timeZone: 'Asia/Kolkata',
            ...options,
        });
    } catch {
        return 'TBD';
    }
}

/** Safe date+time formatter for expiry timestamps. */
function safeFormatDateTime(date) {
    if (!date) return 'TBD';
    try {
        const d = new Date(date);
        if (Number.isNaN(d.getTime())) return 'TBD';
        return d.toLocaleString('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'Asia/Kolkata',
        });
    } catch {
        return 'TBD';
    }
}

// ============================================================================
// CORE — Batch insert notifications (works with standalone query or txn client)
// ============================================================================

/**
 * Batch INSERT notifications. Works inside or outside a transaction.
 * Fire-and-forget: logs errors but never throws.
 *
 * @param {Object} db - Either `{ query }` module or a PG client in transaction
 * @param {{ college_id, recipient_type, recipient_id, title, body, notification_type, related_entity_type, related_entity_id }[]} rows
 */
async function batchInsert(db, rows) {
    if (!rows.length) return;

    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const vals = batch.map((_, j) => {
            const o = j * 8;
            return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
        }).join(', ');
        const params = batch.flatMap(n => [
            n.college_id, n.recipient_type, n.recipient_id,
            n.title, n.body, n.notification_type,
            n.related_entity_type, n.related_entity_id,
        ]);

        await db.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             VALUES ${vals}`,
            params
        );
    }
}

// ============================================================================
// HELPERS — Build notification rows for students / admins
// ============================================================================

/**
 * Insert notifications for a list of student recipients. Fire-and-forget.
 * @param {Object} db - query module or PG client
 * @param {string} collegeId
 * @param {{ student_id, title, body, notification_type, entity_type, entity_id }[]} notifications
 */
async function notifyStudents(db, collegeId, notifications) {
    try {
        const rows = notifications.map(n => ({
            college_id: collegeId,
            recipient_type: RECIPIENT_TYPE.STUDENT,
            recipient_id: n.student_id,
            title: n.title,
            body: n.body,
            notification_type: n.notification_type,
            related_entity_type: n.entity_type ?? null,
            related_entity_id: n.entity_id ?? null,
        }));
        await batchInsert(db, rows);
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyStudents failed`, { collegeId, error: error.message });
    }
}

/**
 * Insert notifications for all active college admins (collegeadmin + tpo). Fire-and-forget.
 * @param {Object} db - query module or PG client
 * @param {string} collegeId
 * @param {{ title, body, notification_type, entity_type, entity_id }} notification - Single notification to send to all admins
 */
async function notifyAdmins(db, collegeId, notification) {
    try {
        await db.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             SELECT $1, $2, u.user_id, $3, $4, $5, $6, $7
             FROM users u
             WHERE u.college_id = $1
               AND u.user_role IN ('collegeadmin', 'tpo')
               AND u.user_status = 'active'`,
            [
                collegeId,
                RECIPIENT_TYPE.USER,
                notification.title,
                notification.body,
                notification.notification_type,
                notification.entity_type ?? null,
                notification.entity_id ?? null,
            ]
        );
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyAdmins failed`, { collegeId, error: error.message });
    }
}

// ============================================================================
// EVENT: JOB PUBLISHED — Notify all active students in the college
// ============================================================================

/**
 * Notify all active students in the college that a new job has been published.
 * Called after updateJobStatus COMMIT, so fire-and-forget with standalone query.
 */
async function notifyJobPublished(collegeId, jobId, jobTitle, companyName) {
    try {
        await query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             SELECT $1, $2, s.student_id, $3, $4, $5, $6, $7
             FROM students s
             WHERE s.college_id = $1
               AND s.student_status = 'active'`,
            [
                collegeId,
                RECIPIENT_TYPE.STUDENT,
                `New Job: ${jobTitle}`,
                `${companyName} has posted a new opportunity — ${jobTitle}. Check eligibility and apply before the deadline.`,
                NOTIFICATION_TYPE.NEW_JOB_POSTED,
                'job',
                jobId,
            ]
        );

        logger.info(`${LOG.AUTH} Job-published notifications sent`, { collegeId, jobId });
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyJobPublished failed`, { collegeId, jobId, error: error.message });
    }
}

// ============================================================================
// EVENT: ROUND SCHEDULED — Notify students who applied to the job
// ============================================================================

/**
 * Notify all students who have active applications for this job.
 * Called after addRound completes.
 */
async function notifyRoundScheduled(collegeId, jobId, roundId, roundName, roundDate, jobTitle, companyName) {
    try {
        const dateStr = safeFormatDate(roundDate);
        const dateInfo = roundDate ? ` on ${dateStr}` : '';

        await query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             SELECT $1, $2, a.student_id, $3, $4, $5, $6, $7
             FROM student_applications a
             WHERE a.job_id = $8
               AND a.college_id = $1
               AND a.application_status NOT IN ('rejected', 'withdrawn', 'auto_withdrawn')
               AND NOT EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.related_entity_id = $7
                     AND n.notification_type = $5
                     AND n.recipient_id = a.student_id
               )`,
            [
                collegeId,
                RECIPIENT_TYPE.STUDENT,
                `Round Scheduled: ${roundName}`,
                `A new selection round "${roundName}" has been scheduled${dateInfo} for ${jobTitle} at ${companyName}.`,
                NOTIFICATION_TYPE.ROUND_SCHEDULED,
                'round',
                roundId,
                jobId,
            ]
        );

        logger.info(`${LOG.AUTH} Round-scheduled notifications sent`, { collegeId, jobId, roundId });
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyRoundScheduled failed`, { collegeId, jobId, roundId, error: error.message });
    }
}

// ============================================================================
// EVENT: OFFER CREATED — Notify student they received a placement offer
// ============================================================================

/**
 * Notify the student that they have received a placement offer.
 * Called AFTER transaction COMMIT — uses standalone query, fire-and-forget.
 */
async function notifyOfferCreated(collegeId, studentId, placementId, jobTitle, companyName, offerExpiresAt) {
    try {
        const expiryStr = offerExpiresAt
            ? ` You have until ${safeFormatDate(offerExpiresAt)} to respond.`
            : '';

        await notifyStudents({ query }, collegeId, [{
            student_id: studentId,
            title: `Offer Received: ${jobTitle}`,
            body: `Congratulations! You have received a placement offer from ${companyName} for ${jobTitle}.${expiryStr}`,
            notification_type: NOTIFICATION_TYPE.OFFER_RECEIVED,
            entity_type: 'placement',
            entity_id: placementId,
        }]);
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyOfferCreated failed`, { collegeId, studentId, placementId, error: error.message });
    }
}

// ============================================================================
// EVENT: OFFER ACCEPTED — Notify college admins
// ============================================================================

/**
 * Notify college admins that a student accepted their offer.
 * Called AFTER transaction COMMIT — uses standalone query, fire-and-forget.
 */
async function notifyOfferAccepted(collegeId, studentId, placementId, jobTitle, companyName) {
    try {
        // Get student name for the admin notification
        const studentResult = await query(
            `SELECT first_name, last_name FROM students WHERE student_id = $1`,
            [studentId]
        );
        const studentName = studentResult.rows[0]
            ? `${studentResult.rows[0].first_name} ${studentResult.rows[0].last_name}`
            : 'A student';

        await notifyAdmins({ query }, collegeId, {
            title: `Offer Accepted: ${jobTitle}`,
            body: `${studentName} has accepted the placement offer from ${companyName} for ${jobTitle}.`,
            notification_type: NOTIFICATION_TYPE.OFFER_ACCEPTED,
            entity_type: 'placement',
            entity_id: placementId,
        });
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyOfferAccepted failed`, { collegeId, studentId, placementId, error: error.message });
    }
}

// ============================================================================
// EVENT: OFFER EXPIRING — Proactive 24-hour reminder for expiring offers
// ============================================================================

// TTL cache to avoid sending duplicate reminders within the same sweep period
const _expiringCache = new Map(); // collegeId → timestamp
const EXPIRING_SWEEP_TTL = 3_600_000; // 1 hour — only check once per hour

// Prevent unbounded Map growth
setInterval(() => _expiringCache.clear(), 3_600_000).unref();

/**
 * Send "offer expiring soon" reminders for offers expiring within 24 hours.
 * Uses a dedup check: only sends if no OFFER_EXPIRING notification was already
 * sent for that placement in the last 24 hours.
 *
 * Called from sweepExpiredOffers or scheduled job.
 */
async function notifyExpiringOffers(collegeId) {
    const lastCheck = _expiringCache.get(collegeId);
    if (lastCheck && Date.now() - lastCheck < EXPIRING_SWEEP_TTL) {
        return 0;
    }
    _expiringCache.set(collegeId, Date.now());

    try {
        // Find offers expiring in the next 24 hours that haven't been notified yet
        const result = await query(
            `SELECT pr.placement_id, pr.student_id, pr.offer_expires_at,
                    j.job_title, c.company_name
             FROM placement_results pr
             JOIN job_postings j ON pr.job_id = j.job_id
             JOIN companies c ON pr.company_id = c.company_id
             WHERE pr.college_id = $1
               AND pr.placement_status = 'offered'
               AND pr.offer_expires_at IS NOT NULL
               AND pr.offer_expires_at > NOW()
               AND pr.offer_expires_at <= NOW() + INTERVAL '24 hours'
               AND NOT EXISTS (
                   SELECT 1 FROM notifications n
                   WHERE n.college_id = $1
                     AND n.related_entity_id = pr.placement_id
                     AND n.notification_type = $2
                     AND n.created_at > NOW() - INTERVAL '24 hours'
               )`,
            [collegeId, NOTIFICATION_TYPE.OFFER_EXPIRING]
        );

        if (result.rowCount === 0) return 0;

        const notifications = result.rows.map(r => {
            const expiryDate = safeFormatDateTime(r.offer_expires_at);
            return {
                student_id: r.student_id,
                title: `Offer Expiring Soon: ${r.job_title}`,
                body: `Your placement offer from ${r.company_name} for ${r.job_title} expires on ${expiryDate} IST. Please respond before the deadline.`,
                notification_type: NOTIFICATION_TYPE.OFFER_EXPIRING,
                entity_type: 'placement',
                entity_id: r.placement_id,
            };
        });

        await notifyStudents({ query }, collegeId, notifications);

        logger.info(`${LOG.AUTH} Expiring-offer reminders sent`, {
            collegeId, count: result.rowCount,
        });

        return result.rowCount;
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyExpiringOffers failed`, { collegeId, error: error.message });
        return 0;
    }
}

// ============================================================================
// EVENT: OFFER DECLINED — Notify college admins that a student declined
// ============================================================================

/**
 * Notify college admins that a student declined their offer.
 * Called AFTER transaction COMMIT — uses standalone query, fire-and-forget.
 */
async function notifyOfferDeclined(collegeId, studentId, placementId, jobTitle, companyName) {
    try {
        const studentResult = await query(
            `SELECT first_name, last_name FROM students WHERE student_id = $1`,
            [studentId]
        );
        const studentName = studentResult.rows[0]
            ? `${studentResult.rows[0].first_name} ${studentResult.rows[0].last_name}`
            : 'A student';

        await notifyAdmins({ query }, collegeId, {
            title: `Offer Declined: ${jobTitle}`,
            body: `${studentName} has declined the placement offer from ${companyName} for ${jobTitle}. The position slot has been reopened.`,
            notification_type: NOTIFICATION_TYPE.OFFER_REVOKED,
            entity_type: 'placement',
            entity_id: placementId,
        });
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyOfferDeclined failed`, { collegeId, studentId, placementId, error: error.message });
    }
}

// ============================================================================
// EVENT: STUDENT SELECTED — Notify student they've been selected
// ============================================================================

/**
 * Notify a student that their application has been selected.
 * Called AFTER transaction COMMIT — uses standalone query, fire-and-forget.
 */
async function notifyStudentSelected(collegeId, studentId, applicationId, jobTitle, companyName) {
    try {
        await notifyStudents({ query }, collegeId, [{
            student_id: studentId,
            title: `Selected: ${jobTitle}`,
            body: `Congratulations! You have been selected for ${jobTitle} at ${companyName}. Your offer details will be shared soon.`,
            notification_type: NOTIFICATION_TYPE.APPLICATION_STATUS_CHANGED,
            entity_type: 'application',
            entity_id: applicationId,
        }]);
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyStudentSelected failed`, { collegeId, studentId, applicationId, error: error.message });
    }
}

// ============================================================================
// EVENT: ROUND RESULTS PUBLISHED — Notify all students with results
// ============================================================================

/**
 * Notify students whose round results were processed.
 * Called AFTER processRound completes — fire-and-forget.
 *
 * @param {string} collegeId
 * @param {string} roundId
 * @param {string} roundName
 * @param {string} jobTitle
 * @param {string} companyName
 * @param {{ student_id: string, result_status: string }[]} results
 */
async function notifyRoundResultsPublished(collegeId, roundId, roundName, jobTitle, companyName, results) {
    try {
        if (!results || results.length === 0) return;

        const notifications = results.map(r => ({
            student_id: r.student_id,
            title: `Round Results: ${roundName} — ${jobTitle}`,
            body: `Your result for ${roundName} (${companyName} — ${jobTitle}) has been published: ${r.result_status.toUpperCase()}.`,
            notification_type: NOTIFICATION_TYPE.ROUND_RESULT,
            entity_type: 'round',
            entity_id: roundId,
        }));

        await notifyStudents({ query }, collegeId, notifications);
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyRoundResultsPublished failed`, { collegeId, roundId, error: error.message });
    }
}

// ============================================================================
// EVENT: OFFER REVOKED — Notify student their offer was revoked
// ============================================================================

/**
 * Notify a student that their placement offer has been revoked.
 * Called AFTER revokePlacement COMMIT — fire-and-forget.
 */
async function notifyOfferRevoked(collegeId, studentId, placementId, jobTitle, companyName) {
    try {
        await notifyStudents({ query }, collegeId, [{
            student_id: studentId,
            title: `Offer Revoked: ${jobTitle}`,
            body: `Your placement offer from ${companyName} for ${jobTitle} has been revoked by the placement team. Please contact your TPO for details.`,
            notification_type: NOTIFICATION_TYPE.OFFER_REVOKED,
            entity_type: 'placement',
            entity_id: placementId,
        }]);
    } catch (error) {
        logger.error(`${LOG.AUTH} notifyOfferRevoked failed`, { collegeId, studentId, placementId, error: error.message });
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    batchInsert,
    notifyStudents,
    notifyAdmins,
    notifyJobPublished,
    notifyRoundScheduled,
    notifyOfferCreated,
    notifyOfferAccepted,
    notifyOfferDeclined,
    notifyExpiringOffers,
    notifyStudentSelected,
    notifyRoundResultsPublished,
    notifyOfferRevoked,
};
