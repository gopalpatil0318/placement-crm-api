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
 * ============================================================================
 */

const trainingService = require('../../services/college/training.service');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const {
    SUCCESS_MESSAGES,
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

    return sendSuccess(res, result, SUCCESS_MESSAGES.TRAINING_STATUS_CHANGED);
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

    return sendSuccess(res, result, SUCCESS_MESSAGES.ENROLLMENT_UPDATED);
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
    getTrainingEnrollments,
    updateEnrollment,
};
