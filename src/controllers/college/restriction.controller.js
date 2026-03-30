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
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES } = require('../../config/constants');

// ============================================================================
// 1. ADD RESTRICTION
// ============================================================================

async function addRestriction(req, res) {
    const result = await restrictionService.addRestriction(
        req.params.studentId,
        req.user.college_id,
        req.user.id,
        req.validated
    );

    return sendCreated(res, result, SUCCESS_MESSAGES.RESTRICTION_ADDED);
}

// ============================================================================
// 2. GET ALL RESTRICTIONS (with passout_year filter)
// ============================================================================

async function getAllRestrictions(req, res) {
    const { restrictions, total, page, limit } = await restrictionService.getAllRestrictions(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, restrictions, total, { page, limit }, SUCCESS_MESSAGES.RESTRICTIONS_RETRIEVED);
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

    return sendSuccess(res, result, SUCCESS_MESSAGES.STUDENT_RESTRICTIONS_RETRIEVED);
}

// ============================================================================
// 4. UPDATE / RESOLVE RESTRICTION
// ============================================================================

async function updateRestriction(req, res) {
    const result = await restrictionService.updateRestriction(
        req.params.restrictionId,
        req.user.college_id,
        req.user.id,
        req.validated
    );

    const message = req.validated.is_active === false
        ? SUCCESS_MESSAGES.RESTRICTION_RESOLVED
        : SUCCESS_MESSAGES.RESTRICTION_UPDATED;

    return sendSuccess(res, result, message);
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
