/**
 * ============================================================================
 * TRAINING ROUTES — Training Program Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /create_training_program                  #89 Create program
 *   GET   /get_all_training_programs                #90 List programs
 *   GET   /get_training_program/:programId          #91 Get program details
 *   PUT   /update_training_program/:programId       #92 Update program
 *   PATCH /toggle_training_status/:programId        #93 Change status
 *   GET   /get_training_enrollments/:programId      #94 List enrollments
 *   PATCH /update_enrollment/:enrollmentId          #95 Update enrollment
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/training.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    createTrainingSchema,
    listTrainingsSchema,
    updateTrainingSchema,
    toggleTrainingStatusSchema,
    listEnrollmentsSchema,
    updateEnrollmentSchema,
    programIdParamSchema,
    enrollmentIdParamSchema,
} = require('../../validators/college/training.validator');

// All training routes require COLLEGEADMIN or TPO + rate limiting
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO));
router.use(apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

// #89 — Create training program
router.post(
    '/create_training_program',
    validate(createTrainingSchema),
    asyncHandler(controller.createTrainingProgram)
);

// #90 — List all training programs
router.get(
    '/get_all_training_programs',
    validate(listTrainingsSchema, 'query'),
    asyncHandler(controller.getAllTrainingPrograms)
);

// #91 — Get training program details
router.get(
    '/get_training_program/:programId',
    validate(programIdParamSchema, 'params'),
    asyncHandler(controller.getTrainingProgram)
);

// #92 — Update training program
router.put(
    '/update_training_program/:programId',
    validate(programIdParamSchema, 'params'),
    validate(updateTrainingSchema),
    asyncHandler(controller.updateTrainingProgram)
);

// #93 — Toggle training status
router.patch(
    '/toggle_training_status/:programId',
    validate(programIdParamSchema, 'params'),
    validate(toggleTrainingStatusSchema),
    asyncHandler(controller.toggleTrainingStatus)
);

// #94 — List enrollments for a program
router.get(
    '/get_training_enrollments/:programId',
    validate(programIdParamSchema, 'params'),
    validate(listEnrollmentsSchema, 'query'),
    asyncHandler(controller.getTrainingEnrollments)
);

// #95 — Update enrollment
router.patch(
    '/update_enrollment/:enrollmentId',
    validate(enrollmentIdParamSchema, 'params'),
    validate(updateEnrollmentSchema),
    asyncHandler(controller.updateEnrollment)
);

module.exports = router;
