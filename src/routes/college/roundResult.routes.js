/**
 * ============================================================================
 * ROUND RESULT ROUTES — Student Round Results Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /add_round_result/:roundId          Add single result
 *   POST  /bulk_add_round_results/:roundId    Bulk add results
 *   GET   /get_round_results/:roundId         List all results for round
 *   PUT   /update_round_result/:resultId      Update single result
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/roundResult.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    addRoundResultSchema,
    bulkAddRoundResultsSchema,
    listRoundResultsSchema,
    updateRoundResultSchema,
    roundIdParamSchema,
    resultIdParamSchema,
} = require('../../validators/college/roundResult.validator');

// All routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO));

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_round_result/:roundId',
    apiLimiter,
    validate(roundIdParamSchema, 'params'),
    validate(addRoundResultSchema),
    asyncHandler(controller.addRoundResult)
);

router.post(
    '/bulk_add_round_results/:roundId',
    apiLimiter,
    validate(roundIdParamSchema, 'params'),
    validate(bulkAddRoundResultsSchema),
    asyncHandler(controller.bulkAddRoundResults)
);

router.get(
    '/get_round_results/:roundId',
    validate(roundIdParamSchema, 'params'),
    validate(listRoundResultsSchema, 'query'),
    asyncHandler(controller.getRoundResults)
);

router.put(
    '/update_round_result/:resultId',
    apiLimiter,
    validate(resultIdParamSchema, 'params'),
    validate(updateRoundResultSchema),
    asyncHandler(controller.updateRoundResult)
);

module.exports = router;
