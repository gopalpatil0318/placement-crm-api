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
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter, bulkLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

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

const selfReportController = require('../../controllers/college/selfReport.controller');
const {
    listSelfReportsSchema: listSelfReportsQuerySchema,
    selfReportStatsSchema,
    reportIdParamSchema: selfReportIdParamSchema,
    reviewSelfReportSchema,
} = require('../../validators/college/selfReport.validator');

// All routes require authentication
router.use(authenticate);
router.use(apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_placement',
    requirePermission(PERMISSIONS.PLACEMENTS_CREATE),
    validate(createPlacementSchema),
    asyncHandler(controller.createPlacement)
);

router.get(
    '/get_all_placements',
    requirePermission(PERMISSIONS.PLACEMENTS_VIEW),
    validate(listPlacementsSchema, 'query'),
    asyncHandler(controller.getAllPlacements)
);

router.get(
    '/get_placement/:placementId',
    requirePermission(PERMISSIONS.PLACEMENTS_VIEW),
    validate(placementIdParamSchema, 'params'),
    asyncHandler(controller.getPlacement)
);

router.put(
    '/update_placement/:placementId',
    requirePermission(PERMISSIONS.PLACEMENTS_MANAGE),
    validate(placementIdParamSchema, 'params'),
    validate(updatePlacementSchema),
    asyncHandler(controller.updatePlacement)
);

router.patch(
    '/verify_offer_letter/:placementId',
    requirePermission(PERMISSIONS.PLACEMENTS_MANAGE),
    validate(placementIdParamSchema, 'params'),
    validate(verifyOfferLetterSchema),
    asyncHandler(controller.verifyOfferLetter)
);

router.patch(
    '/verify_joining_letter/:placementId',
    requirePermission(PERMISSIONS.PLACEMENTS_MANAGE),
    validate(placementIdParamSchema, 'params'),
    validate(verifyJoiningLetterSchema),
    asyncHandler(controller.verifyJoiningLetter)
);

router.patch(
    '/update_placement_status/:placementId',
    requirePermission(PERMISSIONS.PLACEMENTS_MANAGE),
    validate(placementIdParamSchema, 'params'),
    validate(updatePlacementStatusSchema),
    asyncHandler(controller.updatePlacementStatus)
);

router.patch(
    '/revert_application/:applicationId',
    requirePermission(PERMISSIONS.PLACEMENTS_MANAGE),
    validate(applicationIdParamSchema, 'params'),
    asyncHandler(controller.revertApplication)
);

router.post(
    '/bulk_create_placements',
    requirePermission(PERMISSIONS.PLACEMENTS_CREATE),
    bulkLimiter,
    validate(bulkCreatePlacementsSchema),
    asyncHandler(controller.bulkCreatePlacements)
);

router.post(
    '/record_external_placement',
    requirePermission(PERMISSIONS.PLACEMENTS_CREATE),
    validate(recordExternalPlacementSchema),
    asyncHandler(externalPlacementController.recordExternalPlacement)
);

// ============================================================================
// SELF-REPORT REVIEW ROUTES
// ============================================================================

router.get(
    '/self-reports',
    requirePermission(PERMISSIONS.SELF_REPORTS_VIEW),
    validate(listSelfReportsQuerySchema, 'query'),
    asyncHandler(selfReportController.getPendingSelfReports)
);

router.get(
    '/self-reports/stats',
    requirePermission(PERMISSIONS.SELF_REPORTS_VIEW),
    validate(selfReportStatsSchema, 'query'),
    asyncHandler(selfReportController.getSelfReportStats)
);

router.get(
    '/self-reports/:reportId',
    requirePermission(PERMISSIONS.SELF_REPORTS_VIEW),
    validate(selfReportIdParamSchema, 'params'),
    asyncHandler(selfReportController.getSelfReportById)
);

router.patch(
    '/self-reports/:reportId/review',
    requirePermission(PERMISSIONS.SELF_REPORTS_REVIEW),
    validate(selfReportIdParamSchema, 'params'),
    validate(reviewSelfReportSchema),
    asyncHandler(selfReportController.reviewSelfReport)
);

module.exports = router;
