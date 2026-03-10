/**
 * ============================================================================
 * STUDENT SEMESTER GRADES ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST /add_semester_grade             authenticate + apiLimiter + validate
 *   GET  /get_all_semester_grades        authenticate
 *   PUT  /update_semester_grade/:gradeId authenticate + apiLimiter + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/semester.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    addSemesterGradeSchema,
    updateSemesterGradeSchema,
    gradeIdParamSchema,
} = require('../../validators/student/semester.validator');

// ============================================================================
// SEMESTER GRADE ROUTES
// ============================================================================

// Add a new semester grade
router.post(
    '/add_semester_grade',
    authenticate,
    apiLimiter,
    validate(addSemesterGradeSchema),
    asyncHandler(controller.addSemesterGrade)
);

// Get all semester grades
router.get(
    '/get_all_semester_grades',
    authenticate,
    asyncHandler(controller.getAllSemesterGrades)
);

// Update an existing semester grade
router.put(
    '/update_semester_grade/:gradeId',
    authenticate,
    apiLimiter,
    validate(gradeIdParamSchema, 'params'),
    validate(updateSemesterGradeSchema),
    asyncHandler(controller.updateSemesterGrade)
);

module.exports = router;
