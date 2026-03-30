/**
 * ============================================================================
 * PLACEMENT RESULT ROUTES — Placement Record Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /create_placement                       Create placement
 *   GET   /get_all_placements                     List placements
 *   GET   /get_placement/:placementId             Single placement detail
 *   PUT   /update_placement/:placementId          Update placement fields
 *   PATCH /verify_offer_letter/:placementId       Verify offer letter
 *   PATCH /update_placement_status/:placementId   Change placement status
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/placement.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    createPlacementSchema,
    listPlacementsSchema,
    updatePlacementSchema,
    verifyOfferLetterSchema,
    updatePlacementStatusSchema,
    placementIdParamSchema,
} = require('../../validators/college/placement.validator');

// All routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO));
router.use(apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_placement',
    validate(createPlacementSchema),
    asyncHandler(controller.createPlacement)
);

router.get(
    '/get_all_placements',
    validate(listPlacementsSchema, 'query'),
    asyncHandler(controller.getAllPlacements)
);

router.get(
    '/get_placement/:placementId',
    validate(placementIdParamSchema, 'params'),
    asyncHandler(controller.getPlacement)
);

router.put(
    '/update_placement/:placementId',
    validate(placementIdParamSchema, 'params'),
    validate(updatePlacementSchema),
    asyncHandler(controller.updatePlacement)
);

router.patch(
    '/verify_offer_letter/:placementId',
    validate(placementIdParamSchema, 'params'),
    validate(verifyOfferLetterSchema),
    asyncHandler(controller.verifyOfferLetter)
);

router.patch(
    '/update_placement_status/:placementId',
    validate(placementIdParamSchema, 'params'),
    validate(updatePlacementStatusSchema),
    asyncHandler(controller.updatePlacementStatus)
);

module.exports = router;
