/**
 * ============================================================================
 * STUDENT PLACEMENT SERVICE — Own Placement Results Business Logic
 * ============================================================================
 *   - getMyPlacements(studentId, collegeId, filters)
 *   - acceptPlacement(placementId, studentId, collegeId)
 *   - rejectPlacement(placementId, studentId, collegeId, reason)
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
    NOTIFICATION_TYPE,
    RECIPIENT_TYPE,
} = require('../../config/constants');
const { assertTransition } = require('../../utils/stateMachine');
const { runAcceptanceCascade, sweepExpiredOffers, reactivatePositions } = require('../../utils/policyHelper');
const { promoteFromWaitlist } = require('../../utils/waitlistPromoter');
const { notifyOfferAccepted, notifyExpiringOffers } = require('../../utils/placementNotifier');
const { BUCKETS, resolveFileUrl } = require('../../utils/storageHelper');
const { cleanupOldFile } = require('../../utils/fileCleanupHelper');

// ============================================================================
// COLUMN CONSTANTS
// ============================================================================

const PLACEMENT_VERIFY_COLUMNS = `
    pr.placement_id, pr.student_id, pr.college_id, pr.company_id, pr.job_id,
    pr.position_id, pr.application_id,
    pr.placement_type,
    pr.fulltime_package, pr.fulltime_designation, pr.fulltime_joining_date,
    pr.internship_stipend, pr.internship_duration, pr.internship_start_date,
    pr.offer_letter_url, pr.offer_letter_verified,
    pr.offer_letter_rejection_reason, pr.offer_letter_rejected_at, pr.offer_letter_uploaded_by,
    pr.joining_letter_url, pr.joining_letter_verified,
    pr.joining_letter_rejection_reason, pr.joining_letter_rejected_at, pr.joining_letter_uploaded_by,
    pr.placement_status, pr.acceptance_status, pr.offer_expires_at,
    pr.passout_year, pr.created_at, pr.updated_at`;

const PLACEMENT_RETURNING_COLUMNS = `
    placement_id, placement_status, acceptance_status, updated_at`;

// ============================================================================
// HELPER — Verify placement belongs to the student
// ============================================================================

async function verifyStudentPlacement(placementId, studentId, collegeId) {
    const result = await query(
        `SELECT ${PLACEMENT_VERIFY_COLUMNS},
                c.company_name, c.company_website, c.company_logo, c.industry AS industry_type,
                j.job_title, j.job_type, j.job_location,
                p.position_name
         FROM placement_results pr
         JOIN companies c ON pr.company_id = c.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN job_positions p ON pr.position_id = p.position_id
         WHERE pr.placement_id = $1 AND pr.student_id = $2 AND pr.college_id = $3
         LIMIT 1`,
        [placementId, studentId, collegeId]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// 1. GET MY PLACEMENTS (paginated, filtered, sorted)
// ============================================================================

async function getMyPlacements(studentId, collegeId, filters = {}) {
    // Proactive expiry sweep — auto-expire offered placements past deadline
    await sweepExpiredOffers(collegeId);
    // Proactive expiring-soon reminders (TTL-cached, fire-and-forget)
    notifyExpiringOffers(collegeId).catch(() => {});

    const { page, limit, offset } = getPagination(filters);

    // Build WHERE
    const conditions = ['pr.student_id = $1', 'pr.college_id = $2'];
    const params = [studentId, collegeId];
    let paramIndex = 3;

    if (filters.placement_status) {
        conditions.push(`pr.placement_status = $${paramIndex}`);
        params.push(filters.placement_status);
        paramIndex++;
    }

    if (filters.placement_type) {
        conditions.push(`pr.placement_type = $${paramIndex}`);
        params.push(filters.placement_type);
        paramIndex++;
    }

    if (filters.acceptance_status) {
        conditions.push(`pr.acceptance_status = $${paramIndex}`);
        params.push(filters.acceptance_status);
        paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Sortable columns whitelist
    const SORTABLE = {
        created_at: 'pr.created_at',
        fulltime_package: 'pr.fulltime_package',
        placement_status: 'pr.placement_status',
        company_name: 'c.company_name',
    };
    const sortCol = SORTABLE[filters.sort_by] || SORTABLE.created_at;
    const sortOrd = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    // Run count, fetch, and summary in parallel (all independent)
    const [countResult, placementResult, summaryResult] = await Promise.all([
        query(
            `SELECT COUNT(*) AS total
             FROM placement_results pr
             WHERE ${whereClause}`,
            params
        ),
        query(
            `SELECT pr.placement_id, pr.student_id, pr.company_id, pr.job_id,
                pr.position_id, pr.application_id,
                pr.placement_type,
                pr.fulltime_package, pr.fulltime_designation, pr.fulltime_joining_date,
                pr.internship_stipend, pr.internship_duration, pr.internship_start_date,
                pr.offer_letter_url, pr.offer_letter_verified,
                pr.offer_letter_rejection_reason, pr.offer_letter_rejected_at, pr.offer_letter_uploaded_by,
                pr.joining_letter_url, pr.joining_letter_verified,
                pr.joining_letter_rejection_reason, pr.joining_letter_rejected_at, pr.joining_letter_uploaded_by,
                pr.placement_status, pr.acceptance_status,
                pr.passout_year,
                pr.created_at, pr.updated_at,
                c.company_name, c.company_website, c.company_logo, c.industry AS industry_type,
                j.job_title, j.job_type, j.job_location,
                p.position_name
         FROM placement_results pr
         JOIN companies c ON pr.company_id = c.company_id
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN job_positions p ON pr.position_id = p.position_id
         WHERE ${whereClause}
         ORDER BY ${sortCol} ${sortOrd}, pr.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...params, limit, offset]
        ),
        query(
            `SELECT placement_status, COUNT(*) AS cnt
             FROM placement_results
             WHERE student_id = $1 AND college_id = $2
             GROUP BY placement_status`,
            [studentId, collegeId]
        ),
    ]);

    const total = Number.parseInt(countResult.rows[0].total, 10);

    const statusSummary = {
        total: 0,
        offered: 0,
        accepted: 0,
        declined: 0,
        revoked: 0,
        expired: 0,
        joined: 0,
        cancelled: 0,
    };

    for (const row of summaryResult.rows) {
        const count = Number.parseInt(row.cnt, 10);
        statusSummary[row.placement_status] = count;
        statusSummary.total += count;
    }

    const placements = placementResult.rows.map(row => ({
        placement_id: row.placement_id,
        application_id: row.application_id,
        placement_type: row.placement_type,
        // Full-time details
        fulltime_package: row.fulltime_package === null ? null : Number.parseFloat(row.fulltime_package),
        fulltime_designation: row.fulltime_designation ?? null,
        fulltime_joining_date: row.fulltime_joining_date ?? null,
        // Internship details
        internship_stipend: row.internship_stipend === null ? null : Number.parseFloat(row.internship_stipend),
        internship_duration: row.internship_duration ?? null,
        internship_start_date: row.internship_start_date ?? null,
        // Offer letter
        offer_letter_url: row.offer_letter_url ?? null,
        offer_letter_verified: row.offer_letter_verified,
        offer_letter_rejection_reason: row.offer_letter_rejection_reason ?? null,
        offer_letter_rejected_at: row.offer_letter_rejected_at ?? null,
        offer_letter_uploaded_by: row.offer_letter_uploaded_by ?? null,
        // Joining letter
        joining_letter_url: row.joining_letter_url ?? null,
        joining_letter_verified: row.joining_letter_verified ?? false,
        joining_letter_rejection_reason: row.joining_letter_rejection_reason ?? null,
        joining_letter_rejected_at: row.joining_letter_rejected_at ?? null,
        joining_letter_uploaded_by: row.joining_letter_uploaded_by ?? null,
        // Status
        placement_status: row.placement_status,
        acceptance_status: row.acceptance_status ?? null,
        offer_expires_at: row.offer_expires_at ?? null,
        passout_year: row.passout_year,
        created_at: row.created_at,
        updated_at: row.updated_at,
        // Company info
        company_id: row.company_id,
        company_name: row.company_name,
        company_logo: row.company_logo ?? null,
        company_website: row.company_website ?? null,
        industry_type: row.industry_type ?? null,
        // Job info
        job_id: row.job_id,
        job_title: row.job_title,
        job_type: row.job_type,
        job_location: row.job_location ?? null,
        // Position info
        position_id: row.position_id ?? null,
        position_name: row.position_name ?? null,
    }));

    // Resolve storage paths to accessible URLs
    const { resolveFileUrls } = require('../../utils/storageHelper');
    await resolveFileUrls(placements, [
        { field: 'offer_letter_url', bucket: BUCKETS.PRIVATE },
        { field: 'joining_letter_url', bucket: BUCKETS.PRIVATE },
        { field: 'company_logo', bucket: BUCKETS.PUBLIC },
    ]);

    return { placements, total, page, limit, status_summary: statusSummary };
}

// ============================================================================
// 2. ACCEPT PLACEMENT OFFER
// ============================================================================

async function acceptPlacement(placementId, studentId, collegeId) {
    const placement = await verifyStudentPlacement(placementId, studentId, collegeId);

    // Validate transition: offered → accepted
    assertTransition('placement', placement.placement_status, STATUS.PLACEMENT.ACCEPTED);

    // Check offer expiry before accepting
    if (placement.offer_expires_at && new Date(placement.offer_expires_at) < new Date()) {
        throw Object.assign(new Error(ERROR_MESSAGES.OFFER_EXPIRED_CANNOT_ACCEPT), { status: 400 });
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock the placement row to prevent concurrent accept/reject
        const locked = await client.query(
            `SELECT placement_status, offer_expires_at, passout_year
             FROM placement_results
             WHERE placement_id = $1 FOR UPDATE`,
            [placementId]
        );

        // Re-validate under lock
        if (locked.rows[0].placement_status !== STATUS.PLACEMENT.OFFERED) {
            throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_ALREADY_STATUS), { status: 409 });
        }
        if (locked.rows[0].offer_expires_at && new Date(locked.rows[0].offer_expires_at) < new Date()) {
            throw Object.assign(new Error(ERROR_MESSAGES.OFFER_EXPIRED_CANNOT_ACCEPT), { status: 400 });
        }

        // Accept the placement
        const result = await client.query(
            `UPDATE placement_results
             SET acceptance_status = 'accepted',
                 placement_status = $1,
                 updated_at = NOW()
             WHERE placement_id = $2
             RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
            [STATUS.PLACEMENT.ACCEPTED, placementId]
        );

        // Run acceptance cascade (auto-withdraw apps + auto-revoke offers)
        const cascadeResult = await runAcceptanceCascade(
            client, placementId, studentId, collegeId, locked.rows[0].passout_year
        );

        await client.query('COMMIT');

        // Notify college admins about the acceptance (after COMMIT — fire-and-forget)
        notifyOfferAccepted(
            collegeId, studentId,
            placementId, placement.job_title, placement.company_name
        ).catch(() => {});

        logger.info(`${LOG.AUTH} Student accepted placement offer`, {
            placementId,
            studentId,
            jobId: placement.job_id,
            companyId: placement.company_id,
            collegeId,
            cascade: cascadeResult,
        });

        return {
            placement_id: result.rows[0].placement_id,
            placement_status: result.rows[0].placement_status,
            acceptance_status: result.rows[0].acceptance_status,
            previous_status: placement.placement_status,
            previous_acceptance: placement.acceptance_status,
            updated_at: result.rows[0].updated_at,
            job_title: placement.job_title,
            company_name: placement.company_name,
            position_name: placement.position_name ?? null,
            fulltime_package: placement.fulltime_package === null ? null : Number.parseFloat(placement.fulltime_package),
            fulltime_designation: placement.fulltime_designation ?? null,
            fulltime_joining_date: placement.fulltime_joining_date ?? null,
            internship_stipend: placement.internship_stipend === null ? null : Number.parseFloat(placement.internship_stipend),
            cascade: {
                withdrawn_apps: cascadeResult.withdrawn_apps,
                revoked_placements: cascadeResult.revoked_placements,
                details: cascadeResult.details,
            },
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 3. DECLINE PLACEMENT OFFER
// ============================================================================

async function declinePlacement(placementId, studentId, collegeId, reason) {
    const placement = await verifyStudentPlacement(placementId, studentId, collegeId);

    // Validate transition: offered → declined (fast-fail before lock)
    assertTransition('placement', placement.placement_status, STATUS.PLACEMENT.DECLINED);

    // Fast-fail expiry check before acquiring lock
    if (placement.offer_expires_at && new Date(placement.offer_expires_at) < new Date()) {
        throw Object.assign(new Error(ERROR_MESSAGES.OFFER_EXPIRED_CANNOT_DECLINE), { status: 400 });
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock the placement row to prevent concurrent accept/decline race
        const locked = await client.query(
            `SELECT placement_status, offer_expires_at
             FROM placement_results
             WHERE placement_id = $1 FOR UPDATE`,
            [placementId]
        );

        // Re-validate under lock — status may have changed concurrently
        if (locked.rows[0].placement_status !== STATUS.PLACEMENT.OFFERED) {
            throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_ALREADY_STATUS), { status: 409 });
        }
        if (locked.rows[0].offer_expires_at && new Date(locked.rows[0].offer_expires_at) < new Date()) {
            throw Object.assign(new Error(ERROR_MESSAGES.OFFER_EXPIRED_CANNOT_DECLINE), { status: 400 });
        }

        // Decline the placement
        const result = await client.query(
            `UPDATE placement_results
             SET acceptance_status = 'rejected',
                 placement_status = $1,
                 declined_reason = $2,
                 updated_at = NOW()
             WHERE placement_id = $3
             RETURNING ${PLACEMENT_RETURNING_COLUMNS}`,
            [STATUS.PLACEMENT.DECLINED, reason, placementId]
        );

        // Send notification to college admins (inside transaction for atomicity)
        await client.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             SELECT $1, $2, u.user_id,
                    $3, $4, $5, $6, $7
             FROM users u
             WHERE u.college_id = $1 AND u.user_role IN ('collegeadmin', 'tpo') AND u.user_status = 'active'`,
            [
                collegeId,
                RECIPIENT_TYPE.USER,
                `Offer Declined: ${placement.job_title}`,
                `Student declined the offer from ${placement.company_name} for ${placement.job_title}. Reason: ${reason}`,
                NOTIFICATION_TYPE.OFFER_DECLINED,
                'placement',
                placementId,
            ]
        );

        // Reactivate positions that now have vacancies after decline
        await reactivatePositions(client, collegeId);

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Student declined placement offer`, {
            placementId,
            studentId,
            jobId: placement.job_id,
            companyId: placement.company_id,
            collegeId,
            reason,
        });

        // Trigger waitlist promotion — a slot has opened up
        promoteFromWaitlist(placement.job_id, collegeId).catch(err => {
            logger.error(`${LOG.AUTH} Waitlist promotion after decline failed`, {
                jobId: placement.job_id, collegeId, error: err.message,
            });
        });

        return {
            placement_id: result.rows[0].placement_id,
            placement_status: result.rows[0].placement_status,
            acceptance_status: result.rows[0].acceptance_status,
            previous_status: placement.placement_status,
            previous_acceptance: placement.acceptance_status,
            declined_reason: reason,
            updated_at: result.rows[0].updated_at,
            job_title: placement.job_title,
            company_name: placement.company_name,
            position_name: placement.position_name ?? null,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ============================================================================
// 4. UPLOAD PLACEMENT DOCUMENTS (offer letter / joining letter URL)
// ============================================================================

async function uploadDocuments(placementId, studentId, collegeId, data) {
    // Guard: at least one document must be provided
    if (data.offer_letter_url === undefined && data.joining_letter_url === undefined) {
        throw Object.assign(new Error('At least one document URL is required'), { status: 400 });
    }

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Lock the row to prevent concurrent upload races
        const lockResult = await client.query(
            `SELECT placement_id, placement_status,
                    offer_letter_url, joining_letter_url
             FROM placement_results
             WHERE placement_id = $1 AND student_id = $2 AND college_id = $3
             FOR UPDATE`,
            [placementId, studentId, collegeId]
        );

        if (!lockResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.PLACEMENT_NOT_FOUND), { status: 404 });
        }

        const placement = lockResult.rows[0];

        // Guard: only allowed for non-terminal statuses
        const ALLOWED = [STATUS.PLACEMENT.OFFERED, STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED];
        if (!ALLOWED.includes(placement.placement_status)) {
            throw Object.assign(new Error(ERROR_MESSAGES.DOCUMENT_UPLOAD_NOT_ALLOWED), { status: 400 });
        }

        // Guard: joining letter only for accepted/joined
        if (data.joining_letter_url !== undefined) {
            const JOINING_ALLOWED = [STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED];
            if (!JOINING_ALLOWED.includes(placement.placement_status)) {
                throw Object.assign(new Error(ERROR_MESSAGES.JOINING_LETTER_NOT_ACCEPTED), { status: 400 });
            }
        }

        // Capture old file paths for cleanup after commit
        const oldOfferUrl = placement.offer_letter_url;
        const oldJoiningUrl = placement.joining_letter_url;

        // Build dynamic SET clause
        const setClauses = ['updated_at = NOW()'];
        const params = [];
        let idx = 1;

        if (data.offer_letter_url !== undefined) {
            setClauses.push(
                `offer_letter_url = $${idx++}`,
                `offer_letter_uploaded_by = $${idx++}`,
                // Reset verification on re-upload
                'offer_letter_verified = false',
                'verified_by = NULL',
                'verified_at = NULL',
                'offer_letter_rejection_reason = NULL',
                'offer_letter_rejected_at = NULL'
            );
            params.push(data.offer_letter_url, 'student');
        }

        if (data.joining_letter_url !== undefined) {
            setClauses.push(
                `joining_letter_url = $${idx++}`,
                `joining_letter_uploaded_by = $${idx++}`,
                // Reset verification on re-upload
                'joining_letter_verified = false',
                'joining_letter_verified_by = NULL',
                'joining_letter_verified_at = NULL',
                'joining_letter_rejection_reason = NULL',
                'joining_letter_rejected_at = NULL'
            );
            params.push(data.joining_letter_url, 'student');
        }

        params.push(placementId);

        const result = await client.query(
            `UPDATE placement_results
             SET ${setClauses.join(', ')}
             WHERE placement_id = $${idx}
             RETURNING placement_id,
                       offer_letter_url, offer_letter_verified, offer_letter_uploaded_by,
                       offer_letter_rejection_reason, offer_letter_rejected_at,
                       joining_letter_url, joining_letter_verified, joining_letter_uploaded_by,
                       joining_letter_rejection_reason, joining_letter_rejected_at,
                       updated_at`,
            params
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Student uploaded placement documents`, {
            placementId, studentId, collegeId,
            offer_letter: data.offer_letter_url !== undefined,
            joining_letter: data.joining_letter_url !== undefined,
        });

        // Cleanup old files if replaced (fire-and-forget, after commit)
        if (data.offer_letter_url !== undefined) {
            cleanupOldFile(BUCKETS.PRIVATE, oldOfferUrl, data.offer_letter_url);
        }
        if (data.joining_letter_url !== undefined) {
            cleanupOldFile(BUCKETS.PRIVATE, oldJoiningUrl, data.joining_letter_url);
        }

        const row = result.rows[0];
        return {
            placement_id: row.placement_id,
            offer_letter_url: row.offer_letter_url ?? null,
            offer_letter_verified: row.offer_letter_verified,
            offer_letter_uploaded_by: row.offer_letter_uploaded_by ?? null,
            offer_letter_rejection_reason: row.offer_letter_rejection_reason ?? null,
            joining_letter_url: row.joining_letter_url ?? null,
            joining_letter_verified: row.joining_letter_verified,
            joining_letter_uploaded_by: row.joining_letter_uploaded_by ?? null,
            joining_letter_rejection_reason: row.joining_letter_rejection_reason ?? null,
            updated_at: row.updated_at,
        };
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
    getMyPlacements,
    acceptPlacement,
    declinePlacement,
    uploadDocuments,
    // Backward-compatible alias
    rejectPlacement: declinePlacement,
};
