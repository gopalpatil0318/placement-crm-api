/**
 * ============================================================================
 * ROUND PROCESSING SERVICE — Preview + Confirm Round Result Processing
 * ============================================================================
 *   - previewRoundProcessing(roundId, collegeId)  → What WILL happen
 *   - processRound(roundId, collegeId)             → Execute transitions
 *
 * Logic:
 *   1. Round must be "completed" status
 *   2. Students with NO result → auto-create "absent" result
 *   3. Passed students on FINAL round → application → "selected"
 *   4. Passed students on non-final round → stay "shortlisted"
 *   5. Failed/Absent students → application → "rejected"
 *      (only if placement_settings.auto_reject_on_round_fail = true)
 *   6. On-hold students → no change
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const logger = require('../../config/logger');
const {
    LOG,
    ERROR_MESSAGES,
    STATUS,
    NOTIFICATION_TYPE,
    RECIPIENT_TYPE,
} = require('../../config/constants');
const { validateTransition } = require('../../utils/stateMachine');

// ============================================================================
// HELPER — Load round + job context
// ============================================================================

async function loadRoundContext(roundId, collegeId, client = null) {
    const db = client || query;
    const forUpdate = client ? 'FOR UPDATE OF jr' : '';
    const result = await db(
        `SELECT jr.round_id, jr.job_id, jr.round_number, jr.round_name,
                jr.round_status, jr.round_type, jr.is_processed,
                j.job_title, j.job_status, j.college_id,
                c.company_name,
                (SELECT MAX(round_number) FROM job_rounds
                 WHERE job_id = jr.job_id AND round_status != $3) AS max_round
         FROM job_rounds jr
         JOIN job_postings j ON jr.job_id = j.job_id
         JOIN companies c ON j.company_id = c.company_id
         WHERE jr.round_id = $1 AND j.college_id = $2
         LIMIT 1
         ${forUpdate}`,
        [roundId, collegeId, STATUS.ROUND.CANCELLED]
    );

    if (!result.rows.length) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_NOT_FOUND), { status: 404 });
    }

    return result.rows[0];
}

// ============================================================================
// HELPER — Load all active applications + their results for this round
// ============================================================================

async function loadApplicationsAndResults(jobId, roundId, collegeId) {
    // Get all non-terminal applications for this job
    const apps = await query(
        `SELECT a.application_id, a.student_id, a.application_status,
                s.first_name, s.last_name, s.student_email
         FROM student_applications a
         JOIN students s ON a.student_id = s.student_id
         WHERE a.job_id = $1 AND a.college_id = $2
           AND a.application_status IN ($3, $4, $5)`,
        [jobId, collegeId,
         STATUS.APPLICATION.SHORTLISTED,
         STATUS.APPLICATION.UNDER_REVIEW,
         STATUS.APPLICATION.PENDING]
    );

    // Get existing results for this round
    const results = await query(
        `SELECT rr.result_id, rr.application_id, rr.student_id, rr.result_status
         FROM student_round_results rr
         WHERE rr.round_id = $1`,
        [roundId]
    );

    const resultMap = new Map();
    for (const r of results.rows) {
        resultMap.set(r.application_id, r);
    }

    return { applications: apps.rows, resultMap };
}

// ============================================================================
// HELPER — Load placement settings for auto_reject
// ============================================================================

async function getAutoRejectSetting(collegeId, jobId) {
    // Get passout_year from job to find correct settings
    const jobResult = await query(
        `SELECT passout_years FROM job_postings WHERE job_id = $1`,
        [jobId]
    );
    const passoutYears = jobResult.rows[0]?.passout_years;
    if (!passoutYears?.length) return true; // default to auto-reject

    const settingsResult = await query(
        `SELECT auto_reject_on_round_fail FROM placement_settings
         WHERE college_id = $1 AND passout_year = $2 LIMIT 1`,
        [collegeId, passoutYears[0]]
    );

    return settingsResult.rows[0]?.auto_reject_on_round_fail ?? true;
}

// ============================================================================
// HELPER — Categorize applications into processing buckets
// ============================================================================

/**
 * Categorize a single application that HAS a result record.
 */
function categorizeWithResult(app, result, isFinalRound, autoReject, buckets) {
    switch (result.result_status) {
        case STATUS.ROUND_RESULT.PASSED:
            if (isFinalRound) {
                if (validateTransition('application', app.application_status, STATUS.APPLICATION.SELECTED)) {
                    buckets.toSelect.push(app);
                } else {
                    buckets.skipped.push({ ...app, reason: `Cannot transition from '${app.application_status}' to 'selected'` });
                }
            } else {
                buckets.toAdvance.push(app);
            }
            break;

        case STATUS.ROUND_RESULT.FAILED:
            categorizeRejectCandidate(app, autoReject, 'failed', buckets);
            break;

        case STATUS.ROUND_RESULT.ABSENT:
            categorizeRejectCandidate(app, autoReject, 'absent', buckets);
            break;

        case STATUS.ROUND_RESULT.ON_HOLD:
            buckets.onHold.push(app);
            break;

        case STATUS.ROUND_RESULT.PENDING:
            buckets.skipped.push({ ...app, reason: 'Result still pending — cannot process' });
            break;

        default:
            buckets.skipped.push({ ...app, reason: `Unknown result status: ${result.result_status}` });
    }
}

/**
 * Categorize a failed/absent candidate for rejection.
 */
function categorizeRejectCandidate(app, autoReject, reason, buckets) {
    if (autoReject && validateTransition('application', app.application_status, STATUS.APPLICATION.REJECTED)) {
        buckets.toReject.push({ ...app, reason });
    } else if (autoReject) {
        buckets.skipped.push({ ...app, reason: `Cannot transition from '${app.application_status}' to 'rejected'` });
    } else {
        buckets.skipped.push({ ...app, reason: 'Auto-reject disabled — manual action required' });
    }
}

function categorizeForProcessing(applications, resultMap, isFinalRound, autoReject) {
    const buckets = {
        toSelect: [],     // passed final round → selected
        toAdvance: [],    // passed non-final round → stay shortlisted
        toReject: [],     // failed/absent → rejected (if auto_reject)
        toAbsent: [],     // no result record → create absent
        onHold: [],       // on_hold → no change
        skipped: [],      // already has incompatible status
    };

    for (const app of applications) {
        const result = resultMap.get(app.application_id);

        if (!result) {
            buckets.toAbsent.push(app);
            if (autoReject && isFinalRound) {
                buckets.toReject.push({ ...app, reason: 'absent' });
            }
            continue;
        }

        categorizeWithResult(app, result, isFinalRound, autoReject, buckets);
    }

    return buckets;
}

// ============================================================================
// 1. PREVIEW ROUND PROCESSING
// ============================================================================

/**
 * Preview what will happen when round results are processed.
 * Does NOT modify any data.
 */
async function previewRoundProcessing(roundId, collegeId) {
    const ctx = await loadRoundContext(roundId, collegeId);

    if (ctx.round_status !== STATUS.ROUND.COMPLETED) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_NOT_COMPLETED), { status: 400 });
    }
    if (ctx.is_processed) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_ALREADY_PROCESSED), { status: 409 });
    }

    const isFinalRound = ctx.round_number === ctx.max_round;
    const autoReject = await getAutoRejectSetting(collegeId, ctx.job_id);
    const { applications, resultMap } = await loadApplicationsAndResults(ctx.job_id, roundId, collegeId);
    const categories = categorizeForProcessing(applications, resultMap, isFinalRound, autoReject);

    return {
        round: {
            round_id: ctx.round_id,
            round_name: ctx.round_name,
            round_number: ctx.round_number,
            round_type: ctx.round_type,
            is_final_round: isFinalRound,
            job_title: ctx.job_title,
            company_name: ctx.company_name,
        },
        settings: {
            auto_reject_on_round_fail: autoReject,
        },
        summary: {
            total_applications: applications.length,
            will_select: categories.toSelect.length,
            will_advance: categories.toAdvance.length,
            will_reject: categories.toReject.length,
            will_mark_absent: categories.toAbsent.length,
            on_hold: categories.onHold.length,
            skipped: categories.skipped.length,
        },
        details: {
            selecting: categories.toSelect.map(a => ({
                application_id: a.application_id,
                student_name: `${a.first_name} ${a.last_name}`,
                current_status: a.application_status,
                new_status: STATUS.APPLICATION.SELECTED,
            })),
            advancing: categories.toAdvance.map(a => ({
                application_id: a.application_id,
                student_name: `${a.first_name} ${a.last_name}`,
                current_status: a.application_status,
                action: 'Stays shortlisted — advances to next round',
            })),
            rejecting: categories.toReject.map(a => ({
                application_id: a.application_id,
                student_name: `${a.first_name} ${a.last_name}`,
                current_status: a.application_status,
                new_status: STATUS.APPLICATION.REJECTED,
                reason: a.reason,
            })),
            marking_absent: categories.toAbsent.map(a => ({
                application_id: a.application_id,
                student_name: `${a.first_name} ${a.last_name}`,
            })),
            on_hold: categories.onHold.map(a => ({
                application_id: a.application_id,
                student_name: `${a.first_name} ${a.last_name}`,
            })),
            skipped: categories.skipped.map(a => ({
                application_id: a.application_id,
                student_name: `${a.first_name} ${a.last_name}`,
                reason: a.reason,
            })),
        },
    };
}

// ============================================================================
// HELPERS — Build and insert round-processing notifications
// ============================================================================

function buildRoundNotifications(categories, ctx) {
    const notifications = [];
    const { collegeId } = ctx;

    for (const s of categories.toSelect) {
        notifications.push({
            collegeId, recipientType: RECIPIENT_TYPE.STUDENT, recipientId: s.student_id,
            title: `Selected: ${ctx.job_title}`,
            body: `Congratulations! You have been selected after passing the final round (${ctx.round_name}) for ${ctx.job_title} at ${ctx.company_name}.`,
            type: NOTIFICATION_TYPE.APPLICATION_STATUS_CHANGED,
            entityType: 'application', entityId: s.application_id,
        });
    }

    for (const s of categories.toReject) {
        notifications.push({
            collegeId, recipientType: RECIPIENT_TYPE.STUDENT, recipientId: s.student_id,
            title: `Round Result: ${ctx.job_title}`,
            body: `Your application for ${ctx.job_title} at ${ctx.company_name} has been updated after round "${ctx.round_name}" processing.`,
            type: NOTIFICATION_TYPE.APPLICATION_STATUS_CHANGED,
            entityType: 'application', entityId: s.application_id,
        });
    }

    for (const s of categories.toAdvance) {
        notifications.push({
            collegeId, recipientType: RECIPIENT_TYPE.STUDENT, recipientId: s.student_id,
            title: `Passed Round: ${ctx.round_name}`,
            body: `You passed "${ctx.round_name}" for ${ctx.job_title} at ${ctx.company_name}. You will advance to the next round.`,
            type: NOTIFICATION_TYPE.ROUND_RESULT,
            entityType: 'application', entityId: s.application_id,
        });
    }

    return notifications;
}

async function insertNotificationBatch(client, notifications) {
    const BATCH = 100;
    for (let i = 0; i < notifications.length; i += BATCH) {
        const batch = notifications.slice(i, i + BATCH);
        const notifValues = batch.map((_, j) => {
            const o = j * 8;
            return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`;
        }).join(', ');
        const notifParams = batch.flatMap(n => [
            n.collegeId, n.recipientType, n.recipientId,
            n.title, n.body, n.type, n.entityType, n.entityId,
        ]);

        await client.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             VALUES ${notifValues}`,
            notifParams
        );
    }
}

// ============================================================================
// 2. PROCESS ROUND (Execute Transitions)
// ============================================================================

/**
 * Execute round result processing in a single transaction.
 * Same logic as preview but actually modifies data.
 */
async function processRound(roundId, collegeId) {
    // Fetch settings & applications BEFORE locking (read-only, no lock needed)
    const preCtx = await loadRoundContext(roundId, collegeId);

    if (preCtx.round_status !== STATUS.ROUND.COMPLETED) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_NOT_COMPLETED), { status: 400 });
    }
    if (preCtx.is_processed) {
        throw Object.assign(new Error(ERROR_MESSAGES.ROUND_ALREADY_PROCESSED), { status: 409 });
    }

    const isFinalRound = preCtx.round_number === preCtx.max_round;
    const autoReject = await getAutoRejectSetting(collegeId, preCtx.job_id);
    const { applications, resultMap } = await loadApplicationsAndResults(preCtx.job_id, roundId, collegeId);
    const categories = categorizeForProcessing(applications, resultMap, isFinalRound, autoReject);

    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Lock the round row and re-verify (prevents concurrent processing)
        const ctx = await loadRoundContext(roundId, collegeId, client);
        if (ctx.is_processed) {
            await client.query('ROLLBACK');
            throw Object.assign(new Error(ERROR_MESSAGES.ROUND_ALREADY_PROCESSED), { status: 409 });
        }

        // 1. Create absent results for students with no result
        if (categories.toAbsent.length > 0) {
            const absentValues = categories.toAbsent.map((a, i) => {
                const offset = i * 3;
                return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
            }).join(', ');
            const absentParams = categories.toAbsent.flatMap(a => [a.application_id, roundId, a.student_id]);

            await client.query(
                `INSERT INTO student_round_results (application_id, round_id, student_id, result_status, attended)
                 SELECT v.application_id, v.round_id, v.student_id, $${absentParams.length + 1}, false
                 FROM (VALUES ${absentValues}) AS v(application_id, round_id, student_id)
                 ON CONFLICT (application_id, round_id) DO NOTHING`,
                [...absentParams, STATUS.ROUND_RESULT.ABSENT]
            );
        }

        // 2. Select students who passed the final round
        if (categories.toSelect.length > 0) {
            const selectIds = categories.toSelect.map(a => a.application_id);
            await client.query(
                `UPDATE student_applications
                 SET application_status = $1,
                     eligibility_remarks = COALESCE(eligibility_remarks, '') || ' | Auto-selected: passed final round',
                     last_updated_at = NOW()
                 WHERE application_id = ANY($2::UUID[])`,
                [STATUS.APPLICATION.SELECTED, selectIds]
            );
        }

        // 3. Reject failed/absent students
        if (categories.toReject.length > 0) {
            const rejectIds = categories.toReject.map(a => a.application_id);
            await client.query(
                `UPDATE student_applications
                 SET application_status = $1,
                     eligibility_remarks = COALESCE(eligibility_remarks, '') || ' | Auto-rejected: round result',
                     last_updated_at = NOW()
                 WHERE application_id = ANY($2::UUID[])`,
                [STATUS.APPLICATION.REJECTED, rejectIds]
            );
        }

        // 4. Send notifications to affected students
        const notifications = buildRoundNotifications(categories, ctx);

        if (notifications.length > 0) {
            await insertNotificationBatch(client, notifications);
        }

        // 5. Send summary notification to admins/TPOs
        const adminSummary = [
            categories.toSelect.length > 0 ? `${categories.toSelect.length} selected` : null,
            categories.toAdvance.length > 0 ? `${categories.toAdvance.length} advanced` : null,
            categories.toReject.length > 0 ? `${categories.toReject.length} rejected` : null,
            categories.toAbsent.length > 0 ? `${categories.toAbsent.length} absent` : null,
            categories.onHold.length > 0 ? `${categories.onHold.length} on hold` : null,
        ].filter(Boolean).join(', ');

        await client.query(
            `INSERT INTO notifications
                (college_id, recipient_type, recipient_id, title, body,
                 notification_type, related_entity_type, related_entity_id)
             SELECT $1, $2, u.user_id,
                    $3, $4, $5, $6, $7
             FROM users u
             WHERE u.college_id = $1
               AND u.user_role IN ('tpo', 'collegeadmin', 'tpc')
               AND u.user_status = 'active'`,
            [
                collegeId,
                RECIPIENT_TYPE.USER,
                `Round Processed: ${ctx.round_name} — ${ctx.job_title}`,
                `Round "${ctx.round_name}" for ${ctx.job_title} (${ctx.company_name}) processed: ${adminSummary}`,
                NOTIFICATION_TYPE.ROUND_PROCESSING_COMPLETE,
                'round',
                roundId,
            ]
        );

        // 6. Mark round as processed (inside same transaction)
        await client.query(
            `UPDATE job_rounds SET is_processed = true WHERE round_id = $1`,
            [roundId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.AUTH} Round processed`, {
            roundId,
            roundName: ctx.round_name,
            jobId: ctx.job_id,
            isFinalRound,
            selected: categories.toSelect.length,
            advanced: categories.toAdvance.length,
            rejected: categories.toReject.length,
            absent: categories.toAbsent.length,
            onHold: categories.onHold.length,
            skipped: categories.skipped.length,
            collegeId,
        });

        return {
            round: {
                round_id: ctx.round_id,
                round_name: ctx.round_name,
                round_number: ctx.round_number,
                is_final_round: isFinalRound,
                job_title: ctx.job_title,
                company_name: ctx.company_name,
            },
            processed: {
                selected: categories.toSelect.length,
                advanced: categories.toAdvance.length,
                rejected: categories.toReject.length,
                absent_marked: categories.toAbsent.length,
                on_hold: categories.onHold.length,
                skipped: categories.skipped.length,
                notifications_sent: notifications.length,
            },
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
    previewRoundProcessing,
    processRound,
};
