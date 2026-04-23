/**
 * ============================================================================
 * STUDENT PLACEMENT POLICY ROUTES — Read-Only Policy Access
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET  /get_placement_policies    authenticate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/placementPolicy.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================================
// POLICY ROUTES
// ============================================================================

// Get active placement policies for student's college + passout year
router.get(
    '/get_placement_policies',
    authenticate,
    asyncHandler(controller.getActivePolicies)
);

module.exports = router;
