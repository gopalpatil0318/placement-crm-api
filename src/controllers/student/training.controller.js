/**
 * ============================================================================
 * STUDENT TRAINING CONTROLLER — Training Programs Route Handlers (Student-Side)
 * ============================================================================
 * Endpoints:
 *   GET  /api/student/get_available_training                        #164
 *   POST /api/student/enroll_in_training/:programId                 #165
 *   GET  /api/student/get_enrolled_training                         #166
 *   POST /api/student/submit_training_feedback/:enrollmentId        #167
 * ============================================================================
 */

const trainingService = require('../../services/student/training.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    SUCCESS_MESSAGES,
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

    return sendPaginated(res, programs, total, { page, limit }, 'Available training programs retrieved successfully');
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
        'Enrolled training programs retrieved successfully'
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

    return sendSuccess(res, result, SUCCESS_MESSAGES.FEEDBACK_SUBMITTED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getAvailableTraining,
    enrollInTraining,
    getEnrolledTraining,
    submitTrainingFeedback,
};
