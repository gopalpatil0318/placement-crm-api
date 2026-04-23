/**
 * ============================================================================
 * PROFILE ROUTES — Self-Service User Profile Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate (any college user)
 *
 *   GET   /my-profile     Get own profile with departments + college info
 *   PUT   /my-profile     Update own profile (name, phone, picture)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/profile.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
  updateMyProfileSchema,
} = require('../../validators/college/profile.validator');

// ============================================================================
// ROUTES — All require authenticate + apiLimiter
// ============================================================================

router.get(
  '/my-profile',
  authenticate,
  apiLimiter,
  asyncHandler(controller.getMyProfile)
);

router.get(
  '/my-permissions',
  authenticate,
  apiLimiter,
  asyncHandler(controller.getMyPermissions)
);

router.put(
  '/my-profile',
  authenticate,
  apiLimiter,
  validate(updateMyProfileSchema),
  asyncHandler(controller.updateMyProfile)
);

module.exports = router;
