/**
 * ============================================================================
 * STUDENT PROFILE LINKS ROUTES
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   PUT  /save_profile_links    authenticate + apiLimiter + validate
 *   GET  /get_profile_links     authenticate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/profileLinks.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    saveProfileLinksSchema,
} = require('../../validators/student/profileLinks.validator');

// ============================================================================
// PROFILE LINKS ROUTES
// ============================================================================

// Save profile links (upsert — create or update)
router.put(
    '/save_profile_links',
    authenticate,
    apiLimiter,
    validate(saveProfileLinksSchema),
    asyncHandler(controller.saveProfileLinks)
);

// Get own profile links
router.get(
    '/get_profile_links',
    authenticate,
    asyncHandler(controller.getProfileLinks)
);

module.exports = router;
