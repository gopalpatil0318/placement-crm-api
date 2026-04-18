/**
 * ============================================================================
 * ROUND PROCESSING CONTROLLER — Preview + Execute Round Result Processing
 * ============================================================================
 *   GET   /api/college/preview_round_processing/:roundId  → previewRoundProcessing
 *   POST  /api/college/process_round/:roundId             → processRound
 * ============================================================================
 */

const processingService = require('../../services/college/roundProcessing.service');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
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
// 1. PREVIEW ROUND PROCESSING
// ============================================================================

async function previewRoundProcessing(req, res) {
    try {
        const result = await processingService.previewRoundProcessing(
            req.params.roundId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.ROUND_PROCESSING_PREVIEW);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        logger.error('previewRoundProcessing failed', { error: err.message, roundId: req.params.roundId });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. PROCESS ROUND (Execute)
// ============================================================================

async function processRound(req, res) {
    try {
        const result = await processingService.processRound(
            req.params.roundId,
            req.user.college_id
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.JOB_ROUND,
            resourceId: req.params.roundId,
            summary: `Processed round "${result.round.round_name}" for ${result.round.job_title}: `
                + `${result.processed.selected} selected, ${result.processed.rejected} rejected, `
                + `${result.processed.advanced} advanced, ${result.processed.absent_marked} absent`,
            newValue: result.processed,
            metadata: { roundName: result.round.round_name, jobTitle: result.round.job_title },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.ROUND_PROCESSED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        logger.error('processRound failed', { error: err.message, roundId: req.params.roundId });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    previewRoundProcessing,
    processRound,
};
