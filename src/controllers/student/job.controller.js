/**
 * ============================================================================
 * STUDENT JOB CONTROLLER — Job Browsing & Application Route Handlers
 * ============================================================================
 * Endpoints:
 *   GET   /api/student/get_available_jobs                        — List published jobs
 *   GET   /api/student/get_job_details/:jobId                    — Full job info
 *   GET   /api/student/check_job_eligibility/:jobId              — Own eligibility
 *   POST  /api/student/apply_for_job/:jobId                      — Submit application
 *   POST  /api/student/deny_job/:jobId                           — Opt-out with reason
 *   GET   /api/student/get_my_applications                       — Own applications list
 *   GET   /api/student/get_application_details/:applicationId    — Detail + rounds
 *   PATCH /api/student/withdraw_application/:applicationId       — Withdraw
 * ============================================================================
 */

const jobService = require('../../services/student/job.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const logger = require('../../config/logger');
const {
    HTTP_STATUS,
    SUCCESS_MESSAGES,
    LOG,
} = require('../../config/constants');

// ============================================================================
// 1. GET AVAILABLE JOBS
// ============================================================================

async function getAvailableJobs(req, res) {
    const { jobs, total, page, limit } = await jobService.getAvailableJobs(
        req.user.id,
        req.user.college_id,
        req.validated
    );

    return sendPaginated(
        res,
        jobs,
        total,
        { page, limit },
        'Available jobs retrieved successfully'
    );
}

// ============================================================================
// 2. GET JOB DETAILS
// ============================================================================

async function getJobDetails(req, res) {
    const result = await jobService.getJobDetails(
        req.params.jobId,
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Job details retrieved successfully');
}

// ============================================================================
// 3. CHECK JOB ELIGIBILITY
// ============================================================================

async function checkJobEligibility(req, res) {
    const result = await jobService.checkJobEligibility(
        req.params.jobId,
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Eligibility check completed');
}

// ============================================================================
// 4. APPLY FOR JOB
// ============================================================================

async function applyForJob(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/apply_for_job/${req.params.jobId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await jobService.applyForJob(
        req.params.jobId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/apply_for_job/${req.params.jobId}`, {
        student_id: req.user.id,
        application_id: result.application_id,
        duration_ms: duration,
    });

    return sendSuccess(
        res,
        result,
        SUCCESS_MESSAGES.APPLICATION_SUBMITTED,
        HTTP_STATUS.CREATED
    );
}

// ============================================================================
// 5. DENY JOB
// ============================================================================

async function denyJob(req, res) {
    const startTime = Date.now();

    logger.info(`${LOG.API_START} POST /api/student/deny_job/${req.params.jobId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await jobService.denyJob(
        req.params.jobId,
        req.user.id,
        req.user.college_id,
        req.validated
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} POST /api/student/deny_job/${req.params.jobId}`, {
        student_id: req.user.id,
        denial_id: result.denial_id,
        duration_ms: duration,
    });

    return sendSuccess(
        res,
        result,
        'Job opted out successfully',
        HTTP_STATUS.CREATED
    );
}

// ============================================================================
// 6. GET MY APPLICATIONS
// ============================================================================

async function getMyApplications(req, res) {
    const { applications, total, page, limit, status_summary } =
        await jobService.getMyApplications(
            req.user.id,
            req.user.college_id,
            req.validated
        );

    return sendPaginated(
        res,
        { applications, status_summary },
        total,
        { page, limit },
        'Applications retrieved successfully'
    );
}

// ============================================================================
// 7. GET APPLICATION DETAILS
// ============================================================================

async function getApplicationDetails(req, res) {
    const result = await jobService.getApplicationDetails(
        req.params.applicationId,
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Application details retrieved successfully');
}

// ============================================================================
// 8. WITHDRAW APPLICATION
// ============================================================================

async function withdrawApplication(req, res) {
    const startTime = Date.now();
    const { applicationId } = req.params;

    logger.info(`${LOG.API_START} PATCH /api/student/withdraw_application/${applicationId}`, {
        student_id: req.user.id,
        college_id: req.user.college_id,
    });

    const result = await jobService.withdrawApplication(
        applicationId,
        req.user.id,
        req.user.college_id,
        req.validated?.withdrawal_reason ?? null
    );

    const duration = Date.now() - startTime;

    logger.info(`${LOG.API_END} PATCH /api/student/withdraw_application/${applicationId}`, {
        student_id: req.user.id,
        previous_status: result.previous_status,
        duration_ms: duration,
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.APPLICATION_WITHDRAWN);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getAvailableJobs,
    getJobDetails,
    checkJobEligibility,
    applyForJob,
    denyJob,
    getMyApplications,
    getApplicationDetails,
    withdrawApplication,
};
