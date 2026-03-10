/**
 * ============================================================================
 * STUDENT PLACEMENT ROUTES — Own Placement Results Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET   /get_my_placements                    authenticate + validate(query)
 *   PATCH /accept_placement/:placementId        authenticate + apiLimiter
 *   PATCH /reject_placement/:placementId        authenticate + apiLimiter + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/placement.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    listMyPlacementsSchema,
    rejectPlacementSchema,
    placementIdParamSchema,
} = require('../../validators/student/placement.validator');

// ============================================================================
// PLACEMENT ROUTES
// ============================================================================

// List own placement offers/records
router.get(
    '/get_my_placements',
    authenticate,
    validate(listMyPlacementsSchema, 'query'),
    asyncHandler(controller.getMyPlacements)
);

// Accept a placement offer
router.patch(
    '/accept_placement/:placementId',
    authenticate,
    apiLimiter,
    validate(placementIdParamSchema, 'params'),
    asyncHandler(controller.acceptPlacement)
);

// Reject a placement offer
router.patch(
    '/reject_placement/:placementId',
    authenticate,
    apiLimiter,
    validate(placementIdParamSchema, 'params'),
    validate(rejectPlacementSchema),
    asyncHandler(controller.rejectPlacement)
);

module.exports = router;
