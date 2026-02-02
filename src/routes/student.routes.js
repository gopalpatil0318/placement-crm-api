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
  personalInfoSchema,
  academicInfoSchema,
  skillInfoSchema,
  updatePersonalInfoSchema,
  updateAcademicInfoSchema,
  updateSkillInfoSchema
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
 * GET /api/v1/students/profile-status
 * Get student profile completion status (student only)
 */
router.get(
  '/profile-status',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  studentController.getProfileStatus
);
router.post(
  '/profile/personal-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  
  apiLimiter,
  validate(personalInfoSchema),
  studentController.insertPersonalInfo
);

router.post(
  '/profile/academic-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  apiLimiter,
  validate(academicInfoSchema),
  studentController.insertAcademicInfo
);

router.post(
  '/profile/skills-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  apiLimiter,
  validate(skillInfoSchema),
  studentController.insertSkillInfo
);

/**
 * PUT /api/v1/students/profile/update-personal-info
 * Update personal information (student)
 */
router.put(
  '/profile/update-personal-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  apiLimiter,
  validate(updatePersonalInfoSchema),
  studentController.updatePersonalInfo
);

/**
 * PUT /api/v1/students/profile/update-academic-info
 * Update academic information (student)
 */
router.put(
  '/profile/update-academic-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  apiLimiter,
  validate(updateAcademicInfoSchema),
  studentController.updateAcademicInfo
);

/**
 * PUT /api/v1/students/profile/update-skills-info
 * Update skill information (student)
 */
router.put(
  '/profile/update-skills-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  apiLimiter,
  validate(updateSkillInfoSchema),
  studentController.updateSkillInfo
);

router.get(
  '/profile/student-personal-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  studentController.getPersonalInfo
)

router.get(
  '/profile/student-academic-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  studentController.getAcademicInfo
)

router.get(
  '/profile/student-skill-info',
  authMiddleware,
  requireRole(ROLES.STUDENT),
  studentController.getSkillInfo
)

module.exports = router;