/**
 * ============================================================================
 * QUOTA HELPER — Student Quota & Passout Year Enforcement (E12)
 * ============================================================================
 * Usage:
 *   const { checkStudentQuota, checkPassoutYearAllowed } = require('./quotaHelper');
 *
 *   // In registerStudent() — after email check, before password hash:
 *   await checkStudentQuota(collegeId);
 *   await checkPassoutYearAllowed(collegeId, passoutYear);
 *
 * Design:
 *   - Single indexed query (~1ms with idx_students_college_active)
 *   - No subscription row → unlimited (backward compat — permanent)
 *   - 'expired' / 'suspended' → hard block on new registrations
 *   - 'trial' → restricted passout years
 *   - 'active' → any passout year within quota
 * ============================================================================
 */

const { query } = require('../config/db');
const { STATUS, ERROR_MESSAGES, LOG } = require('../config/constants');
const logger = require('../config/logger');

/**
 * Execute a query using either a transaction client or the pool.
 * @param {Object|null} client - Transaction client (optional)
 * @param {string} sql
 * @param {Array} params
 */
function execQuery(client, sql, params) {
    return client ? client.query(sql, params) : query(sql, params);
}

/**
 * Check whether the college can register more students.
 *
 * @param {string} collegeId
 * @param {Object} [client] - Optional transaction client for FOR UPDATE locking
 * @returns {Promise<{ canRegister: boolean, quota: number|null, used: number, remaining: number|null, subscriptionStatus: string, allowedPassoutYears: number[]|null, message: string|null }>}
 */
async function checkStudentQuota(collegeId, client = null) {
    // When inside a transaction, FOR UPDATE locks the subscription row to
    // prevent concurrent quota checks from reading stale counts (TOCTOU fix)
    const forUpdate = client ? 'FOR UPDATE' : '';
    const result = await execQuery(client,
        `SELECT
           cs.subscription_status,
           cs.student_quota,
           cs.allowed_passout_years,
           (SELECT COUNT(*)::int FROM students
            WHERE college_id = $1 AND student_status != $2) AS current_count
         FROM college_subscriptions cs
         WHERE cs.college_id = $1
           AND cs.subscription_status IN ($3, $4)
         ORDER BY cs.valid_from DESC
         LIMIT 1
         ${forUpdate}`,
        [collegeId, STATUS.STUDENT.DROPOUT, STATUS.SUBSCRIPTION.TRIAL, STATUS.SUBSCRIPTION.ACTIVE]
    );

    // No subscription row → unlimited (backward compat for existing colleges)
    if (!result.rows.length) {
        // Still count students for informational purposes
        const countResult = await execQuery(client,
            `SELECT COUNT(*)::int AS current_count FROM students
             WHERE college_id = $1 AND student_status != $2`,
            [collegeId, STATUS.STUDENT.DROPOUT]
        );
        return {
            canRegister: true,
            quota: null,
            used: countResult.rows[0].current_count,
            remaining: null,
            subscriptionStatus: STATUS.SUBSCRIPTION.NONE,
            allowedPassoutYears: null,
            message: null,
        };
    }

    const { subscription_status, student_quota, allowed_passout_years, current_count } = result.rows[0];

    const remaining = Math.max(student_quota - current_count, 0);

    if (current_count >= student_quota) {
        logger.warn(`${LOG.AUTH} Quota exceeded`, {
            collegeId, quota: student_quota, used: current_count,
        });
        return {
            canRegister: false,
            quota: student_quota,
            used: current_count,
            remaining: 0,
            subscriptionStatus: subscription_status,
            allowedPassoutYears: allowed_passout_years,
            message: `${ERROR_MESSAGES.QUOTA_EXCEEDED} (${student_quota} slots, ${current_count} used)`,
        };
    }

    return {
        canRegister: true,
        quota: student_quota,
        used: current_count,
        remaining,
        subscriptionStatus: subscription_status,
        allowedPassoutYears: allowed_passout_years,
        message: null,
    };
}

/**
 * Check whether a specific passout year is allowed under the current subscription.
 * Trial subscriptions restrict to allowed_passout_years (typically [default_academic_year]).
 *
 * @param {string} collegeId
 * @param {number} passoutYear
 * @returns {Promise<{ allowed: boolean, allowedYears: number[]|null, message: string|null }>}
 */
async function checkPassoutYearAllowed(collegeId, passoutYear) {
    const result = await query(
        `SELECT cs.allowed_passout_years, cs.subscription_status
         FROM college_subscriptions cs
         WHERE cs.college_id = $1
           AND cs.subscription_status IN ($2, $3)
         ORDER BY cs.valid_from DESC
         LIMIT 1`,
        [collegeId, STATUS.SUBSCRIPTION.TRIAL, STATUS.SUBSCRIPTION.ACTIVE]
    );

    // No subscription → any year allowed
    if (!result.rows.length) {
        return { allowed: true, allowedYears: null, message: null };
    }

    const { allowed_passout_years } = result.rows[0];

    // NULL array → any year allowed (paid subscriptions typically have NULL)
    if (!allowed_passout_years || allowed_passout_years.length === 0) {
        return { allowed: true, allowedYears: null, message: null };
    }

    if (!allowed_passout_years.includes(passoutYear)) {
        logger.warn(`${LOG.AUTH} Passout year restricted`, {
            collegeId, passoutYear, allowedYears: allowed_passout_years,
        });
        return {
            allowed: false,
            allowedYears: allowed_passout_years,
            message: `${ERROR_MESSAGES.TRIAL_PASSOUT_YEAR_RESTRICTED} (allowed: ${allowed_passout_years.join(', ')})`,
        };
    }

    return { allowed: true, allowedYears: allowed_passout_years, message: null };
}

/**
 * Combined check: subscription status + quota + passout year.
 * Checks colleges.subscription_status first (fast denormalized column),
 * then does quota + year check only if needed.
 *
 * @param {string} collegeId
 * @param {number} passoutYear
 * @param {Object} [client] - Optional transaction client for atomic quota enforcement
 * @returns {Promise<void>} Throws on failure
 */
async function enforceRegistrationQuota(collegeId, passoutYear, client = null) {
    // 1. Check denormalized subscription_status on colleges table (already in DB)
    const subStatus = await getSubscriptionStatus(collegeId);
    validateSubscriptionStatus(subStatus);
    if (!subStatus || subStatus === STATUS.SUBSCRIPTION.NONE) return;

    // 2. Check quota (with FOR UPDATE lock when inside transaction)
    const quotaResult = await checkStudentQuota(collegeId, client);
    if (!quotaResult.canRegister) {
        throw Object.assign(new Error(quotaResult.message), { status: 403 });
    }

    // 3. Check passout year restriction (trials only)
    const yearResult = await checkPassoutYearAllowed(collegeId, passoutYear);
    if (!yearResult.allowed) {
        throw Object.assign(new Error(yearResult.message), { status: 403 });
    }
}

/**
 * Bulk variant: check if N students can be registered at once.
 * Also validates all passout years in the batch.
 *
 * @param {string} collegeId
 * @param {number} count - Number of students to register
 * @param {number[]} passoutYears - Unique passout years in the batch
 * @param {Object} [client] - Optional transaction client for atomic quota enforcement
 * @returns {Promise<void>} Throws on failure
 */
async function enforceRegistrationQuotaBulk(collegeId, count, passoutYears, client = null) {
    // 1. Check subscription status (reuse shared helper)
    const subStatus = await getSubscriptionStatus(collegeId);
    validateSubscriptionStatus(subStatus);
    if (!subStatus || subStatus === STATUS.SUBSCRIPTION.NONE) return;

    // 2. Check quota with batch size (with FOR UPDATE lock when inside transaction)
    const quotaResult = await checkStudentQuota(collegeId, client);
    if (quotaResult.quota !== null && count > quotaResult.remaining) {
        throw Object.assign(
            new Error(
                `${ERROR_MESSAGES.QUOTA_EXCEEDED_BULK} (${quotaResult.remaining} slots remaining out of ${quotaResult.quota}, attempted to register ${count})`
            ),
            { status: 403 }
        );
    }

    // 3. Check passout year restrictions for all unique years in batch
    await validatePassoutYearsBulk(collegeId, passoutYears);
}

/**
 * Fetch college subscription_status. Returns null if college not found.
 */
async function getSubscriptionStatus(collegeId) {
    const result = await query(
        `SELECT subscription_status FROM colleges WHERE college_id = $1`,
        [collegeId]
    );
    return result.rows.length ? result.rows[0].subscription_status : null;
}

/**
 * Throw if subscription is expired or suspended.
 */
function validateSubscriptionStatus(subStatus) {
    if (subStatus === STATUS.SUBSCRIPTION.EXPIRED) {
        throw Object.assign(new Error(ERROR_MESSAGES.SUBSCRIPTION_EXPIRED), { status: 403 });
    }
    if (subStatus === STATUS.SUBSCRIPTION.SUSPENDED) {
        throw Object.assign(new Error(ERROR_MESSAGES.SUBSCRIPTION_SUSPENDED), { status: 403 });
    }
}

/**
 * Validate all passout years against allowed list. Throws on first disallowed year.
 */
async function validatePassoutYearsBulk(collegeId, passoutYears) {
    if (!passoutYears.length) return;

    const yearResult = await checkPassoutYearAllowed(collegeId, passoutYears[0]);
    if (!yearResult.allowedYears) return;

    const disallowed = passoutYears.find(y => !yearResult.allowedYears.includes(y));
    if (disallowed) {
        throw Object.assign(
            new Error(
                `${ERROR_MESSAGES.TRIAL_PASSOUT_YEAR_RESTRICTED} (allowed: ${yearResult.allowedYears.join(', ')}, found: ${disallowed})`
            ),
            { status: 403 }
        );
    }
}

module.exports = {
    checkStudentQuota,
    checkPassoutYearAllowed,
    enforceRegistrationQuota,
    enforceRegistrationQuotaBulk,
};
