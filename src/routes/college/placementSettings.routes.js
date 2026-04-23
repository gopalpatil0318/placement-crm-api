/**
 * ============================================================================
 * PLACEMENT SETTINGS ROUTES — Policy Settings Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   GET  /get_placement_settings        Get settings for a year
 *   PUT  /upsert_placement_settings     Create or update settings
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/placementSettings.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    upsertSettingsSchema,
    getSettingsSchema,
} = require('../../validators/college/placementSettings.validator');

router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/get_placement_settings',
    requirePermission(PERMISSIONS.SETTINGS_VIEW),
    validate(getSettingsSchema, 'query'),
    asyncHandler(controller.getSettings)
);

router.put(
    '/upsert_placement_settings',
    requirePermission(PERMISSIONS.SETTINGS_MANAGE),
    validate(upsertSettingsSchema),
    asyncHandler(controller.upsertSettings)
);

module.exports = router;
