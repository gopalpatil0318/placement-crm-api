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
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE TRAINING PROGRAM (#89)
// ============================================================================

async function createTrainingProgram(req, res) {
    try {
        const result = await trainingService.createTrainingProgram(
            req.user.college_id,
            req.user.id,
            req.validated
        );

        return sendCreated(res, result, SUCCESS_MESSAGES.TRAINING_CREATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL TRAINING PROGRAMS (#90)
// ============================================================================

async function getAllTrainingPrograms(req, res) {
    try {
        const { programs, total, page, limit } = await trainingService.getAllTrainingPrograms(
            req.user.college_id,
            req.validated
        );

        return sendPaginated(res, programs, total, { page, limit }, 'Training programs retrieved successfully');
    } catch (err) {
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET TRAINING PROGRAM BY ID (#91)
// ============================================================================

async function getTrainingProgram(req, res) {
    try {
        const result = await trainingService.getTrainingProgramById(
            req.params.programId,
            req.user.college_id
        );

        return sendSuccess(res, result, 'Training program retrieved successfully');
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. UPDATE TRAINING PROGRAM (#92)
// ============================================================================

async function updateTrainingProgram(req, res) {
    try {
        const result = await trainingService.updateTrainingProgram(
            req.params.programId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.TRAINING_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 5. TOGGLE TRAINING STATUS (#93)
// ============================================================================

async function toggleTrainingStatus(req, res) {
    try {
        const { program_status } = req.validated;

        const result = await trainingService.toggleTrainingStatus(
            req.params.programId,
            req.user.college_id,
            program_status
        );

        const message = `Training program status changed to "${program_status}"`;
        return sendSuccess(res, result, message);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 6. GET TRAINING ENROLLMENTS (#94)
// ============================================================================

async function getTrainingEnrollments(req, res) {
    try {
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
            'Enrollments retrieved successfully'
        );
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 7. UPDATE ENROLLMENT (#95)
// ============================================================================

async function updateEnrollment(req, res) {
    try {
        const result = await trainingService.updateEnrollment(
            req.params.enrollmentId,
            req.user.college_id,
            req.validated
        );

        return sendSuccess(res, result, 'Enrollment updated successfully');
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
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
