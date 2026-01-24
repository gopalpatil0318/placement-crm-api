/**
 * ============================================================================
 * STUDENT ROUTES - Student Management API (UPDATED)
 * ============================================================================
 * Single Database Architecture
 * - POST /students/register - Register single student (public)
 * - POST /students/bulk - Bulk register students (admin only)
 * - POST /students/login - Student login (public)
 * - POST /students/logout - Student logout (authenticated)
 * - PUT /students/password - Update password (authenticated student)
 * - PUT /students/:studentId/profile - Update profile (admin/teacher)
 */

const express = require('express');
const router = express.Router();

const studentController = require('../controllers/studentController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateRequest');
const { apiLimiter, authLimiter } = require('../config/rateLimiter');

const {
  registerStudentSchema,
  bulkRegisterStudentsSchema,
  loginStudentSchema,
  updatePasswordSchema,
  updateProfileSchema
} = require('../validators/studentValidator');

const { ROLES } = require('../config/constants');

/**
 * POST /api/v1/students/register
 * Register single student (public - no authentication required)
 */
router.post(
  '/register',
  authLimiter,
  validate(registerStudentSchema),
  studentController.registerStudent
);

/**
 * POST /api/v1/students/bulk
 * Bulk register students (admin only)
 */
router.post(
  '/bulk-register',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  apiLimiter,
  validate(bulkRegisterStudentsSchema),
  studentController.bulkRegisterStudents
);

/**
 * POST /api/v1/students/login
 * Student login (public - no authentication required)
 */
router.post(
  '/login',
  authLimiter,
  validate(loginStudentSchema),
  studentController.loginStudent
);

/**
 * POST /api/v1/students/logout
 * Student logout (authenticated)
 */
router.post(
  '/logout',
  authMiddleware,
  authLimiter,
  studentController.logoutStudent
);

/**
 * PUT /api/v1/students/password
 * Update student password (authenticated student)
 */
router.put(
  '/password',
  authMiddleware,
  apiLimiter,
  validate(updatePasswordSchema),
  studentController.updatePassword
);

/**
 * PUT /api/v1/students/:studentId/profile
 * Update student profile (admin/teacher)
 */
router.put(
  '/:studentId/profile',
  authMiddleware,
  requireRole(ROLES.ADMIN, ROLES.TEACHER),
  apiLimiter,
  validate(updateProfileSchema),
  studentController.updateProfile
);

module.exports = router;