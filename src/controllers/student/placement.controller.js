/**
 * ============================================================================
 * STUDENT PLACEMENT CONTROLLER — Own Placement Results Route Handlers
 * ============================================================================
 * Endpoints:
 *   GET   /api/student/get_my_placements                  — List own placement offers
 *   PATCH /api/student/accept_placement/:placementId      — Accept offer
 *   PATCH /api/student/decline_placement/:placementId     — Decline offer
 *   PATCH /api/student/reject_placement/:placementId      — (alias for decline)
 * ============================================================================
 */

const placementService = require('../../services/student/placement.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    LOG,
} = require('../../config/constants');

// ============================================================================
// 1. GET MY PLACEMENTS
// ============================================================================

async function getMyPlacements(req, res) {
    const { placements, total, page, limit, status_summary } =
        await placementService.getMyPlacements(
            req.user.id,
            req.user.college_id,
            req.validated
        );

    return sendPaginated(
        res,
        { placements, status_summary },
        total,
        { page, limit },
        SUCCESS_MESSAGES.PLACEMENTS_RETRIEVED
    );
}

// ============================================================================
// 2. ACCEPT PLACEMENT
// ============================================================================

async function acceptPlacement(req, res) {
    const startTime = Date.now();
    const { placementId } = req.params;

    logger.info(`${LOG.API_START} PATCH /api/student/accept_placement/${placementId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await placementService.acceptPlacement(
        placementId,
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PATCH /api/student/accept_placement/${placementId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.OFFER_ACCEPTED);
}

// ============================================================================
// 3. DECLINE PLACEMENT
// ============================================================================

async function declinePlacement(req, res) {
    const startTime = Date.now();
    const { placementId } = req.params;

    logger.info(`${LOG.API_START} PATCH /api/student/decline_placement/${placementId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await placementService.declinePlacement(
        placementId,
        req.user.id,
        req.user.college_id,
        req.validated.rejection_reason
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PATCH /api/student/decline_placement/${placementId}`, {
        student_id: req.user.id,
        duration_ms: duration,
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.OFFER_DECLINED_SUCCESS);
}

// ============================================================================
// 4. UPLOAD PLACEMENT DOCUMENTS
// ============================================================================

async function uploadDocuments(req, res) {
    const { placementId } = req.params;

    const result = await placementService.uploadDocuments(
        placementId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.DOCUMENTS_UPLOADED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getMyPlacements,
    acceptPlacement,
    declinePlacement,
    uploadDocuments,
    // Backward-compatible alias
    rejectPlacement: declinePlacement,
};
