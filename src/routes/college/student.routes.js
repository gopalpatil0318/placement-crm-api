/**
 * ============================================================================
 * STUDENT ROUTES — Student Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN)
 *
 *   POST  /register_student                       register + validate
 *   POST  /bulk_register_students                  bulk register + validate
 *   GET   /get_all_students                        list + validate(query)
 *   GET   /get_student/:studentId                  get single
 *   GET   /get_student_full_profile/:studentId     get full profile
 *   PUT   /update_student/:studentId               update + validate
 *   PATCH /toggle_student_status/:studentId        toggle + validate
 *   PATCH /approve_student_profile/:studentId      approve/reject + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/student.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    registerStudentSchema,
    bulkRegisterStudentsSchema,
    listStudentsSchema,
    updateStudentSchema,
    toggleStudentStatusSchema,
    approveStudentProfileSchema,
} = require('../../validators/college/student.validator');

// All student management routes require COLLEGEADMIN
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/register_student',
    validate(registerStudentSchema),
    asyncHandler(controller.registerStudent)
);

router.post(
    '/bulk_register_students',
    validate(bulkRegisterStudentsSchema),
    asyncHandler(controller.bulkRegisterStudents)
);

router.get(
    '/get_all_students',
    validate(listStudentsSchema, 'query'),
    asyncHandler(controller.getAllStudents)
);

router.get(
    '/get_student/:studentId',
    asyncHandler(controller.getStudent)
);

router.get(
    '/get_student_full_profile/:studentId',
    asyncHandler(controller.getStudentFullProfile)
);

router.put(
    '/update_student/:studentId',
    validate(updateStudentSchema),
    asyncHandler(controller.updateStudent)
);

router.patch(
    '/toggle_student_status/:studentId',
    validate(toggleStudentStatusSchema),
    asyncHandler(controller.toggleStudentStatus)
);

router.patch(
    '/approve_student_profile/:studentId',
    validate(approveStudentProfileSchema),
    asyncHandler(controller.approveStudentProfile)
);

module.exports = router;
