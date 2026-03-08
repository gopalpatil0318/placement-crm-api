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
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE PLACEMENT
// ============================================================================

async function createPlacement(req, res) {
    try {
        const result = await placementService.createPlacement(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        return sendCreated(res, result, SUCCESS_MESSAGES.PLACEMENT_CREATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL PLACEMENTS
// ============================================================================

async function getAllPlacements(req, res) {
    try {
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
            'Placements retrieved successfully'
        );
    } catch (err) {
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET SINGLE PLACEMENT
// ============================================================================

async function getPlacement(req, res) {
    try {
        const result = await placementService.getPlacement(
            req.params.placementId,
            req.user.college_id
        );

        return sendSuccess(res, result, 'Placement details retrieved successfully');
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. UPDATE PLACEMENT
// ============================================================================

async function updatePlacement(req, res) {
    try {
        const result = await placementService.updatePlacement(
            req.params.placementId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.PLACEMENT_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 5. VERIFY OFFER LETTER
// ============================================================================

async function verifyOfferLetter(req, res) {
    try {
        const { offer_letter_verified, remarks } = req.validated;

        const result = await placementService.verifyOfferLetter(
            req.params.placementId,
            req.user.college_id,
            req.user.id,
            offer_letter_verified,
            remarks ?? null
        );

        const message = offer_letter_verified
            ? 'Offer letter verified successfully'
            : 'Offer letter verification removed';

        return sendSuccess(res, result, message);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 6. UPDATE PLACEMENT STATUS
// ============================================================================

async function updatePlacementStatus(req, res) {
    try {
        const { placement_status, acceptance_status, remarks } = req.validated;

        const result = await placementService.updatePlacementStatus(
            req.params.placementId,
            req.user.college_id,
            placement_status,
            acceptance_status ?? null,
            remarks ?? null
        );

        const statusMessages = {
            accepted: 'Placement accepted',
            rejected: 'Placement rejected',
            joined: 'Student marked as joined',
            cancelled: 'Placement cancelled',
        };

        return sendSuccess(
            res,
            result,
            statusMessages[placement_status] ?? SUCCESS_MESSAGES.PLACEMENT_UPDATED
        );
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
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
