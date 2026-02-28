/**
 * ============================================================================
 * STUDENT PROFILE ROUTES — Profile Data Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET  /get_basic_info          authenticate
 *   GET  /get_full_profile        authenticate
 *   GET  /get_profile_completion  authenticate
 *
 * No rate limiter on GET routes (per project standards)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/profile.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const asyncHandler = require('../../utils/asyncHandler');

// ============================================================================
// PROFILE ROUTES
// ============================================================================

// Get own basic info (student + department)
router.get(
    '/get_basic_info',
    authenticate,
    asyncHandler(controller.getBasicInfo)
);

// Get complete profile (all tables + completion %)
router.get(
    '/get_full_profile',
    authenticate,
    asyncHandler(controller.getFullProfile)
);

// Get profile completion percentage breakdown
router.get(
    '/get_profile_completion',
    authenticate,
    asyncHandler(controller.getProfileCompletion)
);

module.exports = router;
