/**
 * ============================================================================
 * PLACEMENT POLICY CONTROLLER — Route Handlers for Policy Management
 * ============================================================================
 *   POST   /api/college/create_policy                  → createPolicy
 *   GET    /api/college/get_all_policies               → getAllPolicies
 *   GET    /api/college/get_policy/:policyId           → getPolicy
 *   PUT    /api/college/update_policy/:policyId        → updatePolicy
 *   PATCH  /api/college/toggle_policy_status/:policyId → togglePolicyStatus
 *   DELETE /api/college/delete_policy/:policyId        → deletePolicy
 * ============================================================================
 */

const policyService = require('../../services/college/placementPolicy.service');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE POLICY
// ============================================================================

async function createPolicy(req, res) {
    try {
        const result = await policyService.createPolicy(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        return sendCreated(res, result, SUCCESS_MESSAGES.POLICY_CREATED);
    } catch (err) {
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL POLICIES
// ============================================================================

async function getAllPolicies(req, res) {
    try {
        const { policies, total, page, limit, summary } =
            await policyService.getAllPolicies(
                req.user.college_id,
                req.validated
            );

        return sendPaginated(
            res,
            { policies, summary },
            total,
            { page, limit },
            SUCCESS_MESSAGES.POLICIES_RETRIEVED
        );
    } catch (err) {
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET SINGLE POLICY
// ============================================================================

async function getPolicy(req, res) {
    try {
        const result = await policyService.getPolicy(
            req.params.policyId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.POLICY_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. UPDATE POLICY
// ============================================================================

async function updatePolicy(req, res) {
    try {
        const result = await policyService.updatePolicy(
            req.params.policyId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.POLICY_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 5. TOGGLE POLICY STATUS
// ============================================================================

async function togglePolicyStatus(req, res) {
    try {
        const { is_active } = req.validated;

        const result = await policyService.togglePolicyStatus(
            req.params.policyId,
            req.user.college_id,
            is_active
        );

        const message = is_active
            ? SUCCESS_MESSAGES.POLICY_ACTIVATED
            : SUCCESS_MESSAGES.POLICY_DEACTIVATED;

        return sendSuccess(res, result, message);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 6. DELETE POLICY
// ============================================================================

async function deletePolicy(req, res) {
    try {
        const result = await policyService.deletePolicy(
            req.params.policyId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.POLICY_DELETED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createPolicy,
    getAllPolicies,
    getPolicy,
    updatePolicy,
    togglePolicyStatus,
    deletePolicy,
};
