/**
 * ============================================================================
 * COMPANY TIER CONTROLLER — Route Handlers for Tier Management
 * ============================================================================
 *   POST   /api/college/create_tier          → createTier
 *   GET    /api/college/get_all_tiers        → getAllTiers
 *   GET    /api/college/get_tier/:tierId     → getTier
 *   PUT    /api/college/update_tier/:tierId  → updateTier
 *   DELETE /api/college/delete_tier/:tierId  → deleteTier
 * ============================================================================
 */

const tierService = require('../../services/college/companyTier.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE TIER
// ============================================================================

async function createTier(req, res) {
    try {
        const result = await tierService.createTier(req.user.college_id, req.validated);

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.CREATE,
            resourceType: AUDIT_RESOURCE_TYPES.COMPANY_TIER,
            resourceId: result.tier_id,
            summary: `Created company tier "${result.tier_name}" (Level ${result.tier_level})`,
            newValue: result,
            metadata: { entityName: result.tier_name },
            ipAddress: getClientIp(req),
        });

        return sendCreated(res, result, SUCCESS_MESSAGES.TIER_CREATED);
    } catch (err) {
        if (err.code === '23505' && err.constraint?.includes('tier_name')) {
            return sendError(res, ERROR_MESSAGES.TIER_DUPLICATE_NAME, HTTP_STATUS.CONFLICT);
        }
        if (err.code === '23505' && err.constraint?.includes('tier_level')) {
            return sendError(res, ERROR_MESSAGES.TIER_DUPLICATE_LEVEL, HTTP_STATUS.CONFLICT);
        }
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL TIERS
// ============================================================================

async function getAllTiers(req, res) {
    try {
        const tiers = await tierService.getAllTiers(req.user.college_id, req.validated);

        return sendSuccess(res, tiers, SUCCESS_MESSAGES.TIERS_RETRIEVED);
    } catch (err) {
        logger.error('getAllTiers failed', { error: err.message, collegeId: req.user.college_id });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET SINGLE TIER
// ============================================================================

async function getTier(req, res) {
    try {
        const result = await tierService.getTier(req.params.tierId, req.user.college_id);

        return sendSuccess(res, result, SUCCESS_MESSAGES.TIERS_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. UPDATE TIER
// ============================================================================

async function updateTier(req, res) {
    try {
        const result = await tierService.updateTier(
            req.params.tierId,
            req.user.college_id,
            req.validated
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.COMPANY_TIER,
            resourceId: req.params.tierId,
            summary: `Updated company tier "${result.tier_name}"` + (result._reclassified_jobs ? ` — reclassified ${result._reclassified_jobs} jobs` : ''),
            newValue: result,
            metadata: { entityName: result.tier_name, reclassifiedJobs: result._reclassified_jobs ?? 0 },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.TIER_UPDATED);
    } catch (err) {
        if (err.code === '23505' && err.constraint?.includes('tier_name')) {
            return sendError(res, ERROR_MESSAGES.TIER_DUPLICATE_NAME, HTTP_STATUS.CONFLICT);
        }
        if (err.code === '23505' && err.constraint?.includes('tier_level')) {
            return sendError(res, ERROR_MESSAGES.TIER_DUPLICATE_LEVEL, HTTP_STATUS.CONFLICT);
        }
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 5. DELETE TIER
// ============================================================================

async function deleteTier(req, res) {
    try {
        const result = await tierService.deleteTier(req.params.tierId, req.user.college_id);

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.DELETE,
            resourceType: AUDIT_RESOURCE_TYPES.COMPANY_TIER,
            resourceId: req.params.tierId,
            summary: `Deleted company tier "${result.tier_name}"`,
            oldValue: result,
            metadata: { entityName: result.tier_name },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.TIER_DELETED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

module.exports = { createTier, getAllTiers, getTier, updateTier, deleteTier };
