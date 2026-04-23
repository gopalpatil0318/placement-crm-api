/**
 * ============================================================================
 * POLICY HELPER — Centralized Placement Policy Enforcement
 * ============================================================================
 * Single source of truth for all tier-based and offer-limit policies.
 * Called by student/job.service, college/placement.service, and
 * student/placement.service.
 *
 * Functions:
 *   checkApplyPolicy(studentId, collegeId, jobId, passoutYear)
 *     → { allowed, reason?, policy_info }
 *
 *   checkOfferPolicy(studentId, collegeId, passoutYear)
 *     → { allowed, reason?, active_offers, max_offers }
 *
 *   checkVacancy(jobId, positionId)
 *     → { allowed, reason?, filled, vacancies }
 *
 *   runAcceptanceCascade(client, placementId, studentId, collegeId, passoutYear)
 *     → { withdrawn_apps[], revoked_placements[], notifications_sent }
 * ============================================================================
 */

const { query } = require('../config/db');
const logger = require('../config/logger');
const { LOG, STATUS, NOTIFICATION_TYPE, RECIPIENT_TYPE } = require('../config/constants');
const { validateTransition } = require('./stateMachine');
// Lazy-loaded to avoid circular dependency (waitlistPromoter also uses db)
let _promoteFromWaitlist;
function getPromoter() {
    if (!_promoteFromWaitlist) {
        _promoteFromWaitlist = require('./waitlistPromoter').promoteFromWaitlist;
    }
    return _promoteFromWaitlist;
}

// ============================================================================
// 1. APPLY-TIME POLICY — Tier-based blocking for placed students
// ============================================================================

/**
 * Check if a placed student is allowed to apply based on tier policy.
 *
 * Rules:
 *   - If student has NO active placement → always allowed
 *   - If student is placed and job has NO tier → blocked (can't compare tiers)
 *   - If student is placed at tier X:
 *       a) Job tier_level > X (higher/dream) → allowed if allow_dream_upgrade = true
 *       b) Job tier_level <= X (same or lower) → BLOCKED
 *
 * @returns {{ allowed, reason?, policy_info }}
 */
async function checkApplyPolicy(studentId, collegeId, jobId, passoutYear) {
    // 1. Get student's current active on-campus/pool-campus placement (accepted/joined) with tier info
    //    Off-campus placements are unlimited and don't block on-campus applications
    const placementResult = await query(
        `SELECT pr.placement_id, pr.placement_status, pr.job_id,
                j.tier_id, ct.tier_level, ct.tier_name,
                j.job_title, c.company_name
         FROM placement_results pr
         JOIN job_postings j ON pr.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         LEFT JOIN company_tiers ct ON j.tier_id = ct.tier_id
         WHERE pr.student_id = $1 AND pr.college_id = $2
           AND pr.placement_status IN ($3, $4)
           AND j.drive_type IN ('on_campus', 'pool_campus')
         ORDER BY ct.tier_level DESC NULLS LAST
         LIMIT 1`,
        [studentId, collegeId, STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED]
    );

    // No active placement → always allowed
    if (!placementResult.rows.length) {
        return { allowed: true, policy_info: { is_placed: false } };
    }

    const currentPlacement = placementResult.rows[0];

    // 2. Get the target job's tier
    const jobResult = await query(
        `SELECT j.tier_id, ct.tier_level, ct.tier_name
         FROM job_postings j
         LEFT JOIN company_tiers ct ON j.tier_id = ct.tier_id
         WHERE j.job_id = $1`,
        [jobId]
    );

    const jobTier = jobResult.rows[0];

    // 3. Get placement settings for dream upgrade policy
    const settingsResult = await query(
        `SELECT allow_dream_upgrade, auto_withdrawal_rule
         FROM placement_settings
         WHERE college_id = $1 AND passout_year = $2 LIMIT 1`,
        [collegeId, passoutYear]
    );

    const settings = settingsResult.rows[0] || {
        allow_dream_upgrade: true,
        auto_withdrawal_rule: 'same_or_lower_tier',
    };

    const policyInfo = {
        is_placed: true,
        current_placement: {
            company_name: currentPlacement.company_name,
            tier_name: currentPlacement.tier_name || 'Unclassified',
            tier_level: currentPlacement.tier_level,
        },
        target_job: {
            tier_name: jobTier?.tier_name || 'Unclassified',
            tier_level: jobTier?.tier_level,
        },
        allow_dream_upgrade: settings.allow_dream_upgrade,
    };

    // 4. If current placement has no tier → treat as lowest tier (any tiered job is an upgrade)
    if (!currentPlacement.tier_level) {
        if (!settings.allow_dream_upgrade) {
            return {
                allowed: false,
                reason: `You are already placed at ${currentPlacement.company_name}. Dream upgrades are not allowed by your college policy.`,
                policy_info: policyInfo,
            };
        }
        // Unclassified placement = lowest, any tiered job is an upgrade
        if (jobTier?.tier_level) {
            return { allowed: true, policy_info: { ...policyInfo, upgrade: true } };
        }
        // Both unclassified + dream upgrade allowed → permit (can't prove it's NOT an upgrade)
        if (settings.allow_dream_upgrade) {
            return { allowed: true, policy_info: { ...policyInfo, upgrade: true } };
        }
        // Both unclassified + dream upgrade disabled → blocked
        return {
            allowed: false,
            reason: `You are already placed at ${currentPlacement.company_name}. This job is in the same tier category.`,
            policy_info: policyInfo,
        };
    }

    // 5. If target job has no tier → can't determine upgrade → blocked
    if (!jobTier?.tier_level) {
        return {
            allowed: false,
            reason: `You are already placed (${currentPlacement.tier_name} tier). This job has no tier classification — cannot determine if it's an upgrade.`,
            policy_info: policyInfo,
        };
    }

    // 6. Compare tiers: higher tier_level = better/dream tier
    const isUpgrade = jobTier.tier_level > currentPlacement.tier_level;

    if (isUpgrade && settings.allow_dream_upgrade) {
        return { allowed: true, policy_info: { ...policyInfo, upgrade: true } };
    }

    if (isUpgrade && !settings.allow_dream_upgrade) {
        return {
            allowed: false,
            reason: `You are already placed at ${currentPlacement.company_name} (${currentPlacement.tier_name} tier). Dream upgrades are not allowed by your college policy.`,
            policy_info: policyInfo,
        };
    }

    // Same or lower tier → blocked
    return {
        allowed: false,
        reason: `You are already placed at ${currentPlacement.company_name} (${currentPlacement.tier_name} tier). You can only apply to higher-tier (dream) companies.`,
        policy_info: policyInfo,
    };
}

// ============================================================================
// 2. OFFER-TIME POLICY — Max active offers enforcement
// ============================================================================

/**
 * Check if creating a new offer for this student would exceed max_active_offers.
 *
 * @returns {{ allowed, reason?, active_offers, max_offers }}
 */
async function checkOfferPolicy(studentId, collegeId, passoutYear, client = null) {
    const db = client || { query: (...args) => query(...args) };
    // 1. Get current active offers/placements count (offered + accepted + joined)
    //    Only count on_campus + pool_campus — off_campus placements are unlimited
    const countResult = await db.query(
        `SELECT COUNT(*) AS cnt FROM placement_results pr
         JOIN job_postings j ON pr.job_id = j.job_id
         WHERE pr.student_id = $1 AND pr.college_id = $2
           AND pr.placement_status IN ($3, $4, $5)
           AND j.drive_type IN ('on_campus', 'pool_campus')`,
        [studentId, collegeId, STATUS.PLACEMENT.OFFERED, STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED]
    );

    const activeOffers = Number.parseInt(countResult.rows[0].cnt, 10);

    // 2. Get max_active_offers from settings
    const settingsResult = await db.query(
        `SELECT max_active_offers FROM placement_settings
         WHERE college_id = $1 AND passout_year = $2 LIMIT 1`,
        [collegeId, passoutYear]
    );

    const maxOffers = settingsResult.rows[0]?.max_active_offers ?? 1;

    if (activeOffers >= maxOffers) {
        return {
            allowed: false,
            reason: `Student has ${activeOffers} active offer(s). Maximum allowed: ${maxOffers}.`,
            active_offers: activeOffers,
            max_offers: maxOffers,
        };
    }

    return {
        allowed: true,
        active_offers: activeOffers,
        max_offers: maxOffers,
    };
}

// ============================================================================
// 3. VACANCY ENFORCEMENT — Block offers when position is full
// ============================================================================

/**
 * Check if a position still has vacancies for a new offer.
 * Counts existing offered/accepted/joined placements against the position.
 *
 * @returns {{ allowed, reason?, filled, vacancies }}
 */
async function checkVacancy(jobId, positionId, client = null) {
    if (!positionId) return { allowed: true, filled: 0, vacancies: null };

    const db = client || { query: (...args) => query(...args) };
    const posResult = await db.query(
        `SELECT position_name, vacancies, position_status
         FROM job_positions
         WHERE position_id = $1 AND job_id = $2`,
        [positionId, jobId]
    );

    if (!posResult.rows.length) {
        return { allowed: true, filled: 0, vacancies: null };
    }

    const pos = posResult.rows[0];

    // No vacancy limit set → always allowed
    if (pos.vacancies == null) {
        return { allowed: true, filled: 0, vacancies: null };
    }

    // Position already marked filled → blocked
    if (pos.position_status === STATUS.POSITION.FILLED) {
        return {
            allowed: false,
            reason: `Position "${pos.position_name}" is already filled.`,
            filled: pos.vacancies,
            vacancies: pos.vacancies,
        };
    }

    // Count active placements for this position
    const countResult = await db.query(
        `SELECT COUNT(*) AS cnt FROM placement_results
         WHERE position_id = $1 AND job_id = $2
           AND placement_status IN ($3, $4, $5)`,
        [positionId, jobId,
         STATUS.PLACEMENT.OFFERED, STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED]
    );

    const filled = Number.parseInt(countResult.rows[0].cnt, 10);

    if (filled >= pos.vacancies) {
        return {
            allowed: false,
            reason: `Position "${pos.position_name}" has ${filled}/${pos.vacancies} slots filled. No vacancies remaining.`,
            filled,
            vacancies: pos.vacancies,
        };
    }

    return { allowed: true, filled, vacancies: pos.vacancies };
}

// ============================================================================
// 4. ACCEPTANCE CASCADE — Auto-withdraw apps + revoke offers on acceptance
// ============================================================================

/**
 * When a student accepts a placement: auto-withdraw other applications and
 * auto-revoke other offered placements, based on placement_settings policy.
 *
 * MUST run inside a transaction (caller passes client).
 *
 * @param {Object} client - PG client in transaction
 * @param {string} placementId - The placement being accepted
 * @param {string} studentId
 * @param {string} collegeId
 * @param {number} passoutYear
 * @returns {{ withdrawn_apps, revoked_placements, notifications_sent }}
 */
async function runAcceptanceCascade(client, placementId, studentId, collegeId, passoutYear) {
    // 1. Get the accepted placement's tier and drive type
    const acceptedResult = await client.query(
        `SELECT pr.job_id, j.tier_id, j.drive_type, ct.tier_level, ct.tier_name,
                j.job_title, c.company_name
         FROM placement_results pr
         JOIN job_postings j ON pr.job_id = j.job_id
         LEFT JOIN company_tiers ct ON j.tier_id = ct.tier_id
         JOIN companies c ON pr.company_id = c.company_id
         WHERE pr.placement_id = $1`,
        [placementId]
    );

    const accepted = acceptedResult.rows[0];
    const acceptedTierLevel = accepted?.tier_level ?? 0;
    const acceptedDriveType = accepted?.drive_type ?? 'off_campus';

    // Off-campus placements are unlimited — no cascade needed
    if (acceptedDriveType === 'off_campus') {
        return { withdrawn_apps: 0, revoked_placements: 0, notifications_sent: 0 };
    }

    // For on_campus/pool_campus, cascade only affects same group (on_campus + pool_campus)
    const driveTypeFilter = "AND j.drive_type IN ('on_campus', 'pool_campus')";

    // 2. Get auto_withdrawal_rule from settings
    const settingsResult = await client.query(
        `SELECT auto_withdrawal_rule FROM placement_settings
         WHERE college_id = $1 AND passout_year = $2 LIMIT 1`,
        [collegeId, passoutYear]
    );

    const rule = settingsResult.rows[0]?.auto_withdrawal_rule ?? 'same_or_lower_tier';

    if (rule === 'none') {
        return { withdrawn_apps: 0, revoked_placements: 0, notifications_sent: 0 };
    }

    // 3. Determine which tiers to cascade
    // Build tier filter based on rule
    let tierCondition;
    const tierParams = [studentId, collegeId, accepted?.job_id];

    if (rule === 'all') {
        // Withdraw ALL other active apps regardless of tier
        tierCondition = 'TRUE';
    } else if (rule === 'same_tier') {
        // Withdraw only same-tier apps
        tierCondition = '(ct.tier_level = $4 OR (ct.tier_level IS NULL AND $4 = 0))';
        tierParams.push(acceptedTierLevel);
    } else {
        // 'same_or_lower_tier' (default) — withdraw same + lower tier apps
        tierCondition = '(ct.tier_level IS NULL OR ct.tier_level <= $4)';
        tierParams.push(acceptedTierLevel);
    }

    // 4. Auto-withdraw active applications (not for the accepted job)
    //    Only cascade within same drive_type group (on_campus/pool_campus)
    const withdrawResult = await client.query(
        `UPDATE student_applications
         SET application_status = $${tierParams.length + 1},
             auto_withdrawal_reason = $${tierParams.length + 2},
             last_updated_at = NOW()
         FROM job_postings j
         LEFT JOIN company_tiers ct ON j.tier_id = ct.tier_id
         WHERE student_applications.job_id = j.job_id
           AND student_applications.student_id = $1
           AND student_applications.college_id = $2
           AND student_applications.job_id != $3
           AND student_applications.application_status IN ('pending', 'under_review', 'shortlisted', 'selected', 'waitlisted')
           AND ${tierCondition}
           ${driveTypeFilter}
         RETURNING student_applications.application_id, student_applications.job_id, j.job_title`,
        [...tierParams, STATUS.APPLICATION.AUTO_WITHDRAWN, `Auto-withdrawn: accepted ${accepted?.company_name} (${accepted?.tier_name || 'N/A'} tier)`]
    );

    // 5. Auto-revoke other active OFFERED placements (not for the accepted job)
    //    Only cascade within same drive_type group (on_campus/pool_campus)
    const revokeResult = await client.query(
        `UPDATE placement_results
         SET placement_status = $${tierParams.length + 1},
             revoked_reason = $${tierParams.length + 2},
             updated_at = NOW()
         FROM job_postings j
         LEFT JOIN company_tiers ct ON j.tier_id = ct.tier_id
         WHERE placement_results.job_id = j.job_id
           AND placement_results.student_id = $1
           AND placement_results.college_id = $2
           AND placement_results.job_id != $3
           AND placement_results.placement_status = $${tierParams.length + 3}
           AND ${tierCondition}
           ${driveTypeFilter}
         RETURNING placement_results.placement_id, placement_results.job_id, j.job_title`,
        [...tierParams, STATUS.PLACEMENT.REVOKED, `Auto-revoked: student accepted ${accepted?.company_name}`, STATUS.PLACEMENT.OFFERED]
    );

    // 6. Update application status for revoked placements (offered → auto_withdrawn)
    if (revokeResult.rowCount > 0) {
        const revokedJobIds = revokeResult.rows.map(r => r.job_id);
        await client.query(
            `UPDATE student_applications
             SET application_status = $1,
                 auto_withdrawal_reason = $2,
                 last_updated_at = NOW()
             WHERE student_id = $3 AND job_id = ANY($4::UUID[])
               AND application_status = 'offered'`,
            [
                STATUS.APPLICATION.AUTO_WITHDRAWN,
                `Auto-withdrawn: accepted ${accepted?.company_name}`,
                studentId,
                revokedJobIds,
            ]
        );
    }

    // 7. Auto-fill positions that are now at capacity (after revocations may free slots elsewhere)
    // Check for positions where filled count >= vacancies
    await autoFillPositions(client, collegeId);

    // 8. Send notifications for all affected items
    const notifications = [];

    for (const app of withdrawResult.rows) {
        notifications.push({
            collegeId, recipientType: RECIPIENT_TYPE.STUDENT, recipientId: studentId,
            title: `Application Auto-Withdrawn: ${app.job_title}`,
            body: `Your application for ${app.job_title} was automatically withdrawn because you accepted an offer from ${accepted?.company_name}.`,
            type: NOTIFICATION_TYPE.AUTO_WITHDRAWN,
            entityType: 'application', entityId: app.application_id,
        });
    }

    for (const pl of revokeResult.rows) {
        notifications.push({
            collegeId, recipientType: RECIPIENT_TYPE.STUDENT, recipientId: studentId,
            title: `Offer Auto-Revoked: ${pl.job_title}`,
            body: `Your offer for ${pl.job_title} was automatically revoked because you accepted an offer from ${accepted?.company_name}.`,
            type: NOTIFICATION_TYPE.OFFER_REVOKED,
            entityType: 'placement', entityId: pl.placement_id,
        });
    }

    // Batch insert notifications
    if (notifications.length > 0) {
        const BATCH = 100;
        for (let i = 0; i < notifications.length; i += BATCH) {
            const batch = notifications.slice(i, i + BATCH);
            const vals = batch.map((_, j) => {
                const o = j * 8;
                return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
            }).join(', ');
            const params = batch.flatMap(n => [
                n.collegeId, n.recipientType, n.recipientId,
                n.title, n.body, n.type, n.entityType, n.entityId,
            ]);

            await client.query(
                `INSERT INTO notifications
                    (college_id, recipient_type, recipient_id, title, body,
                     notification_type, related_entity_type, related_entity_id)
                 VALUES ${vals}`,
                params
            );
        }
    }

    logger.info(`${LOG.AUTH} Acceptance cascade completed`, {
        placementId, studentId, collegeId,
        rule,
        acceptedTier: accepted?.tier_name,
        withdrawnApps: withdrawResult.rowCount,
        revokedPlacements: revokeResult.rowCount,
        notificationsSent: notifications.length,
    });

    return {
        withdrawn_apps: withdrawResult.rowCount,
        revoked_placements: revokeResult.rowCount,
        notifications_sent: notifications.length,
        details: {
            withdrawn: withdrawResult.rows.map(r => ({ application_id: r.application_id, job_title: r.job_title })),
            revoked: revokeResult.rows.map(r => ({ placement_id: r.placement_id, job_title: r.job_title })),
        },
    };
}

// ============================================================================
// 5. AUTO-FILL POSITIONS — Mark positions as filled when vacancies exhausted
// ============================================================================

/**
 * Check all positions in the college and mark as 'filled' where active
 * placements >= vacancies.
 */
async function autoFillPositions(client, collegeId) {
    const result = await client.query(
        `UPDATE job_positions jp
         SET position_status = $1
         FROM (
             SELECT p.position_id, p.vacancies, COUNT(pr.placement_id) AS filled
             FROM job_positions p
             JOIN job_postings j ON p.job_id = j.job_id
             LEFT JOIN placement_results pr ON pr.position_id = p.position_id
               AND pr.placement_status IN ($2, $3, $4)
             WHERE j.college_id = $5
               AND p.position_status = $6
               AND p.vacancies IS NOT NULL
             GROUP BY p.position_id, p.vacancies
             HAVING COUNT(pr.placement_id) >= p.vacancies
         ) filled_positions
         WHERE jp.position_id = filled_positions.position_id
         RETURNING jp.position_id, jp.position_name`,
        [STATUS.POSITION.FILLED,
         STATUS.PLACEMENT.OFFERED, STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED,
         collegeId, STATUS.POSITION.ACTIVE]
    );

    if (result.rowCount > 0) {
        logger.info(`${LOG.AUTH} Auto-filled positions`, {
            collegeId,
            positionsFilled: result.rowCount,
            positions: result.rows.map(r => r.position_name),
        });
    }

    return result.rowCount;
}

// ============================================================================
// 5b. REACTIVATE POSITIONS — Un-fill positions that now have vacancies
// ============================================================================

/**
 * After a revoke/expire/decline, check if any FILLED positions now have
 * fewer active placements than vacancies — and reactivate them.
 *
 * @param {Object} client - PG client in transaction (or standalone query)
 * @param {string} collegeId
 * @returns {number} Number of reactivated positions
 */
async function reactivatePositions(client, collegeId) {
    const result = await client.query(
        `UPDATE job_positions jp
         SET position_status = $1
         FROM (
             SELECT p.position_id, p.vacancies, COUNT(pr.placement_id) AS filled
             FROM job_positions p
             JOIN job_postings j ON p.job_id = j.job_id
             LEFT JOIN placement_results pr ON pr.position_id = p.position_id
               AND pr.placement_status IN ($2, $3, $4)
             WHERE j.college_id = $5
               AND p.position_status = $6
               AND p.vacancies IS NOT NULL
             GROUP BY p.position_id, p.vacancies
             HAVING COUNT(pr.placement_id) < p.vacancies
         ) unfilled
         WHERE jp.position_id = unfilled.position_id
         RETURNING jp.position_id, jp.position_name`,
        [STATUS.POSITION.ACTIVE,
         STATUS.PLACEMENT.OFFERED, STATUS.PLACEMENT.ACCEPTED, STATUS.PLACEMENT.JOINED,
         collegeId, STATUS.POSITION.FILLED]
    );

    if (result.rowCount > 0) {
        logger.info(`${LOG.AUTH} Reactivated positions after revoke/expire`, {
            collegeId,
            positionsReactivated: result.rowCount,
            positions: result.rows.map(r => r.position_name),
        });
    }

    return result.rowCount;
}

// ============================================================================
// 6. PROACTIVE EXPIRY SWEEP — Auto-expire offered placements past deadline
// ============================================================================

/**
 * Transitions all 'offered' placements whose offer_expires_at < NOW() to 'expired'.
 * Also updates their application to auto_withdrawn and sends notifications.
 * Designed to be called at the start of every placement list query.
 *
 * Uses a TTL cache to avoid running on every single request.
 *
 * @param {string} collegeId
 * @returns {number} Number of expired offers
 */
const _expirySweepCache = new Map(); // collegeId → timestamp
const EXPIRY_SWEEP_TTL = 60_000; // 1 minute

// Prevent unbounded Map growth — clear stale entries every hour
setInterval(() => _expirySweepCache.clear(), 3_600_000).unref();

async function sweepExpiredOffers(collegeId) {
    // TTL guard — skip if we swept recently
    const lastSweep = _expirySweepCache.get(collegeId);
    if (lastSweep && Date.now() - lastSweep < EXPIRY_SWEEP_TTL) {
        return 0;
    }
    _expirySweepCache.set(collegeId, Date.now());

    try {
        // Atomically expire all offered placements past their deadline
        const result = await query(
            `UPDATE placement_results
             SET placement_status = $1,
                 acceptance_status = 'rejected',
                 updated_at = NOW()
             WHERE college_id = $2
               AND placement_status = $3
               AND offer_expires_at IS NOT NULL
               AND offer_expires_at < NOW()
             RETURNING placement_id, student_id, job_id,
                       (SELECT j.job_title FROM job_postings j WHERE j.job_id = placement_results.job_id) AS job_title,
                       (SELECT c.company_name FROM companies c WHERE c.company_id = placement_results.company_id) AS company_name,
                       application_id`,
            [STATUS.PLACEMENT.EXPIRED, collegeId, STATUS.PLACEMENT.OFFERED]
        );

        if (result.rowCount === 0) return 0;

        // Update the related applications to auto_withdrawn
        const appIds = result.rows.map(r => r.application_id).filter(Boolean);
        if (appIds.length > 0) {
            await query(
                `UPDATE student_applications
                 SET application_status = $1,
                     auto_withdrawal_reason = $2,
                     last_updated_at = NOW()
                 WHERE application_id = ANY($3::UUID[])
                   AND application_status = $4`,
                [
                    STATUS.APPLICATION.AUTO_WITHDRAWN,
                    'Offer expired — acceptance deadline passed',
                    appIds,
                    STATUS.APPLICATION.OFFERED,
                ]
            );
        }

        // Send notifications in batches
        const notifications = result.rows.map(r => ({
            collegeId, recipientType: RECIPIENT_TYPE.STUDENT, recipientId: r.student_id,
            title: `Offer Expired: ${r.job_title}`,
            body: `Your offer from ${r.company_name} for ${r.job_title} has expired because the acceptance deadline passed.`,
            type: NOTIFICATION_TYPE.OFFER_EXPIRED,
            entityType: 'placement', entityId: r.placement_id,
        }));

        const BATCH = 100;
        for (let i = 0; i < notifications.length; i += BATCH) {
            const batch = notifications.slice(i, i + BATCH);
            const vals = batch.map((_, j) => {
                const o = j * 8;
                return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
            }).join(', ');
            const params = batch.flatMap(n => [
                n.collegeId, n.recipientType, n.recipientId,
                n.title, n.body, n.type, n.entityType, n.entityId,
            ]);

            await query(
                `INSERT INTO notifications
                    (college_id, recipient_type, recipient_id, title, body,
                     notification_type, related_entity_type, related_entity_id)
                 VALUES ${vals}`,
                params
            );
        }

        logger.info(`${LOG.AUTH} Expiry sweep completed`, {
            collegeId, expiredCount: result.rowCount,
            placements: result.rows.map(r => r.placement_id),
        });

        // Trigger waitlist promotion for each affected job
        const uniqueJobIds = [...new Set(result.rows.map(r => r.job_id))];
        for (const jobId of uniqueJobIds) {
            getPromoter()(jobId, collegeId).catch(err => {
                logger.error(`${LOG.AUTH} Waitlist promotion after expiry sweep failed`, {
                    jobId, collegeId, error: err.message,
                });
            });
        }

        return result.rowCount;
    } catch (error) {
        logger.error(`${LOG.AUTH} Expiry sweep failed`, {
            collegeId, error: error.message,
        });
        return 0; // Non-fatal — don't block the list query
    }
}

// ============================================================================
// 7. MAX ACTIVE APPLICATIONS — CF1: Limit concurrent applications per student
// ============================================================================

/**
 * Check if a student has reached the max active applications limit.
 * Active = pending, under_review, shortlisted, selected, offered, waitlisted
 *
 * @returns {{ allowed, reason?, active_count, max_allowed }}
 */
async function checkMaxApplications(studentId, collegeId, passoutYear) {
    const settingsResult = await query(
        `SELECT max_active_applications FROM placement_settings
         WHERE college_id = $1 AND passout_year = $2 LIMIT 1`,
        [collegeId, passoutYear]
    );

    const maxApps = settingsResult.rows[0]?.max_active_applications ?? null;

    // NULL = unlimited — no limit configured
    if (maxApps == null) {
        return { allowed: true, active_count: 0, max_allowed: null };
    }

    const countResult = await query(
        `SELECT COUNT(*) AS cnt FROM student_applications
         WHERE student_id = $1 AND college_id = $2
           AND application_status IN ('pending', 'under_review', 'shortlisted', 'selected', 'offered', 'waitlisted')`,
        [studentId, collegeId]
    );

    const activeCount = Number.parseInt(countResult.rows[0].cnt, 10);

    if (activeCount >= maxApps) {
        return {
            allowed: false,
            reason: `You have ${activeCount} active application(s). Maximum allowed: ${maxApps}.`,
            active_count: activeCount,
            max_allowed: maxApps,
        };
    }

    return { allowed: true, active_count: activeCount, max_allowed: maxApps };
}

module.exports = {
    checkApplyPolicy,
    checkOfferPolicy,
    checkVacancy,
    checkMaxApplications,
    runAcceptanceCascade,
    autoFillPositions,
    reactivatePositions,
    sweepExpiredOffers,
};
