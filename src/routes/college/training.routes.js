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
 *   PATCH /bulk_update_enrollments/:programId        MF3 Bulk update enrollments
 *   GET   /student_training_report/:studentId        GAP-1 Student training report
 *   POST  /training/:programId/sessions              B16 Create session
 *   GET   /training/:programId/sessions              B16 List sessions
 *   PUT   /training/sessions/:sessionId              B16 Update session
 *   DELETE /training/sessions/:sessionId             B16 Delete session
 *   POST  /training/sessions/:sessionId/attendance   B16 Mark attendance
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
    toggleEnrollmentAccessSchema,
    listEnrollmentsSchema,
    updateEnrollmentSchema,
    bulkUpdateEnrollmentsSchema,
    createSessionSchema,
    updateSessionSchema,
    markAttendanceSchema,
    programIdParamSchema,
    enrollmentIdParamSchema,
    sessionIdParamSchema,
    studentIdParamSchema,
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

// Toggle enrollment access (open/close enrollment independently of status)
router.patch(
    '/toggle_enrollment_access/:programId',
    validate(programIdParamSchema, 'params'),
    validate(toggleEnrollmentAccessSchema),
    asyncHandler(controller.toggleEnrollmentAccess)
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

// MF3 — Bulk update enrollments
router.patch(
    '/bulk_update_enrollments/:programId',
    validate(programIdParamSchema, 'params'),
    validate(bulkUpdateEnrollmentsSchema),
    asyncHandler(controller.bulkUpdateEnrollments)
);

// GAP-1 — Student training report
router.get(
    '/student_training_report/:studentId',
    validate(studentIdParamSchema, 'params'),
    asyncHandler(controller.getStudentTrainingReport)
);

// B16 — Create training session
router.post(
    '/training/:programId/sessions',
    validate(programIdParamSchema, 'params'),
    validate(createSessionSchema),
    asyncHandler(controller.createTrainingSession)
);

// B16 — List training sessions
router.get(
    '/training/:programId/sessions',
    validate(programIdParamSchema, 'params'),
    asyncHandler(controller.getTrainingSessions)
);

// B16 — Update training session
router.put(
    '/training/sessions/:sessionId',
    validate(sessionIdParamSchema, 'params'),
    validate(updateSessionSchema),
    asyncHandler(controller.updateTrainingSession)
);

// B16 — Delete training session
router.delete(
    '/training/sessions/:sessionId',
    validate(sessionIdParamSchema, 'params'),
    asyncHandler(controller.deleteTrainingSession)
);

// B16 — Mark session attendance
router.post(
    '/training/sessions/:sessionId/attendance',
    validate(sessionIdParamSchema, 'params'),
    validate(markAttendanceSchema),
    asyncHandler(controller.markSessionAttendance)
);

// Get session attendance records (per-student, for pre-populating attendance sheet)
router.get(
    '/training/sessions/:sessionId/attendance',
    validate(sessionIdParamSchema, 'params'),
    asyncHandler(controller.getSessionAttendance)
);

module.exports = router;
