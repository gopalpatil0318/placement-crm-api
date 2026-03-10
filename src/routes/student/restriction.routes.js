/**
 * ============================================================================
 * STUDENT RESTRICTION ROUTES — Own Restrictions Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET  /get_my_restrictions                    authenticate + validate(query)
 *   POST /appeal_restriction/:restrictionId      authenticate + apiLimiter + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/restriction.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    listMyRestrictionsSchema,
    appealRestrictionSchema,
    restrictionIdParamSchema,
} = require('../../validators/student/restriction.validator');

// ============================================================================
// RESTRICTION ROUTES
// ============================================================================

// List own restrictions
router.get(
    '/get_my_restrictions',
    authenticate,
    validate(listMyRestrictionsSchema, 'query'),
    asyncHandler(controller.getMyRestrictions)
);

// Submit appeal for a restriction
router.post(
    '/appeal_restriction/:restrictionId',
    authenticate,
    apiLimiter,
    validate(restrictionIdParamSchema, 'params'),
    validate(appealRestrictionSchema),
    asyncHandler(controller.appealRestriction)
);

module.exports = router;
