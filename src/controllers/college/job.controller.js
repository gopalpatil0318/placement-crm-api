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
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    HTTP_STATUS,
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

        return sendPaginated(res, jobs, total, { page, limit }, 'Jobs retrieved successfully');
    } catch (err) {
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

        return sendSuccess(res, result, 'Job details retrieved successfully');
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

        const statusMessages = {
            published: SUCCESS_MESSAGES.JOB_PUBLISHED,
            closed: SUCCESS_MESSAGES.JOB_CLOSED,
            cancelled: 'Job posting cancelled',
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
