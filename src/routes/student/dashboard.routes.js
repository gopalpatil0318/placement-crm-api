/**
 * ============================================================================
 * STUDENT DASHBOARD ROUTES — Dashboard Overview Endpoint
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET  /get_dashboard_overview  authenticate
 *
 * No rate limiter on GET routes (per project standards)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/dashboard.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================

// Get composite dashboard overview (single endpoint, 1 DB round-trip)
router.get(
    '/get_dashboard_overview',
    authenticate,
    asyncHandler(controller.getDashboardOverview)
);

module.exports = router;
