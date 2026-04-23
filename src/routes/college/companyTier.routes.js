/**
 * ============================================================================
 * COMPANY TIER ROUTES — Tier Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST   /create_tier                 Add a tier
 *   GET    /get_all_tiers               List all tiers
 *   GET    /get_tier/:tierId            Get single tier
 *   PUT    /update_tier/:tierId         Update tier
 *   DELETE /delete_tier/:tierId         Delete tier
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/companyTier.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    createTierSchema,
    updateTierSchema,
    listTiersSchema,
    tierIdParamSchema,
} = require('../../validators/college/companyTier.validator');

router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_tier',
    requirePermission(PERMISSIONS.SETTINGS_MANAGE),
    validate(createTierSchema),
    asyncHandler(controller.createTier)
);

router.get(
    '/get_all_tiers',
    requirePermission(PERMISSIONS.SETTINGS_VIEW),
    validate(listTiersSchema, 'query'),
    asyncHandler(controller.getAllTiers)
);

router.get(
    '/get_tier/:tierId',
    requirePermission(PERMISSIONS.SETTINGS_VIEW),
    validate(tierIdParamSchema, 'params'),
    asyncHandler(controller.getTier)
);

router.put(
    '/update_tier/:tierId',
    requirePermission(PERMISSIONS.SETTINGS_MANAGE),
    validate(tierIdParamSchema, 'params'),
    validate(updateTierSchema),
    asyncHandler(controller.updateTier)
);

router.delete(
    '/delete_tier/:tierId',
    requirePermission(PERMISSIONS.SETTINGS_MANAGE),
    validate(tierIdParamSchema, 'params'),
    asyncHandler(controller.deleteTier)
);

module.exports = router;
