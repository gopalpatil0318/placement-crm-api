/**
 * ============================================================================
 * SUBSCRIPTION VALIDATORS — Joi Schemas for Subscription & Billing Endpoints
 * ============================================================================
 */

const Joi = require('joi');
const { SUBSCRIPTION_STATUSES, PAYMENT_METHODS } = require('../../config/constants');

// Reusable: UUID param
const collegeIdParam = Joi.object({
    collegeId: Joi.string().uuid().required(),
});

const subscriptionIdParam = Joi.object({
    subId: Joi.string().uuid().required(),
});

const collegeAndSubParams = Joi.object({
    collegeId: Joi.string().uuid().required(),
    subId: Joi.string().uuid().required(),
});

// ============================================================================
// POST /api/sysadmin/colleges/:collegeId/subscriptions
// ============================================================================
const createSubscriptionSchema = Joi.object({
    subscription_status: Joi.string()
        .valid('trial', 'active')
        .default('trial')
        .messages({ 'any.only': 'Status must be "trial" or "active" when creating' }),

    student_quota: Joi.number()
        .integer()
        .min(1)
        .max(100000)
        .required()
        .messages({
            'number.min': 'Student quota must be at least 1',
            'number.max': 'Student quota cannot exceed 100,000',
            'any.required': 'Student quota is required',
        }),

    price_per_student: Joi.number()
        .min(0)
        .max(100000)
        .default(0)
        .messages({ 'number.max': 'Price per student cannot exceed ₹1,00,000' }),

    total_amount: Joi.number()
        .min(0)
        .max(100000000)
        .default(0)
        .messages({ 'number.max': 'Total amount cannot exceed ₹10,00,00,000' }),

    trial_ends_at: Joi.date()
        .iso()
        .allow(null)
        .default(null),

    valid_from: Joi.date()
        .iso()
        .required()
        .messages({ 'any.required': 'Valid from date is required' }),

    valid_to: Joi.date()
        .iso()
        .greater(Joi.ref('valid_from'))
        .required()
        .messages({
            'any.required': 'Valid to date is required',
            'date.greater': 'Valid to must be after valid from',
        }),

    grace_period_days: Joi.number()
        .integer()
        .min(0)
        .max(90)
        .default(7),

    allowed_passout_years: Joi.array()
        .items(Joi.number().integer().min(2000).max(2100))
        .allow(null)
        .default(null),

    notes: Joi.string()
        .trim()
        .max(1000)
        .allow('', null)
        .default(null),
});

// ============================================================================
// PUT /api/sysadmin/colleges/:collegeId/subscriptions/:subId
// ============================================================================
const updateSubscriptionSchema = Joi.object({
    subscription_status: Joi.string()
        .valid(...SUBSCRIPTION_STATUSES.filter((s) => s !== 'none')),

    student_quota: Joi.number()
        .integer()
        .min(1)
        .max(100000),

    price_per_student: Joi.number()
        .min(0)
        .max(100000),

    total_amount: Joi.number()
        .min(0)
        .max(100000000),

    trial_ends_at: Joi.date()
        .iso()
        .allow(null),

    valid_from: Joi.date()
        .iso(),

    valid_to: Joi.date()
        .iso(),

    grace_period_days: Joi.number()
        .integer()
        .min(0)
        .max(90),

    allowed_passout_years: Joi.array()
        .items(Joi.number().integer().min(2000).max(2100))
        .allow(null),

    notes: Joi.string()
        .trim()
        .max(1000)
        .allow('', null),
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

// ============================================================================
// POST /api/sysadmin/subscriptions/:subId/payments
// ============================================================================
const recordPaymentSchema = Joi.object({
    amount: Joi.number()
        .positive()
        .max(100000000)
        .required()
        .messages({
            'number.positive': 'Payment amount must be greater than zero',
            'any.required': 'Payment amount is required',
        }),

    payment_date: Joi.date()
        .iso()
        .required()
        .messages({ 'any.required': 'Payment date is required' }),

    payment_method: Joi.string()
        .valid(...PAYMENT_METHODS)
        .default('bank_transfer'),

    transaction_reference: Joi.string()
        .trim()
        .max(200)
        .allow('', null)
        .default(null),

    receipt_number: Joi.string()
        .trim()
        .max(100)
        .allow('', null)
        .default(null),

    notes: Joi.string()
        .trim()
        .max(1000)
        .allow('', null)
        .default(null),
});

// ============================================================================
// GET query schemas
// ============================================================================
const billingOverviewQuery = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    status: Joi.string().valid('all', 'trial', 'active', 'expired', 'suspended', 'none', 'overdue').default('all'),
    search: Joi.string().trim().max(100).allow('').default(''),
});

const listPaymentsQuery = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
    collegeIdParam,
    subscriptionIdParam,
    collegeAndSubParams,
    createSubscriptionSchema,
    updateSubscriptionSchema,
    recordPaymentSchema,
    billingOverviewQuery,
    listPaymentsQuery,
};
