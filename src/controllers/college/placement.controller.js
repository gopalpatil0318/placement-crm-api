/**
 * ============================================================================
 * PLACEMENT RESULT CONTROLLER — Route Handlers for Placement Records
 * ============================================================================
 *   POST  /api/college/create_placement
 *   GET   /api/college/get_all_placements
 *   GET   /api/college/get_placement/:placementId
 *   PUT   /api/college/update_placement/:placementId
 *   PATCH /api/college/verify_offer_letter/:placementId
 *   PATCH /api/college/verify_joining_letter/:placementId
 *   PATCH /api/college/update_placement_status/:placementId
 *   PATCH /api/college/revert_application/:applicationId
 *   POST  /api/college/bulk_create_placements
 * ============================================================================
 */

const placementService = require('../../services/college/placement.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    SUCCESS_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
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

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT,
        resourceId: result.placement_id,
        summary: `Created placement record`,
        newValue: result,
        ipAddress: getClientIp(req),
    });

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

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT,
        resourceId: req.params.placementId,
        summary: `Updated placement record`,
        newValue: result,
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.PLACEMENT_UPDATED);
}

// ============================================================================
// 5. VERIFY / REJECT OFFER LETTER
// ============================================================================

async function verifyOfferLetter(req, res) {
    const { action, rejection_reason } = req.validated;

    const result = await placementService.verifyOfferLetter(
        req.params.placementId,
        req.user.college_id,
        req.user.id,
        action,
        rejection_reason ?? null
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT,
        resourceId: req.params.placementId,
        summary: `Offer letter ${action} for "${result.student_name}" at "${result.company_name}"`,
        newValue: { action, rejection_reason: rejection_reason ?? null },
        ipAddress: getClientIp(req),
    });

    const message = action === 'approved'
        ? SUCCESS_MESSAGES.OFFER_LETTER_VERIFIED
        : SUCCESS_MESSAGES.OFFER_LETTER_REJECTED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// 5b. VERIFY / REJECT JOINING LETTER
// ============================================================================

async function verifyJoiningLetter(req, res) {
    const { action, rejection_reason } = req.validated;

    const result = await placementService.verifyJoiningLetter(
        req.params.placementId,
        req.user.college_id,
        req.user.id,
        action,
        rejection_reason ?? null
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT,
        resourceId: req.params.placementId,
        summary: `Joining letter ${action} for "${result.student_name}" at "${result.company_name}"`,
        newValue: { action, rejection_reason: rejection_reason ?? null },
        ipAddress: getClientIp(req),
    });

    const message = action === 'approved'
        ? SUCCESS_MESSAGES.JOINING_LETTER_VERIFIED
        : SUCCESS_MESSAGES.JOINING_LETTER_REJECTED;

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

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT,
        resourceId: req.params.placementId,
        summary: `Changed placement for "${result.student_name}" at "${result.company_name}" to "${placement_status}"`,
        oldValue: { placement_status: result.previous_status },
        newValue: { placement_status, acceptance_status: acceptance_status ?? null },
        metadata: { entityName: result.student_name, companyName: result.company_name, jobTitle: result.job_title },
        ipAddress: getClientIp(req),
    });

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
// 7. REVERT APPLICATION (rejected → selected)
// ============================================================================

async function revertApplication(req, res) {
    const result = await placementService.revertApplication(
        req.params.applicationId,
        req.user.college_id
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.APPLICATION,
        resourceId: req.params.applicationId,
        summary: `Reverted application for "${result.student_name}" at "${result.company_name}" from ${result.previous_status} to selected`,
        oldValue: { application_status: result.previous_status },
        newValue: { application_status: 'selected' },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.APPLICATION_REVERTED);
}

// ============================================================================
// 8. BULK CREATE PLACEMENTS
// ============================================================================

async function bulkCreatePlacements(req, res) {
    const result = await placementService.bulkCreatePlacements(
        req.user.college_id,
        req.user.id,
        req.validated.items
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.PLACEMENT,
        resourceId: null,
        summary: `Bulk created ${result.created_count} placements (${result.skipped_count} skipped)`,
        newValue: { created: result.created_count, skipped: result.skipped_count },
        ipAddress: getClientIp(req),
    });

    return sendCreated(res, result, SUCCESS_MESSAGES.BULK_PLACEMENTS_CREATED);
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
    verifyJoiningLetter,
    updatePlacementStatus,
    revertApplication,
    bulkCreatePlacements,
};
