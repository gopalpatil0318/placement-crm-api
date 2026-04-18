/**
 * ============================================================================
 * JOB CONTROLLER — Route Handlers for Job Posting Management
 * ============================================================================
 *   POST  /api/college/create_job
 *   GET   /api/college/get_all_jobs
 *   GET   /api/college/get_job/:jobId
 *   PUT   /api/college/update_job/:jobId
 *   PATCH /api/college/update_job_status/:jobId
 * ============================================================================
 */

const jobService = require('../../services/college/job.service');
const logger = require('../../config/logger');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    HTTP_STATUS,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE JOB
// ============================================================================

async function createJob(req, res) {
    try {
        const result = await jobService.createJob(
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
            resourceType: AUDIT_RESOURCE_TYPES.JOB,
            resourceId: result.job_id,
            summary: `Created job "${result.job_title}" at "${result.company_name}"`,
            newValue: { job_id: result.job_id, job_title: result.job_title, company_name: result.company_name, job_status: result.job_status },
            metadata: { entityName: result.job_title, companyName: result.company_name },
            ipAddress: getClientIp(req),
        });

        return sendCreated(res, result, SUCCESS_MESSAGES.JOB_CREATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL JOBS
// ============================================================================

async function getAllJobs(req, res) {
    try {
        const { jobs, total, page, limit } = await jobService.getAllJobs(
            req.user.college_id,
            req.validated
        );

        return sendPaginated(res, jobs, total, { page, limit }, SUCCESS_MESSAGES.JOBS_RETRIEVED);
    } catch (err) {
        logger.error('Failed to retrieve jobs', { error: err.message, stack: err.stack });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET JOB BY ID
// ============================================================================

async function getJob(req, res) {
    try {
        const result = await jobService.getJobById(
            req.params.jobId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.JOB_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. UPDATE JOB
// ============================================================================

async function updateJob(req, res) {
    try {
        const result = await jobService.updateJob(
            req.params.jobId,
            req.user.college_id,
            req.validated
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.JOB,
            resourceId: req.params.jobId,
            summary: `Updated job "${result.job_title}"`,
            newValue: result,
            metadata: { entityName: result.job_title, companyName: result.company_name },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.JOB_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 5. UPDATE JOB STATUS
// ============================================================================

async function updateJobStatus(req, res) {
    try {
        const { job_status } = req.validated;

        const result = await jobService.updateJobStatus(
            req.params.jobId,
            req.user.college_id,
            job_status
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.JOB,
            resourceId: req.params.jobId,
            summary: `Changed job "${result.job_title}" status to "${job_status}"`,
            oldValue: { job_status: result._previousStatus },
            newValue: { job_status },
            metadata: { entityName: result.job_title, companyName: result.company_name },
            ipAddress: getClientIp(req),
        });

        const statusMessages = {
            published: SUCCESS_MESSAGES.JOB_PUBLISHED,
            closed: SUCCESS_MESSAGES.JOB_CLOSED,
            cancelled: SUCCESS_MESSAGES.JOB_CANCELLED,
        };

        return sendSuccess(res, result, statusMessages[job_status] || SUCCESS_MESSAGES.JOB_UPDATED);
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
    createJob,
    getAllJobs,
    getJob,
    updateJob,
    updateJobStatus,
};
