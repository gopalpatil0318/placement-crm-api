/**
 * ============================================================================
 * SUBSCRIPTION SERVICE — Subscription & Billing Business Logic (E12)
 * ============================================================================
 *   - createSubscription(collegeId, data, createdBy)
 *   - listSubscriptions(collegeId)
 *   - getCurrentSubscription(collegeId)
 *   - updateSubscription(collegeId, subId, data)
 *   - recordPayment(subId, data, recordedBy)
 *   - listPayments(subId, pagination)
 *   - getBillingOverview(filters, pagination)
 *   - getOverdueColleges()
 * ============================================================================
 */

const { query, getClient } = require('../../config/db');
const { getPagination } = require('../../utils/pagination');
const logger = require('../../config/logger');
const {
    LOG,
    STATUS,
    ERROR_MESSAGES,
    DB_ERROR_CODES,
} = require('../../config/constants');

/** Escape ILIKE special characters: % _ \\ */
function escapeIlike(str) {
    // NOSONAR — backslash escaping requires literal \\ strings
    return str.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_'); // NOSONAR
}

// ============================================================================
// 1. CREATE SUBSCRIPTION
// ============================================================================

/**
 * Create a new subscription for a college. Updates colleges.subscription_status
 * in the same transaction to keep the denormalized column in sync.
 */
async function createSubscription(collegeId, data, createdBy) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Verify the college exists
        const collegeResult = await client.query(
            `SELECT college_id FROM colleges WHERE college_id = $1`,
            [collegeId]
        );
        if (!collegeResult.rows.length) {
            throw Object.assign(new Error('College not found'), { status: 404 });
        }

        // Prevent overlapping active/trial subscriptions
        const overlapResult = await client.query(
            `SELECT subscription_id FROM college_subscriptions
             WHERE college_id = $1
               AND subscription_status IN ($2, $3)
               AND valid_to >= $4 AND valid_from <= $5
             LIMIT 1`,
            [collegeId, STATUS.SUBSCRIPTION.TRIAL, STATUS.SUBSCRIPTION.ACTIVE, data.valid_from, data.valid_to]
        );
        if (overlapResult.rows.length) {
            throw Object.assign(
                new Error('An active or trial subscription already exists for this period. Update the existing subscription or choose non-overlapping dates.'),
                { status: 409 }
            );
        }

        const result = await client.query(
            `INSERT INTO college_subscriptions (
                college_id, subscription_status, student_quota,
                price_per_student, total_amount, amount_paid,
                trial_ends_at, valid_from, valid_to,
                grace_period_days, allowed_passout_years, notes, created_by
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING *`,
            [
                collegeId,
                data.subscription_status,
                data.student_quota,
                data.price_per_student,
                data.total_amount,
                0, // amount_paid starts at 0
                data.trial_ends_at,
                data.valid_from,
                data.valid_to,
                data.grace_period_days,
                data.allowed_passout_years,
                data.notes,
                createdBy,
            ]
        );

        // Sync denormalized column
        await client.query(
            `UPDATE colleges SET subscription_status = $1, updated_at = NOW()
             WHERE college_id = $2`,
            [data.subscription_status, collegeId]
        );

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Subscription created`, {
            subscriptionId: result.rows[0].subscription_id,
            collegeId,
            status: data.subscription_status,
            quota: data.student_quota,
        });

        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');

        if (err.code === DB_ERROR_CODES.UNIQUE_VIOLATION) {
            throw Object.assign(new Error(ERROR_MESSAGES.SUBSCRIPTION_DUPLICATE_PERIOD), { status: 409 });
        }
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 2. LIST SUBSCRIPTIONS (all for a college)
// ============================================================================

async function listSubscriptions(collegeId) {
    const result = await query(
        `SELECT cs.*,
                (SELECT COUNT(*)::int FROM subscription_payments sp
                 WHERE sp.subscription_id = cs.subscription_id) AS payment_count
         FROM college_subscriptions cs
         WHERE cs.college_id = $1
         ORDER BY cs.valid_from DESC`,
        [collegeId]
    );
    return result.rows;
}

// ============================================================================
// 3. GET CURRENT (active or trial) SUBSCRIPTION + quota usage
// ============================================================================

async function getCurrentSubscription(collegeId) {
    const result = await query(
        `SELECT cs.*,
                (SELECT COUNT(*)::int FROM students
                 WHERE college_id = $1 AND student_status != $2) AS students_used
         FROM college_subscriptions cs
         WHERE cs.college_id = $1
           AND cs.subscription_status IN ($3, $4)
         ORDER BY cs.valid_from DESC
         LIMIT 1`,
        [collegeId, STATUS.STUDENT.DROPOUT, STATUS.SUBSCRIPTION.TRIAL, STATUS.SUBSCRIPTION.ACTIVE]
    );

    if (!result.rows.length) {
        // Return usage info even without subscription (backward compat)
        const countResult = await query(
            `SELECT COUNT(*)::int AS students_used FROM students
             WHERE college_id = $1 AND student_status != $2`,
            [collegeId, STATUS.STUDENT.DROPOUT]
        );
        return {
            subscription: null,
            students_used: countResult.rows[0].students_used,
            subscription_status: STATUS.SUBSCRIPTION.NONE,
        };
    }

    const sub = result.rows[0];
    return {
        subscription: sub,
        students_used: sub.students_used,
        students_remaining: Math.max(sub.student_quota - sub.students_used, 0),
        subscription_status: sub.subscription_status,
    };
}

// ============================================================================
// 4. UPDATE SUBSCRIPTION
// ============================================================================

async function updateSubscription(collegeId, subId, data) {
    // H4 fix: if both valid_from and valid_to are provided, validate ordering
    if (data.valid_from && data.valid_to) {
        if (new Date(data.valid_to) <= new Date(data.valid_from)) {
            throw Object.assign(new Error('valid_to must be after valid_from'), { status: 400 });
        }
    }

    // Build dynamic SET clause
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    const allowedFields = [
        'subscription_status', 'student_quota', 'price_per_student',
        'total_amount', 'trial_ends_at', 'valid_from', 'valid_to',
        'grace_period_days', 'allowed_passout_years', 'notes',
    ];

    for (const field of allowedFields) {
        if (data[field] !== undefined) {
            setClauses.push(`${field} = $${paramIndex}`);
            params.push(data[field]);
            paramIndex++;
        }
    }

    setClauses.push(`updated_at = NOW()`);

    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Fetch existing row first for cross-field date validation
        const existing = await client.query(
            `SELECT valid_from, valid_to FROM college_subscriptions
             WHERE subscription_id = $1 AND college_id = $2
             FOR UPDATE`,
            [subId, collegeId]
        );

        if (!existing.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SUBSCRIPTION_NOT_FOUND), { status: 404 });
        }

        // H4 fix: validate merged date range when only one date is updated
        const mergedFrom = data.valid_from || existing.rows[0].valid_from;
        const mergedTo = data.valid_to || existing.rows[0].valid_to;
        if (new Date(mergedTo) <= new Date(mergedFrom)) {
            throw Object.assign(new Error('valid_to must be after valid_from (after merge with existing values)'), { status: 400 });
        }

        const result = await client.query(
            `UPDATE college_subscriptions
             SET ${setClauses.join(', ')}
             WHERE subscription_id = $${paramIndex} AND college_id = $${paramIndex + 1}
             RETURNING *`,
            [...params, subId, collegeId]
        );

        if (!result.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SUBSCRIPTION_NOT_FOUND), { status: 404 });
        }

        // Sync denormalized column if status changed
        if (data.subscription_status) {
            await client.query(
                `UPDATE colleges SET subscription_status = $1, updated_at = NOW()
                 WHERE college_id = $2`,
                [data.subscription_status, collegeId]
            );
        }

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Subscription updated`, {
            subscriptionId: subId, collegeId, fields: Object.keys(data),
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
// 5. RECORD PAYMENT
// ============================================================================

async function recordPayment(subId, data, recordedBy) {
    const client = await getClient();

    try {
        await client.query('BEGIN');

        // Verify subscription exists and get current state
        const subResult = await client.query(
            `SELECT subscription_id, college_id, subscription_status, total_amount, amount_paid
             FROM college_subscriptions
             WHERE subscription_id = $1
             FOR UPDATE`,
            [subId]
        );

        if (!subResult.rows.length) {
            throw Object.assign(new Error(ERROR_MESSAGES.SUBSCRIPTION_NOT_FOUND), { status: 404 });
        }

        const sub = subResult.rows[0];

        // Insert payment record
        const paymentResult = await client.query(
            `INSERT INTO subscription_payments (
                subscription_id, college_id, amount, payment_date,
                payment_method, transaction_reference, receipt_number,
                notes, recorded_by
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING *`,
            [
                subId, sub.college_id, data.amount, data.payment_date,
                data.payment_method, data.transaction_reference,
                data.receipt_number, data.notes, recordedBy,
            ]
        );

        // Update amount_paid and auto-compute status
        const newAmountPaid = Number(sub.amount_paid) + Number(data.amount);

        // Only auto-upgrade to active if:
        //  - payment reaches total AND
        //  - current status is NOT suspended (sysadmin must manually reactivate)
        let newStatus = sub.subscription_status;
        if (newAmountPaid >= Number(sub.total_amount)
            && sub.subscription_status !== STATUS.SUBSCRIPTION.SUSPENDED) {
            newStatus = STATUS.SUBSCRIPTION.ACTIVE;
        }

        await client.query(
            `UPDATE college_subscriptions
             SET amount_paid = $1, subscription_status = $2, updated_at = NOW()
             WHERE subscription_id = $3`,
            [newAmountPaid, newStatus, subId]
        );

        // Sync denormalized column if status upgraded
        if (newStatus !== sub.subscription_status) {
            await client.query(
                `UPDATE colleges SET subscription_status = $1, updated_at = NOW()
                 WHERE college_id = $2`,
                [newStatus, sub.college_id]
            );
        }

        await client.query('COMMIT');

        logger.info(`${LOG.TRANSACTION} Payment recorded`, {
            paymentId: paymentResult.rows[0].payment_id,
            subscriptionId: subId,
            amount: data.amount,
            newTotal: newAmountPaid,
            newStatus,
        });

        return {
            payment: paymentResult.rows[0],
            subscription_amount_paid: newAmountPaid,
            subscription_status: newStatus,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ============================================================================
// 6. LIST PAYMENTS for a subscription
// ============================================================================

async function listPayments(subId, pagination) {
    const { page, limit, offset } = getPagination(pagination);

    const [dataResult, countResult] = await Promise.all([
        query(
            `SELECT * FROM subscription_payments
             WHERE subscription_id = $1
             ORDER BY payment_date DESC, recorded_at DESC
             LIMIT $2 OFFSET $3`,
            [subId, limit, offset]
        ),
        query(
            `SELECT COUNT(*)::int AS total FROM subscription_payments
             WHERE subscription_id = $1`,
            [subId]
        ),
    ]);

    return {
        payments: dataResult.rows,
        total: countResult.rows[0].total,
        page,
        limit,
    };
}

// ============================================================================
// 7. BILLING OVERVIEW (all colleges with subscription + quota info)
// ============================================================================

async function getBillingOverview(filters) {
    const { page, limit, offset } = getPagination(filters);
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.search) {
        // Escape ILIKE special characters to prevent wildcard injection
        const escapedSearch = escapeIlike(filters.search);
        conditions.push(`c.college_name ILIKE $${paramIndex}`);
        params.push(`%${escapedSearch}%`);
        paramIndex++;
    }

    if (filters.status && filters.status !== 'all') {
        if (filters.status === 'overdue') {
            // Overdue = subscription exists but expired or amount_paid < total_amount and past valid_to
            conditions.push(`(cs.subscription_status = 'expired' OR (cs.total_amount > 0 AND cs.amount_paid < cs.total_amount AND cs.valid_to < CURRENT_DATE))`);
        } else {
            conditions.push(`COALESCE(cs.subscription_status, c.subscription_status) = $${paramIndex}`);
            params.push(filters.status);
            paramIndex++;
        }
    }

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

    // Save filter-only params for countSql (which doesn't use dropout param)
    const countParams = [...params];

    // Add dropout status as parameterized value (used in dataSql subquery only)
    const dropoutParamIndex = paramIndex;
    params.push(STATUS.STUDENT.DROPOUT);
    paramIndex++;

    const countSql = `
        SELECT COUNT(DISTINCT c.college_id)::int AS total
        FROM colleges c
        LEFT JOIN LATERAL (
            SELECT * FROM college_subscriptions sub
            WHERE sub.college_id = c.college_id
            ORDER BY sub.valid_from DESC LIMIT 1
        ) cs ON true
        ${whereClause}
    `;

    const dataSql = `
        SELECT
            c.college_id,
            c.college_name,
            c.college_type,
            c.college_subdomain,
            c.subscription_status AS college_subscription_status,
            c.default_academic_year,
            cs.subscription_id,
            cs.subscription_status,
            cs.student_quota,
            cs.price_per_student,
            cs.total_amount,
            cs.amount_paid,
            cs.valid_from,
            cs.valid_to,
            cs.trial_ends_at,
            cs.allowed_passout_years,
            (SELECT COUNT(*)::int FROM students s
             WHERE s.college_id = c.college_id AND s.student_status != $${dropoutParamIndex}) AS students_used
        FROM colleges c
        LEFT JOIN LATERAL (
            SELECT * FROM college_subscriptions sub
            WHERE sub.college_id = c.college_id
            ORDER BY sub.valid_from DESC LIMIT 1
        ) cs ON true
        ${whereClause}
        ORDER BY
            CASE cs.subscription_status
                WHEN 'expired' THEN 1
                WHEN 'suspended' THEN 2
                WHEN 'trial' THEN 3
                WHEN 'active' THEN 4
                ELSE 5
            END,
            c.college_name ASC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
        query(countSql, countParams),
        query(dataSql, [...params, limit, offset]),
    ]);

    return {
        colleges: dataResult.rows,
        total: countResult.rows[0].total,
        page,
        limit,
    };
}

// ============================================================================
// 8. BILLING SUMMARY (cards data)
// ============================================================================

async function getBillingSummary() {
    const result = await query(`
        SELECT
            COALESCE(SUM(cs.amount_paid), 0)::numeric AS total_revenue,
            COALESCE(SUM(GREATEST(cs.total_amount - cs.amount_paid, 0)), 0)::numeric AS total_pending,
            COUNT(*) FILTER (WHERE cs.subscription_status = 'expired'
                OR (cs.total_amount > 0 AND cs.amount_paid < cs.total_amount AND cs.valid_to < CURRENT_DATE))::int AS overdue_count,
            (SELECT COUNT(*)::int FROM colleges
             WHERE subscription_status = 'none') AS no_plan_count,
            COUNT(*) FILTER (WHERE cs.subscription_status = 'trial')::int AS trial_count,
            COUNT(*) FILTER (WHERE cs.subscription_status = 'active')::int AS active_count
        FROM college_subscriptions cs
        WHERE cs.subscription_id IN (
            SELECT DISTINCT ON (college_id) subscription_id
            FROM college_subscriptions
            ORDER BY college_id, valid_from DESC
        )
    `);

    return result.rows[0];
}

module.exports = {
    createSubscription,
    listSubscriptions,
    getCurrentSubscription,
    updateSubscription,
    recordPayment,
    listPayments,
    getBillingOverview,
    getBillingSummary,
};
