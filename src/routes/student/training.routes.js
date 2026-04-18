/**
 * ============================================================================
 * STUDENT TRAINING ROUTES — Training Programs Endpoints (Student-Side)
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   GET  /get_available_training                       authenticate + validate(query)
 *   POST /enroll_in_training/:programId                authenticate + apiLimiter
 *   GET  /get_enrolled_training                        authenticate + validate(query)
 *   POST /submit_training_feedback/:enrollmentId       authenticate + apiLimiter + validate
 *   PATCH /withdraw_from_training/:programId             authenticate + B14.15
 *   PUT  /update_training_feedback/:enrollmentId         authenticate + validate + B14.13
 *   GET  /training_sessions/:programId                  authenticate + GAP-2
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/training.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    listAvailableTrainingsSchema,
    listEnrolledTrainingsSchema,
    submitFeedbackSchema,
    updateFeedbackSchema,
    programIdParamSchema,
    enrollmentIdParamSchema,
} = require('../../validators/student/training.validator');

// ============================================================================
// TRAINING ROUTES
// ============================================================================

router.use(apiLimiter);

// List available training programs
router.get(
    '/get_available_training',
    authenticate,
    validate(listAvailableTrainingsSchema, 'query'),
    asyncHandler(controller.getAvailableTraining)
);

// Enroll in a training program
router.post(
    '/enroll_in_training/:programId',
    authenticate,
    validate(programIdParamSchema, 'params'),
    asyncHandler(controller.enrollInTraining)
);

// List enrolled training programs
router.get(
    '/get_enrolled_training',
    authenticate,
    validate(listEnrolledTrainingsSchema, 'query'),
    asyncHandler(controller.getEnrolledTraining)
);

// Submit training feedback
router.post(
    '/submit_training_feedback/:enrollmentId',
    authenticate,
    validate(enrollmentIdParamSchema, 'params'),
    validate(submitFeedbackSchema),
    asyncHandler(controller.submitTrainingFeedback)
);

// B14.15 — Withdraw from training
router.patch(
    '/withdraw_from_training/:programId',
    authenticate,
    validate(programIdParamSchema, 'params'),
    asyncHandler(controller.withdrawFromTraining)
);

// B14.13 — Update training feedback
router.put(
    '/update_training_feedback/:enrollmentId',
    authenticate,
    validate(enrollmentIdParamSchema, 'params'),
    validate(updateFeedbackSchema),
    asyncHandler(controller.updateTrainingFeedback)
);

// GAP-2 — Get my session schedule for a program
router.get(
    '/training_sessions/:programId',
    authenticate,
    validate(programIdParamSchema, 'params'),
    asyncHandler(controller.getMySessionSchedule)
);

module.exports = router;
