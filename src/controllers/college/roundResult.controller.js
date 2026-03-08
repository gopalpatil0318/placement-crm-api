/**
 * ============================================================================
 * ROUND RESULT CONTROLLER — Route Handlers for Student Round Results
 * ============================================================================
 *   POST  /api/college/add_round_result/:roundId
 *   POST  /api/college/bulk_add_round_results/:roundId
 *   GET   /api/college/get_round_results/:roundId
 *   PUT   /api/college/update_round_result/:resultId
 * ============================================================================
 */

const resultService = require('../../services/college/roundResult.service');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    ERROR_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

// ============================================================================
// 1. ADD SINGLE ROUND RESULT
// ============================================================================

async function addRoundResult(req, res) {
    try {
        const result = await resultService.addRoundResult(
            req.params.roundId,
            req.user.college_id,
            req.validated
        );

        return sendCreated(res, result, 'Round result added successfully');
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. BULK ADD ROUND RESULTS
// ============================================================================

async function bulkAddRoundResults(req, res) {
    try {
        const result = await resultService.bulkAddRoundResults(
            req.params.roundId,
            req.user.college_id,
            req.validated.results
        );

        return sendCreated(
            res,
            result,
            `Bulk add complete: ${result.summary.created} created, ${result.summary.skipped} skipped`
        );
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET ROUND RESULTS
// ============================================================================

async function getRoundResults(req, res) {
    try {
        const { results, total, page, limit, round_name, round_number, round_status,
            job_title, company_name, status_summary } =
            await resultService.getRoundResults(
                req.params.roundId,
                req.user.college_id,
                req.validated
            );

        return sendPaginated(
            res,
            { results, round_name, round_number, round_status, job_title, company_name, status_summary },
            total,
            { page, limit },
            'Round results retrieved successfully'
        );
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. UPDATE ROUND RESULT
// ============================================================================

async function updateRoundResult(req, res) {
    try {
        const result = await resultService.updateRoundResult(
            req.params.resultId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, 'Round result updated successfully');
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
    addRoundResult,
    bulkAddRoundResults,
    getRoundResults,
    updateRoundResult,
};
