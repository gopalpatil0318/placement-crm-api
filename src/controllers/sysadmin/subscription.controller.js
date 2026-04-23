/**
 * ============================================================================
 * SUBSCRIPTION CONTROLLER — Route Handlers for Subscription & Billing (E12)
 * ============================================================================
 *  1  POST   /api/sysadmin/colleges/:collegeId/subscriptions         Create
 *  2  GET    /api/sysadmin/colleges/:collegeId/subscriptions         List
 *  3  GET    /api/sysadmin/colleges/:collegeId/subscriptions/current Current + quota
 *  4  PUT    /api/sysadmin/colleges/:collegeId/subscriptions/:subId  Update
 *  5  POST   /api/sysadmin/subscriptions/:subId/payments             Record payment
 *  6  GET    /api/sysadmin/subscriptions/:subId/payments             List payments
 *  7  GET    /api/sysadmin/billing/overview                          Billing dashboard
 *  8  GET    /api/sysadmin/billing/summary                           Summary cards
 * ============================================================================
 */

const subscriptionService = require('../../services/sysadmin/subscription.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { logAudit } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const { SUCCESS_MESSAGES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');

// ============================================================================
// 1. POST /api/sysadmin/colleges/:collegeId/subscriptions
// ============================================================================
async function createSubscription(req, res) {
    const { collegeId } = req.params;
    const data = req.validated;
    const userId = req.user.id;

    const subscription = await subscriptionService.createSubscription(
        collegeId, data, userId
    );

    // Fire-and-forget audit
    logAudit(query, {
        collegeId,
        userId,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION,
        resourceId: subscription.subscription_id,
        summary: `Subscription created: ${data.subscription_status}, quota ${data.student_quota}`,
        newValue: {
            subscription_status: data.subscription_status,
            student_quota: data.student_quota,
            price_per_student: data.price_per_student,
            total_amount: data.total_amount,
            valid_from: data.valid_from,
            valid_to: data.valid_to,
        },
    });

    return sendCreated(res, subscription, SUCCESS_MESSAGES.SUBSCRIPTION_CREATED);
}

// ============================================================================
// 2. GET /api/sysadmin/colleges/:collegeId/subscriptions
// ============================================================================
async function listSubscriptions(req, res) {
    const { collegeId } = req.params;
    const subscriptions = await subscriptionService.listSubscriptions(collegeId);
    return sendSuccess(res, subscriptions, SUCCESS_MESSAGES.SUBSCRIPTIONS_RETRIEVED);
}

// ============================================================================
// 3. GET /api/sysadmin/colleges/:collegeId/subscriptions/current
// ============================================================================
async function getCurrentSubscription(req, res) {
    const { collegeId } = req.params;
    const current = await subscriptionService.getCurrentSubscription(collegeId);
    return sendSuccess(res, current, SUCCESS_MESSAGES.SUBSCRIPTION_RETRIEVED);
}

// ============================================================================
// 4. PUT /api/sysadmin/colleges/:collegeId/subscriptions/:subId
// ============================================================================
async function updateSubscription(req, res) {
    const { collegeId, subId } = req.params;
    const data = req.validated;
    const userId = req.user.id;

    const subscription = await subscriptionService.updateSubscription(
        collegeId, subId, data
    );

    // Fire-and-forget audit
    logAudit(query, {
        collegeId,
        userId,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION,
        resourceId: subId,
        summary: `Subscription updated: ${Object.keys(data).join(', ')}`,
        newValue: data,
    });

    return sendSuccess(res, subscription, SUCCESS_MESSAGES.SUBSCRIPTION_UPDATED);
}

// ============================================================================
// 5. POST /api/sysadmin/subscriptions/:subId/payments
// ============================================================================
async function recordPayment(req, res) {
    const { subId } = req.params;
    const data = req.validated;
    const userId = req.user.id;

    const result = await subscriptionService.recordPayment(
        subId, data, userId
    );

    // Fire-and-forget audit
    logAudit(query, {
        collegeId: result.payment.college_id,
        userId,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION,
        resourceId: result.payment.payment_id,
        summary: `Payment recorded: ₹${data.amount} via ${data.payment_method}`,
        newValue: {
            amount: data.amount,
            payment_date: data.payment_date,
            payment_method: data.payment_method,
            transaction_reference: data.transaction_reference,
            subscription_status: result.subscription_status,
        },
    });

    return sendCreated(res, result, SUCCESS_MESSAGES.PAYMENT_RECORDED);
}

// ============================================================================
// 6. GET /api/sysadmin/subscriptions/:subId/payments
// ============================================================================
async function listPayments(req, res) {
    const { subId } = req.params;
    const result = await subscriptionService.listPayments(subId, req.validated || req.query);

    return sendPaginated(res, result.payments, result.total, { page: result.page, limit: result.limit }, SUCCESS_MESSAGES.PAYMENTS_RETRIEVED);
}

// ============================================================================
// 7. GET /api/sysadmin/billing/overview
// ============================================================================
async function getBillingOverview(req, res) {
    const filters = req.validated || req.query;
    const result = await subscriptionService.getBillingOverview(filters);

    return sendPaginated(res, result.colleges, result.total, { page: result.page, limit: result.limit }, SUCCESS_MESSAGES.BILLING_OVERVIEW_RETRIEVED);
}

// ============================================================================
// 8. GET /api/sysadmin/billing/summary
// ============================================================================
async function getBillingSummary(req, res) {
    const summary = await subscriptionService.getBillingSummary();
    return sendSuccess(res, summary, SUCCESS_MESSAGES.BILLING_OVERVIEW_RETRIEVED);
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
