/**
 * ============================================================================
 * PLACEMENT RESULT CONTROLLER — Route Handlers for Placement Records
 * ============================================================================
 *   POST  /api/college/create_placement
 *   GET   /api/college/get_all_placements
 *   GET   /api/college/get_placement/:placementId
 *   PUT   /api/college/update_placement/:placementId
 *   PATCH /api/college/verify_offer_letter/:placementId
 *   PATCH /api/college/update_placement_status/:placementId
 * ============================================================================
 */

const placementService = require('../../services/college/placement.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const {
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE PLACEMENT
// ============================================================================

async function createPlacement(req, res) {
    const result = await placementService.createPlacement(
        req.user.college_id,
        req.user.id,
        req.validated
    );

    return sendCreated(res, result, SUCCESS_MESSAGES.PLACEMENT_CREATED);
}

// ============================================================================
// 2. GET ALL PLACEMENTS
// ============================================================================

async function getAllPlacements(req, res) {
    const { placements, total, page, limit, stats } =
        await placementService.getAllPlacements(
            req.user.college_id,
            req.validated
        );

    return sendPaginated(
        res,
        { placements, stats },
        total,
        { page, limit },
        SUCCESS_MESSAGES.PLACEMENTS_RETRIEVED
    );
}

// ============================================================================
// 3. GET SINGLE PLACEMENT
// ============================================================================

async function getPlacement(req, res) {
    const result = await placementService.getPlacement(
        req.params.placementId,
        req.user.college_id
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.PLACEMENT_RETRIEVED);
}

// ============================================================================
// 4. UPDATE PLACEMENT
// ============================================================================

async function updatePlacement(req, res) {
    const result = await placementService.updatePlacement(
        req.params.placementId,
        req.user.college_id,
        req.validated
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.PLACEMENT_UPDATED);
}

// ============================================================================
// 5. VERIFY OFFER LETTER
// ============================================================================

async function verifyOfferLetter(req, res) {
    const { offer_letter_verified, remarks } = req.validated;

    const result = await placementService.verifyOfferLetter(
        req.params.placementId,
        req.user.college_id,
        req.user.id,
        offer_letter_verified,
        remarks ?? null
    );

    const message = offer_letter_verified
        ? SUCCESS_MESSAGES.OFFER_LETTER_VERIFIED
        : SUCCESS_MESSAGES.OFFER_LETTER_UNVERIFIED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// 6. UPDATE PLACEMENT STATUS
// ============================================================================

async function updatePlacementStatus(req, res) {
    const { placement_status, acceptance_status, remarks } = req.validated;

    const result = await placementService.updatePlacementStatus(
        req.params.placementId,
        req.user.college_id,
        placement_status,
        acceptance_status ?? null,
        remarks ?? null
    );

    const STATUS_SUCCESS_MAP = {
        accepted: SUCCESS_MESSAGES.PLACEMENT_ACCEPTED,
        rejected: SUCCESS_MESSAGES.PLACEMENT_REJECTED,
        joined: SUCCESS_MESSAGES.PLACEMENT_JOINED,
        cancelled: SUCCESS_MESSAGES.PLACEMENT_CANCELLED,
    };

    return sendSuccess(
        res,
        result,
        STATUS_SUCCESS_MAP[placement_status] ?? SUCCESS_MESSAGES.PLACEMENT_UPDATED
    );
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createPlacement,
    getAllPlacements,
    getPlacement,
    updatePlacement,
    verifyOfferLetter,
    updatePlacementStatus,
};
