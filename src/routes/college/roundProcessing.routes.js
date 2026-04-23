/**
 * ============================================================================
 * ROUND PROCESSING ROUTES — Preview + Execute Round Processing
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   GET   /preview_round_processing/:roundId  Preview what will change
 *   POST  /process_round/:roundId             Execute round processing
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/roundProcessing.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const Joi = require('joi');

// Reuse roundId param validation
const roundIdParamSchema = Joi.object({
    roundId: Joi.string().uuid().required(),
});

// All routes require authentication
router.use(authenticate);

// ============================================================================
// ROUTES
// ============================================================================

router.get(
    '/preview_round_processing/:roundId',
    requirePermission(PERMISSIONS.ROUND_RESULTS_VIEW),
    validate(roundIdParamSchema, 'params'),
    asyncHandler(controller.previewRoundProcessing)
);

router.post(
    '/process_round/:roundId',
    requirePermission(PERMISSIONS.ROUND_RESULTS_PROCESS),
    apiLimiter,
    validate(roundIdParamSchema, 'params'),
    asyncHandler(controller.processRound)
);

module.exports = router;
