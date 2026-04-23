/**
 * ============================================================================
 * JOB CRITERIA CONTROLLER — Route Handlers for Eligibility Criteria
 * ============================================================================
 *   POST /api/college/set_job_criteria/:jobId
 *   PUT  /api/college/update_job_criteria/:jobId
 *   GET  /api/college/get_eligible_students/:jobId
 *   GET  /api/college/get_job_criteria_history/:jobId
 * ============================================================================
 */

const criteriaService = require('../../services/college/jobCriteria.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/responseHelper');
const { getClientIp } = require('../../utils/auditHelper');
const {
    ERROR_MESSAGES,
    SUCCESS_MESSAGES,
    HTTP_STATUS,
} = require('../../config/constants');

/**
 * Build audit context from request for passing to service layer.
 */
function buildAuditCtx(req) {
    return {
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        ipAddress: getClientIp(req),
    };
}

// ============================================================================
// 1. SET CRITERIA
// ============================================================================

async function setCriteria(req, res) {
    try {
        const result = await criteriaService.setCriteria(
            req.params.jobId,
            req.user.college_id,
            req.validated,
            buildAuditCtx(req)
        );

        return sendCreated(res, result, SUCCESS_MESSAGES.CRITERIA_SET);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. UPDATE CRITERIA
// ============================================================================

async function updateCriteria(req, res) {
    try {
        const result = await criteriaService.updateCriteria(
            req.params.jobId,
            req.user.college_id,
            req.validated,
            buildAuditCtx(req)
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.CRITERIA_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET ELIGIBLE STUDENTS
// ============================================================================

async function getEligibleStudents(req, res) {
    try {
        const result = await criteriaService.getEligibleStudents(
            req.params.jobId,
            req.user.college_id,
            req.validated || {}
        );

        return sendSuccess(res, {
            job: result.job,
            criteria: result.criteria,
            eligible_count: result.eligible_count,
            total_students: result.total_students,
            eligibility_percentage: result.eligibility_percentage,
            students: result.students,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.eligible_count,
                totalPages: Math.ceil(result.eligible_count / result.limit),
            },
        }, SUCCESS_MESSAGES.ELIGIBLE_STUDENTS_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. GET CRITERIA CHANGE HISTORY
// ============================================================================

async function getCriteriaHistory(req, res) {
    try {
        const history = await criteriaService.getCriteriaHistory(
            req.params.jobId,
            req.user.college_id
        );

        return sendSuccess(res, { history }, SUCCESS_MESSAGES.CRITERIA_HISTORY_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    setCriteria,
    updateCriteria,
    getEligibleStudents,
    getCriteriaHistory,
};
