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
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const { SUCCESS_MESSAGES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');

// ============================================================================
// 1. REGISTER SINGLE STUDENT
// ============================================================================

async function registerStudent(req, res) {
    const result = await studentService.registerStudent(
        req.validated,
        req.user.college_id
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: result.student_id,
        summary: `Registered student "${result.first_name} ${result.last_name}"`,
        newValue: result,
        metadata: { entityName: `${result.first_name} ${result.last_name}` },
        ipAddress: getClientIp(req),
    });

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

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_IMPORT,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        summary: `Bulk registered ${result.summary?.total ?? students.length} students (${result.summary?.success ?? 0} success, ${result.summary?.failed ?? 0} failed)`,
        metadata: result.summary,
        ipAddress: getClientIp(req),
    });

    return sendCreated(res, result, SUCCESS_MESSAGES.STUDENTS_BULK_REGISTERED);
}

// ============================================================================
// 3. GET ALL STUDENTS
// ============================================================================

async function getAllStudents(req, res) {
    const { students, total, page, limit } = await studentService.getAllStudents(
        req.user.college_id,
        req.validated,
        req.deptScope
    );

    return sendPaginated(res, students, total, { page, limit }, SUCCESS_MESSAGES.STUDENTS_RETRIEVED);
}

// ============================================================================
// 4. GET STUDENT BY ID
// ============================================================================

async function getStudent(req, res) {
    const result = await studentService.getStudentById(
        req.params.studentId,
        req.user.college_id,
        req.deptScope
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.STUDENT_RETRIEVED);
}

// ============================================================================
// 5. GET STUDENT FULL PROFILE
// ============================================================================

async function getStudentFullProfile(req, res) {
    const { review } = req.validated;

    const result = await studentService.getStudentFullProfile(
        req.params.studentId,
        req.user.college_id,
        review,
        req.deptScope
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.STUDENT_PROFILE_RETRIEVED);
}

// ============================================================================
// 6. UPDATE STUDENT
// ============================================================================

async function updateStudent(req, res) {
    const result = await studentService.updateStudent(
        req.params.studentId,
        req.user.college_id,
        req.validated,
        req.deptScope
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: req.params.studentId,
        summary: `Updated student "${result.first_name} ${result.last_name}" profile`,
        newValue: result,
        metadata: { entityName: `${result.first_name} ${result.last_name}` },
        ipAddress: getClientIp(req),
    });

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
        student_status,
        req.deptScope
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: req.params.studentId,
        summary: `Changed student "${result.first_name} ${result.last_name}" status to "${student_status}"`,
        oldValue: { student_status: result._previousStatus },
        newValue: { student_status },
        metadata: { entityName: `${result.first_name} ${result.last_name}` },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.STUDENT_STATUS_TOGGLED);
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
        rejection_reason,
        req.deptScope
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: req.params.studentId,
        summary: `${action === 'approved' ? 'Approved' : 'Rejected'} student "${result.first_name} ${result.last_name}" profile`,
        oldValue: { approval_status: result._previousApprovalStatus },
        newValue: { action, rejection_reason: rejection_reason ?? null },
        metadata: { entityName: `${result.first_name} ${result.last_name}` },
        ipAddress: getClientIp(req),
    });

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
