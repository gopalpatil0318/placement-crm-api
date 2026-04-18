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
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    updateVerificationSettingsSchema,
} = require('../../validators/college/verificationSettings.validator');

// All routes require COLLEGEADMIN
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/get_verification_settings',
    asyncHandler(controller.getVerificationSettings)
);

router.patch(
    '/update_verification_settings',
    validate(updateVerificationSettingsSchema),
    asyncHandler(controller.updateVerificationSettings)
);

module.exports = router;
