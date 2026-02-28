/**
 * ============================================================================
 * STUDENT SEMESTER GRADES CONTROLLER — Route Handlers
 * ============================================================================
 * Endpoints:
 *   POST  /api/student/add_semester_grade           — Add a semester grade
 *   GET   /api/student/get_all_semester_grades       — Get all semester grades
 *   PUT   /api/student/update_semester_grade/:gradeId — Update a semester grade
 * ============================================================================
 */

const semesterService = require('../../services/student/semester.service');
const { sendSuccess, sendError } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const { ERROR_MESSAGES, LOG, HTTP_STATUS } = require('../../config/constants');

// ============================================================================
// 1. ADD SEMESTER GRADE
// ============================================================================

async function addSemesterGrade(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/add_semester_grade`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
        semester_number: req.validated.semester_number,
    });

    try {
        const result = await semesterService.addSemesterGrade(
            req.user.id,
            req.user.college_id,
            req.user.dept_id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} POST /api/student/add_semester_grade`, {
            student_id: req.user.id,
            semester_number: req.validated.semester_number,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Semester grade added successfully', HTTP_STATUS.CREATED);
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} POST /api/student/add_semester_grade`, {
            error: err.message,
            stack: err.stack,
            student_id: req.user.id,
            duration_ms: duration,
        });

        if (err.status === 400) {
            return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        }
        if (err.status === 404) {
            return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        }
        if (err.status === 409) {
            return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        }
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL SEMESTER GRADES
// ============================================================================

async function getAllSemesterGrades(req, res) {
    const result = await semesterService.getAllSemesterGrades(
        req.user.id,
        req.user.college_id,
        req.user.dept_id
    );

    return sendSuccess(res, result, 'Semester grades retrieved successfully');
}

// ============================================================================
// 3. UPDATE SEMESTER GRADE
// ============================================================================

async function updateSemesterGrade(req, res) {
    const startTime = Date.now();
    const { gradeId } = req.params;

    logger.info(`${LOG.API_START} PUT /api/student/update_semester_grade/${gradeId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
        grade_id: gradeId,
    });

    try {
        const result = await semesterService.updateSemesterGrade(
            gradeId,
            req.user.id,
            req.user.college_id,
            req.validated
        );

        const duration = Date.now() - startTime;

        logger.info(`${LOG.API_END} PUT /api/student/update_semester_grade/${gradeId}`, {
            student_id: req.user.id,
            grade_id: gradeId,
            duration_ms: duration,
        });

        return sendSuccess(res, result, 'Semester grade updated successfully');
    } catch (err) {
        const duration = Date.now() - startTime;

        logger.error(`${LOG.API_ERROR} PUT /api/student/update_semester_grade/${gradeId}`, {
            error: err.message,
            stack: err.stack,
            student_id: req.user.id,
            duration_ms: duration,
        });

        if (err.status === 400) {
            return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        }
        if (err.status === 404) {
            return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        }
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addSemesterGrade,
    getAllSemesterGrades,
    updateSemesterGrade,
};
