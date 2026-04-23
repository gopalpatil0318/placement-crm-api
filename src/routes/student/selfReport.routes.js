/**
 * ============================================================================
 * STUDENT SELF-REPORT ROUTES — Off-Campus Placement Self-Reporting
 * ============================================================================
 * Base path: /api/student/self-report (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST   /                   authenticate + apiLimiter + validate(body)
 *   GET    /                   authenticate + apiLimiter + validate(query)
 *   DELETE /:reportId          authenticate + apiLimiter + validate(params)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/selfReport.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    submitSelfReportSchema,
    listSelfReportsSchema,
    reportIdParamSchema,
} = require('../../validators/student/selfReport.validator');

// ============================================================================
// SELF-REPORT ROUTES
// ============================================================================

// Submit a new self-report
router.post(
    '/',
    authenticate,
    apiLimiter,
    validate(submitSelfReportSchema),
    asyncHandler(controller.submitSelfReport)
);

// List own self-reports (paginated)
router.get(
    '/',
    authenticate,
    apiLimiter,
    validate(listSelfReportsSchema, 'query'),
    asyncHandler(controller.getMySelfReports)
);

// Cancel a pending self-report
router.delete(
    '/:reportId',
    authenticate,
    apiLimiter,
    validate(reportIdParamSchema, 'params'),
    asyncHandler(controller.cancelSelfReport)
);

module.exports = router;
