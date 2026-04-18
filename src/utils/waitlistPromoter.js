/**
 * ============================================================================
 * WAITLIST PROMOTER — Auto-promote rank #1 when a selected/offered slot opens
 * ============================================================================
 *   promoteFromWaitlist(jobId, collegeId, client?)
 *     → Promotes the rank-1 waitlisted applicant to 'selected',
 *       decrements remaining ranks, sends notifications.
 *
 *   Called automatically when:
 *     - A placement offer is declined (student/placement.service.js)
 *     - A placement offer is revoked  (college/placement.service.js)
 *     - A placement offer expires     (policyHelper.sweepExpiredOffers)
 * ============================================================================
 */

const { query, getClient } = require('../config/db');
const logger = require('../config/logger');
const {
    LOG,
    STATUS,
    NOTIFICATION_TYPE,
    RECIPIENT_TYPE,
} = require('../config/constants');

/**
 * Promote the rank-1 waitlisted applicant for a job to 'selected'.
 * Decrements all remaining waitlist ranks by 1.
 * Sends notifications to the promoted student and college admins.
 *
 * @param {string} jobId
 * @param {string} collegeId
 * @param {Object|null} txClient - Optional PG client if already in a transaction
 * @returns {{ promoted: boolean, application_id?: string, student_id?: string, new_rank_count?: number }}
 */
async function promoteFromWaitlist(jobId, collegeId, txClient = null) {
    const db = txClient || await getClient();
    const isOwnTx = !txClient;

    try {
        if (isOwnTx) await db.query('BEGIN');

        // 1. Lock and fetch the rank-1 waitlisted applicant
        const rank1Result = await db.query(
            `SELECT application_id, student_id, waitlist_rank
             FROM student_applications
             WHERE job_id = $1
               AND college_id = $2
               AND application_status = $3
               AND waitlist_rank = 1
             FOR UPDATE`,
            [jobId, collegeId, STATUS.APPLICATION.WAITLISTED]
        );

        if (rank1Result.rowCount === 0) {
            if (isOwnTx) await db.query('COMMIT');
            return { promoted: false };
        }

        const promoted = rank1Result.rows[0];

        // 2. Promote rank-1 → selected, clear their waitlist_rank
        await db.query(
            `UPDATE student_applications
             SET application_status = $1,
                 waitlist_rank = NULL,
                 last_updated_at = NOW()
             WHERE application_id = $2`,
            [STATUS.APPLICATION.SELECTED, promoted.application_id]
        );

        // 3. Decrement ranks for remaining waitlisted applicants
        const decremented = await db.query(
            `UPDATE student_applications
             SET waitlist_rank = waitlist_rank - 1,
                 last_updated_at = NOW()
             WHERE job_id = $1
               AND college_id = $2
               AND application_status = $3
               AND waitlist_rank > 1
             RETURNING application_id`,
            [jobId, collegeId, STATUS.APPLICATION.WAITLISTED]
        );

        // 4. Fetch job info for notification text
        const jobInfo = await db.query(
            `SELECT j.job_title, c.company_name
             FROM job_postings j
             JOIN companies c ON j.company_id = c.company_id
             WHERE j.job_id = $1`,
            [jobId]
        );
        const jobTitle = jobInfo.rows[0]?.job_title ?? 'Unknown Job';
        const companyName = jobInfo.rows[0]?.company_name ?? 'Unknown Company';

        // 5. Notify the promoted student
        await db.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                collegeId,
                RECIPIENT_TYPE.STUDENT,
                promoted.student_id,
                `Waitlist Promoted: ${jobTitle}`,
                `You have been promoted from the waitlist and selected for ${jobTitle} at ${companyName}.`,
                NOTIFICATION_TYPE.WAITLIST_PROMOTED,
                'application',
                promoted.application_id,
            ]
        );

        // 6. Notify college admins
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
                `Waitlist Auto-Promotion: ${jobTitle}`,
                `Waitlisted candidate has been auto-promoted to selected for ${jobTitle} at ${companyName}.`,
                NOTIFICATION_TYPE.WAITLIST_PROMOTED,
                'application',
                promoted.application_id,
            ]
        );

        if (isOwnTx) await db.query('COMMIT');

        logger.info(`${LOG.AUTH} Waitlist promotion completed`, {
            jobId,
            collegeId,
            promotedApplicationId: promoted.application_id,
            promotedStudentId: promoted.student_id,
            remainingWaitlisted: decremented.rowCount,
        });

        return {
            promoted: true,
            application_id: promoted.application_id,
            student_id: promoted.student_id,
            new_rank_count: decremented.rowCount,
        };
    } catch (error) {
        if (isOwnTx) await db.query('ROLLBACK');
        logger.error(`${LOG.AUTH} Waitlist promotion failed`, {
            jobId, collegeId, error: error.message,
        });
        throw error;
    } finally {
        if (isOwnTx) db.release();
    }
}

module.exports = { promoteFromWaitlist };
