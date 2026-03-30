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

module.exports = router;
