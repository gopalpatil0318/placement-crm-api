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
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
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

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.CREATE,
            resourceType: AUDIT_RESOURCE_TYPES.POLICY,
            resourceId: result.policy_id,
            summary: `Created placement policy "${result.policy_title}"`,
            newValue: result,
            metadata: { entityName: result.policy_title },
            ipAddress: getClientIp(req),
        });

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

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.POLICY,
            resourceId: req.params.policyId,
            summary: `Updated placement policy "${result.policy_title}"`,
            newValue: result,
            metadata: { entityName: result.policy_title },
            ipAddress: getClientIp(req),
        });

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

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.POLICY,
            resourceId: req.params.policyId,
            summary: `${is_active ? 'Activated' : 'Deactivated'} placement policy "${result.policy_title}"`,
            oldValue: { is_active: result._previousStatus },
            newValue: { is_active },
            metadata: { entityName: result.policy_title },
            ipAddress: getClientIp(req),
        });

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

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.DELETE,
            resourceType: AUDIT_RESOURCE_TYPES.POLICY,
            resourceId: req.params.policyId,
            summary: `Deleted placement policy "${result.policy_title}"`,
            oldValue: result,
            metadata: { entityName: result.policy_title },
            ipAddress: getClientIp(req),
        });

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
