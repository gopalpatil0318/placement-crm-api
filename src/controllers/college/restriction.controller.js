/**
 * ============================================================================
 * RESTRICTION CONTROLLER — Route Handlers for Student Restriction Management
 * ============================================================================
 *   POST  /api/college/add_student_restriction/:studentId
 *   GET   /api/college/get_all_restrictions
 *   GET   /api/college/get_student_restrictions/:studentId
 *   PATCH /api/college/update_restriction/:restrictionId
 * ============================================================================
 */

const restrictionService = require('../../services/college/restriction.service');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

// ============================================================================
// 1. ADD RESTRICTION
// ============================================================================

async function addRestriction(req, res) {
    try {
        const result = await restrictionService.addRestriction(
            req.params.studentId,
            req.user.college_id,
            req.user.id,
            req.validated
        );

        return sendCreated(res, result, SUCCESS_MESSAGES.RESTRICTION_ADDED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL RESTRICTIONS (with passout_year filter)
// ============================================================================

async function getAllRestrictions(req, res) {
    const { restrictions, total, page, limit } = await restrictionService.getAllRestrictions(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, restrictions, total, { page, limit }, 'Restrictions retrieved successfully');
}

// ============================================================================
// 3. GET STUDENT RESTRICTIONS
// ============================================================================

async function getStudentRestrictions(req, res) {
    const result = await restrictionService.getStudentRestrictions(
        req.params.studentId,
        req.user.college_id,
        req.validated || {}
    );

    return sendSuccess(res, result, 'Student restrictions retrieved successfully');
}

// ============================================================================
// 4. UPDATE / RESOLVE RESTRICTION
// ============================================================================

async function updateRestriction(req, res) {
    try {
        const result = await restrictionService.updateRestriction(
            req.params.restrictionId,
            req.user.college_id,
            req.user.id,
            req.validated
        );

        const message = req.validated.is_active === false
            ? 'Restriction resolved successfully'
            : SUCCESS_MESSAGES.RESTRICTION_UPDATED;

        return sendSuccess(res, result, message);
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
    addRestriction,
    getAllRestrictions,
    getStudentRestrictions,
    updateRestriction,
};
