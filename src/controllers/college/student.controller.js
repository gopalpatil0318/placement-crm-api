/**
 * ============================================================================
 * STUDENT CONTROLLER — Route Handlers for Student Management
 * ============================================================================
 *   POST  /api/college/register_student
 *   POST  /api/college/bulk_register_students
 *   GET   /api/college/get_all_students
 *   GET   /api/college/get_student/:studentId
 *   GET   /api/college/get_student_full_profile/:studentId
 *   PUT   /api/college/update_student/:studentId
 *   PATCH /api/college/toggle_student_status/:studentId
 *   PATCH /api/college/approve_student_profile/:studentId
 * ============================================================================
 */

const studentService = require('../../services/college/student.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES } = require('../../config/constants');

// ============================================================================
// 1. REGISTER SINGLE STUDENT
// ============================================================================

async function registerStudent(req, res) {
    const result = await studentService.registerStudent(
        req.validated,
        req.user.college_id
    );

    return sendCreated(res, result, SUCCESS_MESSAGES.STUDENT_REGISTERED);
}

// ============================================================================
// 2. BULK REGISTER STUDENTS
// ============================================================================

async function bulkRegisterStudents(req, res) {
    const { students } = req.validated;

    const result = await studentService.bulkRegisterStudents(
        students,
        req.user.college_id
    );

    return sendCreated(res, result, SUCCESS_MESSAGES.STUDENTS_BULK_REGISTERED);
}

// ============================================================================
// 3. GET ALL STUDENTS
// ============================================================================

async function getAllStudents(req, res) {
    const { students, total, page, limit } = await studentService.getAllStudents(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, students, total, { page, limit }, 'Students retrieved successfully');
}

// ============================================================================
// 4. GET STUDENT BY ID
// ============================================================================

async function getStudent(req, res) {
    const result = await studentService.getStudentById(
        req.params.studentId,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Student retrieved successfully');
}

// ============================================================================
// 5. GET STUDENT FULL PROFILE
// ============================================================================

async function getStudentFullProfile(req, res) {
    const { review } = req.validated;

    const result = await studentService.getStudentFullProfile(
        req.params.studentId,
        req.user.college_id,
        review
    );

    return sendSuccess(res, result, 'Student full profile retrieved successfully');
}

// ============================================================================
// 6. UPDATE STUDENT
// ============================================================================

async function updateStudent(req, res) {
    const result = await studentService.updateStudent(
        req.params.studentId,
        req.user.college_id,
        req.validated
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.STUDENT_UPDATED);
}

// ============================================================================
// 7. TOGGLE STUDENT STATUS
// ============================================================================

async function toggleStudentStatus(req, res) {
    const { student_status } = req.validated;

    const result = await studentService.toggleStudentStatus(
        req.params.studentId,
        req.user.college_id,
        student_status
    );

    return sendSuccess(res, result, `Student status updated to ${student_status}`);
}

// ============================================================================
// 8. APPROVE / REJECT STUDENT PROFILE
// ============================================================================

async function approveStudentProfile(req, res) {
    const { action, rejection_reason } = req.validated;

    const result = await studentService.approveStudentProfile(
        req.params.studentId,
        req.user.college_id,
        req.user.id,
        action,
        rejection_reason
    );

    const message = action === 'approved'
        ? SUCCESS_MESSAGES.STUDENT_PROFILE_APPROVED
        : SUCCESS_MESSAGES.STUDENT_PROFILE_REJECTED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    registerStudent,
    bulkRegisterStudents,
    getAllStudents,
    getStudent,
    getStudentFullProfile,
    updateStudent,
    toggleStudentStatus,
    approveStudentProfile,
};
