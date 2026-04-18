/**
 * ============================================================================
 * TRAINING CONTROLLER — Route Handlers for Training Program Management
 * ============================================================================
 *   POST  /api/college/create_training_program              #89
 *   GET   /api/college/get_all_training_programs             #90
 *   GET   /api/college/get_training_program/:programId       #91
 *   PUT   /api/college/update_training_program/:programId    #92
 *   PATCH /api/college/toggle_training_status/:programId     #93
 *   GET   /api/college/get_training_enrollments/:programId   #94
 *   PATCH /api/college/update_enrollment/:enrollmentId       #95
 *   PATCH /api/college/bulk_update_enrollments/:programId    MF3
 *   GET   /api/college/student_training_report/:studentId    GAP-1
 *   POST  /api/college/training/:programId/sessions          B16
 *   GET   /api/college/training/:programId/sessions          B16
 *   PUT   /api/college/training/sessions/:sessionId          B16
 *   DELETE /api/college/training/sessions/:sessionId         B16
 *   POST  /api/college/training/sessions/:sessionId/attendance B16
 * ============================================================================
 */

const trainingService = require('../../services/college/training.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    SUCCESS_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE TRAINING PROGRAM (#89)
// ============================================================================

async function createTrainingProgram(req, res) {
    const result = await trainingService.createTrainingProgram(
        req.user.college_id,
        req.user.id,
        req.validated
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.program_id,
        summary: `Created training program "${result.program_name}"`,
        newValue: result,
        metadata: { entityName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendCreated(res, result, SUCCESS_MESSAGES.TRAINING_CREATED);
}

// ============================================================================
// 2. GET ALL TRAINING PROGRAMS (#90)
// ============================================================================

async function getAllTrainingPrograms(req, res) {
    const { programs, total, page, limit } = await trainingService.getAllTrainingPrograms(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, programs, total, { page, limit }, SUCCESS_MESSAGES.TRAININGS_RETRIEVED);
}

// ============================================================================
// 3. GET TRAINING PROGRAM BY ID (#91)
// ============================================================================

async function getTrainingProgram(req, res) {
    const result = await trainingService.getTrainingProgramById(
        req.params.programId,
        req.user.college_id
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.TRAINING_RETRIEVED);
}

// ============================================================================
// 4. UPDATE TRAINING PROGRAM (#92)
// ============================================================================

async function updateTrainingProgram(req, res) {
    const result = await trainingService.updateTrainingProgram(
        req.params.programId,
        req.user.college_id,
        req.validated
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: req.params.programId,
        summary: `Updated training program "${result.program_name}"`,
        oldValue: result._old,
        newValue: req.validated,
        metadata: { entityName: result.program_name },
        ipAddress: getClientIp(req),
    });

    delete result._old;
    return sendSuccess(res, result, SUCCESS_MESSAGES.TRAINING_UPDATED);
}

// ============================================================================
// 5. TOGGLE TRAINING STATUS (#93)
// ============================================================================

async function toggleTrainingStatus(req, res) {
    const { program_status } = req.validated;

    const result = await trainingService.toggleTrainingStatus(
        req.params.programId,
        req.user.college_id,
        program_status
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: req.params.programId,
        summary: `Changed training "${result.program_name}" status to "${program_status}"`,
        oldValue: { program_status: result._previousStatus },
        newValue: { program_status },
        metadata: { entityName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.TRAINING_STATUS_CHANGED);
}

// ============================================================================
// 5b. TOGGLE ENROLLMENT ACCESS
// ============================================================================

async function toggleEnrollmentAccess(req, res) {
    const { allow_enrollments } = req.validated;

    const result = await trainingService.toggleEnrollmentAccess(
        req.params.programId,
        req.user.college_id,
        allow_enrollments
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: req.params.programId,
        summary: `${allow_enrollments ? 'Opened' : 'Closed'} enrollment for "${result.program_name}"`,
        oldValue: { allow_enrollments: !allow_enrollments },
        newValue: { allow_enrollments },
        metadata: { entityName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.TRAINING_ENROLLMENT_ACCESS_CHANGED);
}

// ============================================================================
// 6. GET TRAINING ENROLLMENTS (#94)
// ============================================================================

async function getTrainingEnrollments(req, res) {
    const { program, enrollments, summary, total, page, limit } =
        await trainingService.getTrainingEnrollments(
            req.params.programId,
            req.user.college_id,
            req.validated
        );

    return sendPaginated(
        res,
        { program, enrollments, summary },
        total,
        { page, limit },
        SUCCESS_MESSAGES.ENROLLMENTS_RETRIEVED
    );
}

// ============================================================================
// 7. UPDATE ENROLLMENT (#95)
// ============================================================================

async function updateEnrollment(req, res) {
    const result = await trainingService.updateEnrollment(
        req.params.enrollmentId,
        req.user.college_id,
        req.validated
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.program_id ?? null,
        summary: `Updated enrollment for "${result.student_name}" in "${result._programName}" — ${Object.keys(req.validated).join(', ')}`,
        oldValue: result._old,
        newValue: req.validated,
        metadata: { enrollmentId: req.params.enrollmentId, entityName: result._programName, studentName: result.student_name },
        ipAddress: getClientIp(req),
    });

    delete result._old;
    delete result._programName;
    return sendSuccess(res, result, SUCCESS_MESSAGES.ENROLLMENT_UPDATED);
}

// ============================================================================
// 8. BULK UPDATE ENROLLMENTS (MF3)
// ============================================================================

async function bulkUpdateEnrollments(req, res) {
    const result = await trainingService.bulkUpdateEnrollments(
        req.params.programId,
        req.user.college_id,
        req.validated.updates
    );

    // Build descriptive summary of what changed
    const actions = req.validated.updates.map(u => {
        const fields = Object.keys(u).filter(k => k !== 'enrollment_id');
        return fields.join(', ');
    });
    const uniqueActions = [...new Set(actions)].join('; ');

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: req.params.programId,
        summary: `Bulk updated ${result.updated} of ${result.total} enrollments in "${result.program_name}" — ${uniqueActions}`,
        oldValue: { total_enrollments: result.total, failed: result.failed },
        newValue: req.validated.updates[0] ? Object.fromEntries(Object.entries(req.validated.updates[0]).filter(([k]) => k !== 'enrollment_id')) : {},
        metadata: { count: result.total, programId: req.params.programId, entityName: result.program_name, updated: result.updated, failed: result.failed },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.BULK_ENROLLMENT_UPDATED);
}

// ============================================================================
// 9. STUDENT TRAINING REPORT (GAP-1)
// ============================================================================

async function getStudentTrainingReport(req, res) {
    const result = await trainingService.getStudentTrainingReport(
        req.params.studentId,
        req.user.college_id
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.STUDENT_TRAINING_REPORT_RETRIEVED);
}

// ============================================================================
// 10. CREATE TRAINING SESSION (B16)
// ============================================================================

async function createTrainingSession(req, res) {
    const result = await trainingService.createTrainingSession(
        req.params.programId,
        req.user.college_id,
        req.user.id,
        req.validated
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.session_id,
        summary: `Created session #${result.session_number} for "${result._programName}"`,
        newValue: { session_number: result.session_number, session_date: result.session_date, session_topic: result.session_topic, venue: result.venue },
        metadata: { programId: req.params.programId, sessionNumber: result.session_number, entityName: result._programName },
        ipAddress: getClientIp(req),
    });

    delete result._programName;
    return sendCreated(res, result, SUCCESS_MESSAGES.SESSION_CREATED);
}

// ============================================================================
// 11. GET TRAINING SESSIONS (B16)
// ============================================================================

async function getTrainingSessions(req, res) {
    const result = await trainingService.getTrainingSessions(
        req.params.programId,
        req.user.college_id
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.SESSIONS_RETRIEVED);
}

// ============================================================================
// 12. UPDATE TRAINING SESSION (B16)
// ============================================================================

async function updateTrainingSession(req, res) {
    const result = await trainingService.updateTrainingSession(
        req.params.sessionId,
        req.user.college_id,
        req.validated
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.session_id,
        summary: `Updated session #${result.session_number} in "${result._programName}"`,
        oldValue: result._old,
        newValue: req.validated,
        metadata: { sessionId: req.params.sessionId, sessionNumber: result.session_number, entityName: result._programName },
        ipAddress: getClientIp(req),
    });

    delete result._old;
    delete result._programName;
    return sendSuccess(res, result, SUCCESS_MESSAGES.SESSION_UPDATED);
}

// ============================================================================
// 13. DELETE TRAINING SESSION (B16)
// ============================================================================

async function deleteTrainingSession(req, res) {
    const result = await trainingService.deleteTrainingSession(
        req.params.sessionId,
        req.user.college_id
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.DELETE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: req.params.sessionId,
        summary: `Deleted session #${result.session_number} from "${result.program_name}"`,
        oldValue: { session_number: result.session_number, session_date: result.session_date, session_topic: result.session_topic },
        metadata: { sessionId: req.params.sessionId, programId: result.program_id, entityName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.SESSION_DELETED);
}

// ============================================================================
// 14. MARK SESSION ATTENDANCE (B16)
// ============================================================================

async function markSessionAttendance(req, res) {
    const result = await trainingService.markSessionAttendance(
        req.params.sessionId,
        req.user.college_id,
        req.user.id,
        req.validated.attendance
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.session_id,
        summary: `Attendance marked for session #${result.session_number} in "${result.program_name}": ${result.present_count} present, ${result.absent_count} absent`,
        newValue: { present_count: result.present_count, absent_count: result.absent_count, total_marked: result.total_marked },
        metadata: { sessionId: req.params.sessionId, programId: result.program_id, totalMarked: result.total_marked, entityName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.ATTENDANCE_MARKED);
}

// ============================================================================
// 15. GET SESSION ATTENDANCE
// ============================================================================

async function getSessionAttendance(req, res) {
    const result = await trainingService.getSessionAttendance(
        req.params.sessionId,
        req.user.college_id
    );
    return sendSuccess(res, result, SUCCESS_MESSAGES.ATTENDANCE_RETRIEVED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createTrainingProgram,
    getAllTrainingPrograms,
    getTrainingProgram,
    updateTrainingProgram,
    toggleTrainingStatus,
    toggleEnrollmentAccess,
    getTrainingEnrollments,
    updateEnrollment,
    bulkUpdateEnrollments,
    getStudentTrainingReport,
    createTrainingSession,
    getTrainingSessions,
    updateTrainingSession,
    deleteTrainingSession,
    markSessionAttendance,
    getSessionAttendance,
};
