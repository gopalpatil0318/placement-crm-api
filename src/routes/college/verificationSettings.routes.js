/**
 * ============================================================================
 * VERIFICATION SETTINGS ROUTES — College-Level Config
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN)
 *
 *   GET   /get_verification_settings        — Read current settings
 *   PATCH /update_verification_settings     — Update settings
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/verificationSettings.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    updateVerificationSettingsSchema,
} = require('../../validators/college/verificationSettings.validator');

// All routes require authentication
router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/get_verification_settings',
    requirePermission(PERMISSIONS.SETTINGS_VIEW),
    asyncHandler(controller.getVerificationSettings)
);

router.patch(
    '/update_verification_settings',
    requirePermission(PERMISSIONS.SETTINGS_MANAGE),
    validate(updateVerificationSettingsSchema),
    asyncHandler(controller.updateVerificationSettings)
);

module.exports = router;
