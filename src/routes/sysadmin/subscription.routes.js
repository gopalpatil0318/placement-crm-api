/**
 * ============================================================================
 * SUBSCRIPTION ROUTES — Express Router for Subscription & Billing APIs (E12)
 * ============================================================================
 * Base path: /api/sysadmin
 *
 * #   Method   Endpoint                                                  Purpose
 * 1   POST     /colleges/:collegeId/subscriptions                        Create subscription
 * 2   GET      /colleges/:collegeId/subscriptions                        List subscriptions
 * 3   GET      /colleges/:collegeId/subscriptions/current                Get current + quota
 * 4   PUT      /colleges/:collegeId/subscriptions/:subId                 Update subscription
 * 5   POST     /subscriptions/:subId/payments                            Record payment
 * 6   GET      /subscriptions/:subId/payments                            List payments
 * 7   GET      /billing/overview                                         Billing dashboard
 * 8   GET      /billing/summary                                          Summary cards
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/sysadmin/subscription.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { ROLES } = require('../../config/constants');

const {
    collegeIdParam,
    subscriptionIdParam,
    collegeAndSubParams,
    createSubscriptionSchema,
    updateSubscriptionSchema,
    recordPaymentSchema,
    billingOverviewQuery,
    listPaymentsQuery,
} = require('../../validators/sysadmin/subscription.validator');

// Shorthand: sysadmin-only middleware chain
const sysadminAuth = [authenticate, requireRole(ROLES.SYSADMIN)];

// ============================================================================
// 1. CREATE SUBSCRIPTION
// ============================================================================
router.post(
    '/colleges/:collegeId/subscriptions',
    ...sysadminAuth,
    validate(collegeIdParam, 'params'),
    validate(createSubscriptionSchema),
    asyncHandler(controller.createSubscription)
);

// ============================================================================
// 2. LIST SUBSCRIPTIONS (all for a college)
// ============================================================================
router.get(
    '/colleges/:collegeId/subscriptions',
    ...sysadminAuth,
    validate(collegeIdParam, 'params'),
    asyncHandler(controller.listSubscriptions)
);

// ============================================================================
// 3. GET CURRENT SUBSCRIPTION + quota usage
// ============================================================================
router.get(
    '/colleges/:collegeId/subscriptions/current',
    ...sysadminAuth,
    validate(collegeIdParam, 'params'),
    asyncHandler(controller.getCurrentSubscription)
);

// ============================================================================
// 4. UPDATE SUBSCRIPTION
// ============================================================================
router.put(
    '/colleges/:collegeId/subscriptions/:subId',
    ...sysadminAuth,
    validate(collegeAndSubParams, 'params'),
    validate(updateSubscriptionSchema),
    asyncHandler(controller.updateSubscription)
);

// ============================================================================
// 5. RECORD PAYMENT
// ============================================================================
router.post(
    '/subscriptions/:subId/payments',
    ...sysadminAuth,
    validate(subscriptionIdParam, 'params'),
    validate(recordPaymentSchema),
    asyncHandler(controller.recordPayment)
);

// ============================================================================
// 6. LIST PAYMENTS for a subscription
// ============================================================================
router.get(
    '/subscriptions/:subId/payments',
    ...sysadminAuth,
    validate(subscriptionIdParam, 'params'),
    validate(listPaymentsQuery, 'query'),
    asyncHandler(controller.listPayments)
);

// ============================================================================
// 7. BILLING OVERVIEW (dashboard table)
// ============================================================================
router.get(
    '/billing/overview',
    ...sysadminAuth,
    validate(billingOverviewQuery, 'query'),
    asyncHandler(controller.getBillingOverview)
);

// ============================================================================
// 8. BILLING SUMMARY (cards data)
// ============================================================================
router.get(
    '/billing/summary',
    ...sysadminAuth,
    asyncHandler(controller.getBillingSummary)
);

module.exports = router;
