/**
 * ============================================================================
 * STUDENT CONTROLLER - Student Management (UPDATED)
 * ============================================================================
 * Single Database Architecture
 * - Register single student
 * - Bulk register students (admin only)
 * - Student login (HttpOnly Cookie)
 * - Student logout (Clear Cookie)
 * - Update student password (authenticated student)
 * - Update student profile (admin/teacher)
 * - Status checks: college active, student active
 */

const studentService = require('../services/studentService');
const logger = require('../config/logger');
const { success, error } = require('../utils/responseHelper');
const {
  LOG,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  ROLES
} = require('../config/constants');

// Cookie configuration for security
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false, // Must be FALSE because localhost is HTTP
  sameSite: 'lax', // 'lax' works because the proxy makes it look like the same domain
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

/**
 * POST /api/v1/students/register
 * Register single student
 */
async function registerStudent(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/students/register`, {
    ip: req.ip,
    college_id: req.validated?.college_id
  });

  try {
    const {
      student_name,
      student_email,
      student_password,
      student_department,
      student_year,
      college_id
    } = req.validated;

    // Call service
    const newStudent = await studentService.registerStudent({
      college_id,
      student_name,
      student_email,
      student_password,
      student_department,
      student_year
    });

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/students/register`,
      {
        student_id: newStudent.student_id,
        student_email: newStudent.student_email,
        college_id: newStudent.college_id,
        duration_ms: duration
      }
    );

    return success(
      res,
      {
        student_id: newStudent.student_id,
        college_id: newStudent.college_id,
        student_name: newStudent.student_name,
        student_email: newStudent.student_email
      },
      SUCCESS_MESSAGES.STUDENT_REGISTERED,
      HTTP_STATUS.CREATED
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/students/register`,
      {
        error: err.message,
        college_id: req.validated?.college_id,
        duration_ms: duration
      }
    );

    if (err.message.includes('already exists')) {
      return error(
        res,
        'Email already exists',
        HTTP_STATUS.CONFLICT
      );
    }

    if (err.message.includes('not found') || err.message.includes('inactive')) {
      return error(res, err.message, HTTP_STATUS.BAD_REQUEST);
    }

    if (err.message.includes('Access denied')) {
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    return error(
      res,
      ERROR_MESSAGES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * POST /api/v1/students/bulk
 * Bulk register students (admin only)
 */
async function bulkRegisterStudents(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/students/bulk-register`, {
    user_id: req.user?.id,
    user_role: req.user?.role,
    college_id: req.user?.college_id,
    total_students: req.validated?.students?.length
  });

  try {
    // Authorization check
    if (req.user?.role !== ROLES.COLLEGEADMIN) {
      logger.warn(
        `${LOG.SECURITY_PREFIX} Unauthorized bulk registration attempt`,
        {
          user_id: req.user?.id,
          user_role: req.user?.role
        }
      );
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    const { students } = req.validated;
    const college_id = req.user.college_id;

    // Call service
    const results = await studentService.bulkRegisterStudents(
      students,
      college_id
    );

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/students/bulk-register`,
      {
        total: students.length,
        success: results.success.length,
        failed: results.failed.length,
        college_id: college_id,
        duration_ms: duration
      }
    );

    return success(
      res,
      results,
      `${results.success.length} students registered, ${results.failed.length} failed`,
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/students/bulk-register`,
      {
        error: err.message,
        user_id: req.user?.id,
        college_id: req.user?.college_id,
        duration_ms: duration
      }
    );

    return error(
      res,
      ERROR_MESSAGES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * POST /api/v1/students/login
 * Student login
 * * USES HTTPONLY COOKIE - Token NOT in body
 */
async function loginStudent(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/students/login`, {
    ip: req.ip,
    student_email: req.validated?.student_email
  });

  try {
    const { student_email, student_password, college_id } = req.validated;

    // Call service
    const authResult = await studentService.authenticateStudent(
      student_email,
      student_password,
      college_id
    );

    // SET COOKIE HERE - Not in JSON body
    res.cookie('token', authResult.token, COOKIE_OPTIONS);

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/students/login`,
      {
        student_id: authResult.student.student_id,
        college_id: authResult.student.college_id,
        ip: req.ip,
        duration_ms: duration
      }
    );

    return success(
      res,
      {
        // Token REMOVED from here
        role: 'student',
        student_id: authResult.student.student_id,
        college_id: authResult.student.college_id,
        student_email: authResult.student.student_email,
        student_name: authResult.student.student_name
      },
      SUCCESS_MESSAGES.LOGIN_SUCCESSFUL,
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/students/login`,
      {
        error: err.message,
        ip: req.ip,
        duration_ms: duration
      }
    );

    if (
      err.message.includes('Invalid credentials') ||
      err.message.includes('not found') ||
      err.message.includes('inactive')
    ) {
      return error(
        res,
        'Invalid email or password',
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    if (err.message.includes('Access denied')) {
      return error(res, ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    return error(
      res,
      ERROR_MESSAGES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * POST /api/v1/students/logout
 * Logout student (Clears HttpOnly Cookie)
 */
async function logoutStudent(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} POST /api/students/logout`, {
    student_id: req.user?.id,
    ip: req.ip
  });

  try {
    // CLEAR COOKIE HERE
    res.clearCookie('token', COOKIE_OPTIONS);

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} POST /api/students/logout`,
      {
        student_id: req.user?.id,
        duration_ms: duration
      }
    );

    return success(
      res,
      {},
      SUCCESS_MESSAGES.LOGOUT_SUCCESSFUL,
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} POST /api/students/logout`,
      {
        error: err.message,
        student_id: req.user?.id,
        duration_ms: duration
      }
    );

    return error(
      res,
      ERROR_MESSAGES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * PUT /api/v1/students/password
 * Update student password (authenticated student)
 */
async function updatePassword(req, res) {
  const startTime = Date.now();

  logger.info(`${LOG.API_START_PREFIX} PUT /api/students/update-password`, {
    student_id: req.user?.id,
    ip: req.ip
  });

  try {
    const { old_password, new_password } = req.validated;
    const student_id = req.user?.id;

    // Call service
    await studentService.updatePassword(student_id, old_password, new_password);

    const duration = Date.now() - startTime;

    logger.info(
      `${LOG.API_END_PREFIX} PUT /api/students/update-password`,
      {
        student_id: student_id,
        duration_ms: duration
      }
    );

    return success(
      res,
      {},
      'Password updated successfully',
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;

    logger.error(
      `${LOG.API_ERROR_PREFIX} PUT /api/students/update-password`,
      {
        error: err.message,
        student_id: req.user?.id,
        duration_ms: duration
      }
    );

    if (err.message.includes('Invalid old password')) {
      return error(res, 'Old password is incorrect', HTTP_STATUS.UNAUTHORIZED);
    }

    if (err.message.includes('not found')) {
      return error(res, ERROR_MESSAGES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    return error(
      res,
      ERROR_MESSAGES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}
async function upsertProfile(req, res) {
  const startTime = Date.now();
  const studentId = req.user.id;

  logger.info(`${LOG.API_START_PREFIX} POST /api/v1/students/profile`, { student_id: studentId });

  try {
    const fullProfile = await studentService.upsertStudentProfile(
      studentId,
      req.user.college_id,
      req.user.email,
      req.validated
    );

    const duration = Date.now() - startTime;
    logger.info(`${LOG.API_END_PREFIX} POST /api/v1/students/profile`, { student_id: studentId, duration_ms: duration });

    return success(
      res,
      fullProfile,
      'Profile status fetched successfully', // Message as per your prompt example
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error(`${LOG.API_ERROR_PREFIX} POST /api/v1/students/profile ${err.message}`, { error: err.message, duration_ms: duration });
    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * API 2: Create Master Skill
 * Adds a new skill to the global skill list
 */
async function createSkill(req, res) {
  const startTime = Date.now();
  logger.info(`${LOG.API_START_PREFIX} POST /api/v1/skills`, { user_id: req.user.id });

  try {
    const skill = await studentService.createMasterSkill(req.validated.skill_name);

    const duration = Date.now() - startTime;
    logger.info(`${LOG.API_END_PREFIX} POST /api/v1/skills`, { skill_id: skill.skill_id, duration_ms: duration });

    return success(res, skill, 'Skill added successfully', HTTP_STATUS.CREATED);

  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error(`${LOG.API_ERROR_PREFIX} POST /api/v1/skills`, { error: err.message, duration_ms: duration });
    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

/**
 * API 3: Get Full Profile (GET) - NEW
 * Fetches all student data in the exact structure requested
 */
async function getProfile(req, res) {
  const startTime = Date.now();
  const studentId = req.user.id;

  // Log request (Optional for GET, but good for debugging complex profiles)
  // logger.debug(`${LOG.API_START_PREFIX} GET /api/v1/students/profile`, { student_id: studentId });

  try {
    // Call the helper directly
    const fullProfile = await studentService.fetchFullProfile(
      studentId,
      req.user.college_id
    );

    const duration = Date.now() - startTime;
    logger.info(`${LOG.API_END_PREFIX} GET /api/v1/students/profile`, { student_id: studentId, duration_ms: duration });

    return success(
      res,
      fullProfile,
      'Profile status fetched successfully',
      HTTP_STATUS.OK
    );

  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error(`${LOG.API_ERROR_PREFIX} GET /api/v1/students/profile`, { error: err.message, duration_ms: duration });

    // Handle specific not found case if strictly required, usually returns empty objects
    return error(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
module.exports = {
  registerStudent,
  bulkRegisterStudents,
  loginStudent,
  logoutStudent,
  updatePassword,
  upsertProfile,
  createSkill,
  getProfile
};
