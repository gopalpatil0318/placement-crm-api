/**
 * ============================================================================
 * PUBLIC SUBMISSION ROUTES — Express Router for Public Form APIs
 * ============================================================================
 * Base path: /api/public
 *
 * #   Method   Endpoint               Middleware
 * 1   POST     /demo-request          publicFormLimiter + validate
 * 2   POST     /contact-inquiry       publicFormLimiter + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/public/submissions.controller');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { publicFormLimiter } = require('../../config/rateLimiter');

const {
    demoRequestSchema,
    contactInquirySchema,
} = require('../../validators/public/submissions.validator');

// ============================================================================
// 1. SUBMIT DEMO REQUEST (public — no auth)
// ============================================================================
router.post(
    '/demo-request',
    publicFormLimiter,
    validate(demoRequestSchema),
    asyncHandler(controller.submitDemoRequest)
);

// ============================================================================
// 2. SUBMIT CONTACT INQUIRY (public — no auth)
// ============================================================================
router.post(
    '/contact-inquiry',
    publicFormLimiter,
    validate(contactInquirySchema),
    asyncHandler(controller.submitContactInquiry)
);

module.exports = router;
