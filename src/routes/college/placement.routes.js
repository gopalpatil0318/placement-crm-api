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
 *   PATCH /verify_offer_letter/:placementId       Verify/reject offer letter
 *   PATCH /verify_joining_letter/:placementId     Verify/reject joining letter
 *   PATCH /update_placement_status/:placementId   Change placement status
 *   PATCH /revert_application/:applicationId      Revert rejected app → selected
 *   POST  /bulk_create_placements                 Bulk offer creation
 *   POST  /record_external_placement              One-click external placement
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/placement.controller');
const externalPlacementController = require('../../controllers/college/externalPlacement.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter, bulkLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    createPlacementSchema,
    listPlacementsSchema,
    updatePlacementSchema,
    verifyOfferLetterSchema,
    verifyJoiningLetterSchema,
    updatePlacementStatusSchema,
    placementIdParamSchema,
    applicationIdParamSchema,
    bulkCreatePlacementsSchema,
} = require('../../validators/college/placement.validator');

const { recordExternalPlacementSchema } = require('../../validators/college/externalPlacement.validator');

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
    '/verify_joining_letter/:placementId',
    validate(placementIdParamSchema, 'params'),
    validate(verifyJoiningLetterSchema),
    asyncHandler(controller.verifyJoiningLetter)
);

router.patch(
    '/update_placement_status/:placementId',
    validate(placementIdParamSchema, 'params'),
    validate(updatePlacementStatusSchema),
    asyncHandler(controller.updatePlacementStatus)
);

router.patch(
    '/revert_application/:applicationId',
    validate(applicationIdParamSchema, 'params'),
    asyncHandler(controller.revertApplication)
);

router.post(
    '/bulk_create_placements',
    bulkLimiter,
    validate(bulkCreatePlacementsSchema),
    asyncHandler(controller.bulkCreatePlacements)
);

router.post(
    '/record_external_placement',
    validate(recordExternalPlacementSchema),
    asyncHandler(externalPlacementController.recordExternalPlacement)
);

module.exports = router;
