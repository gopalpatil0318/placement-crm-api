/**
 * ============================================================================
 * STUDENT TRAINING CONTROLLER — Training Programs Route Handlers (Student-Side)
 * ============================================================================
 * Endpoints:
 *   GET  /api/student/get_available_training                        #164
 *   POST /api/student/enroll_in_training/:programId                 #165
 *   GET  /api/student/get_enrolled_training                         #166
 *   POST /api/student/submit_training_feedback/:enrollmentId        #167
 *   PATCH /api/student/withdraw_from_training/:programId             B14.15
 *   PUT   /api/student/update_training_feedback/:enrollmentId        B14.13
 *   GET  /api/student/training_sessions/:programId                  GAP-2
 * ============================================================================
 */

const trainingService = require('../../services/student/training.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    SUCCESS_MESSAGES,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
    LOG,
} = require('../../config/constants');

// ============================================================================
// 1. GET AVAILABLE TRAINING PROGRAMS (#164)
// ============================================================================

async function getAvailableTraining(req, res) {
    const { programs, total, page, limit } =
        await trainingService.getAvailableTrainings(
            req.user.id,
            req.user.college_id,
            req.validated
        );

    return sendPaginated(res, programs, total, { page, limit }, SUCCESS_MESSAGES.AVAILABLE_TRAININGS_RETRIEVED);
}

// ============================================================================
// 2. ENROLL IN TRAINING (#165)
// ============================================================================

async function enrollInTraining(req, res) {
    const startTime = Date.now();
    const { programId } = req.params;

    logger.info(`${LOG.API_START} POST /api/student/enroll_in_training/${programId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await trainingService.enrollInTraining(
        programId,
        req.user.id,
        req.user.college_id
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/enroll_in_training/${programId}`, {
        student_id: req.user.id,
        enrollment_id: result.enrollment_id,
        duration_ms: duration,
    });

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.program_id,
        summary: `Student enrolled in "${result.program_name}"`,
        newValue: { enrollment_id: result.enrollment_id, completion_status: result.completion_status },
        metadata: { enrollmentId: result.enrollment_id, programName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.ENROLLMENT_SUCCESS);
}

// ============================================================================
// 3. GET ENROLLED TRAINING (#166)
// ============================================================================

async function getEnrolledTraining(req, res) {
    const { enrollments, total, page, limit, summary } =
        await trainingService.getEnrolledTrainings(
            req.user.id,
            req.user.college_id,
            req.validated
        );

    return sendPaginated(
        res,
        { enrollments, summary },
        total,
        { page, limit },
        SUCCESS_MESSAGES.ENROLLED_TRAININGS_RETRIEVED
    );
}

// ============================================================================
// 4. SUBMIT TRAINING FEEDBACK (#167)
// ============================================================================

async function submitTrainingFeedback(req, res) {
    const startTime = Date.now();
    const { enrollmentId } = req.params;

    logger.info(`${LOG.API_START} POST /api/student/submit_training_feedback/${enrollmentId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await trainingService.submitTrainingFeedback(
        enrollmentId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/submit_training_feedback/${enrollmentId}`, {
        student_id: req.user.id,
        enrollment_id: enrollmentId,
        duration_ms: duration,
    });

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.CREATE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.program_id,
        summary: `Student submitted feedback for "${result.program_name}"`,
        newValue: { student_rating: result.student_rating, student_feedback: result.student_feedback },
        metadata: { enrollmentId, programName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.FEEDBACK_SUBMITTED);
}

// ============================================================================
// 5. WITHDRAW FROM TRAINING (B14.15)
// ============================================================================

async function withdrawFromTraining(req, res) {
    const result = await trainingService.withdrawFromTraining(
        req.params.programId,
        req.user.id,
        req.user.college_id
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.TRAINING,
        resourceId: result.program_id,
        summary: `Student withdrew from "${result.program_name}"`,
        newValue: { completion_status: result.completion_status },
        metadata: { enrollmentId: result.enrollment_id, programName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.ENROLLMENT_WITHDRAWN);
}

// ============================================================================
// 6. UPDATE TRAINING FEEDBACK (B14.13)
// ============================================================================

async function updateTrainingFeedback(req, res) {
    const result = await trainingService.updateTrainingFeedback(
        req.params.enrollmentId,
        req.user.id,
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
        resourceId: result.program_id,
        summary: `Student updated feedback for "${result.program_name}"`,
        newValue: { student_rating: result.student_rating, student_feedback: result.student_feedback },
        metadata: { enrollmentId: req.params.enrollmentId, programName: result.program_name },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.FEEDBACK_UPDATED);
}

// ============================================================================
// 7. GET MY SESSION SCHEDULE (GAP-2)
// ============================================================================

async function getMySessionSchedule(req, res) {
    const result = await trainingService.getMySessionSchedule(
        req.params.programId,
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.SESSIONS_RETRIEVED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getAvailableTraining,
    enrollInTraining,
    getEnrolledTraining,
    submitTrainingFeedback,
    withdrawFromTraining,
    updateTrainingFeedback,
    getMySessionSchedule,
};
