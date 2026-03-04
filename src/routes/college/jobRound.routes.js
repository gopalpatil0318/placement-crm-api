/**
 * ============================================================================
 * JOB ROUND ROUTES — Selection Round Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /add_job_round/:jobId              Add round + validate
 *   PUT   /update_round/:roundId             Update round + validate
 *   PATCH /update_round_status/:roundId      Change status + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/jobRound.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    addRoundSchema,
    updateRoundSchema,
    updateRoundStatusSchema,
} = require('../../validators/college/jobRound.validator');

// All round routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_job_round/:jobId',
    validate(addRoundSchema),
    asyncHandler(controller.addRound)
);

router.put(
    '/update_round/:roundId',
    validate(updateRoundSchema),
    asyncHandler(controller.updateRound)
);

router.patch(
    '/update_round_status/:roundId',
    validate(updateRoundStatusSchema),
    asyncHandler(controller.updateRoundStatus)
);

module.exports = router;
