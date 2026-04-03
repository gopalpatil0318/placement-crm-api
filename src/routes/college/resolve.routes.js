/**
 * ============================================================================
 * COLLEGE RESOLVE ROUTES — Public College Lookup
 * ============================================================================
 * Base path: /api/college
 *
 * Public (no auth):
 *   GET  /resolve/:subdomain    resolveLimiter + validate(params)
 * ============================================================================
 */

const express = require('express');

const router = express.Router();

const controller = require('../../controllers/college/resolve.controller');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { resolveSubdomainParamSchema } = require('../../validators/college/resolve.validator');
const { resolveLimiter } = require('../../config/rateLimiter');

// ============================================================================
// PUBLIC ROUTES (no authentication)
// ============================================================================

router.get(
    '/resolve/:subdomain',
    resolveLimiter,
    validate(resolveSubdomainParamSchema, 'params'),
    asyncHandler(controller.resolveCollege),
);

module.exports = router;
