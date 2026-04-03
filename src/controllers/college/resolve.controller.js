/**
 * ============================================================================
 * RESOLVE CONTROLLER — Route Handler for Public College Lookup
 * ============================================================================
 * 1  GET  /api/college/resolve/:subdomain   (public, rate-limited)
 * ============================================================================
 */

const resolveService = require('../../services/college/resolve.service');
const { sendSuccess } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES } = require('../../config/constants');

// ============================================================================
// 1. GET /api/college/resolve/:subdomain
// ============================================================================

async function resolveCollege(req, res) {
    /** @type {Promise<Object>} */
    const collegePromise = resolveService.resolveBySubdomain(req.validated.subdomain);
    const college = await collegePromise;

    return sendSuccess(res, college, SUCCESS_MESSAGES.FETCHED_SUCCESSFULLY);
}

module.exports = { resolveCollege };
