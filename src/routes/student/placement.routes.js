/**
 * ============================================================================
 * STUDENT PLACEMENT ROUTES — Own Placement Results Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET   /get_my_placements                    authenticate + validate(query)
 *   PATCH /accept_placement/:placementId        authenticate + apiLimiter
 *   PATCH /decline_placement/:placementId       authenticate + apiLimiter + validate
 *   PATCH /reject_placement/:placementId        (alias — backward-compat)
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
    uploadDocumentsSchema,
} = require('../../validators/student/placement.validator');

// ============================================================================
// PLACEMENT ROUTES
// ============================================================================

// Apply rate limiting to all routes
router.use(apiLimiter);

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
    validate(placementIdParamSchema, 'params'),
    asyncHandler(controller.acceptPlacement)
);

// Decline a placement offer (primary endpoint)
router.patch(
    '/decline_placement/:placementId',
    authenticate,
    validate(placementIdParamSchema, 'params'),
    validate(rejectPlacementSchema),
    asyncHandler(controller.declinePlacement)
);

// Reject a placement offer (backward-compatible alias)
router.patch(
    '/reject_placement/:placementId',
    authenticate,
    validate(placementIdParamSchema, 'params'),
    validate(rejectPlacementSchema),
    asyncHandler(controller.rejectPlacement)
);

// Upload placement documents (offer letter / joining letter URL)
router.patch(
    '/upload_placement_documents/:placementId',
    authenticate,
    validate(placementIdParamSchema, 'params'),
    validate(uploadDocumentsSchema),
    asyncHandler(controller.uploadDocuments)
);

module.exports = router;
