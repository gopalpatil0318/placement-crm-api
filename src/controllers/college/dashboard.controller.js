/**
 * ============================================================================
 * COLLEGE DASHBOARD CONTROLLER — Dashboard & Statistics HTTP Handlers
 * ============================================================================
 *  ON LOGIN:
 *   #105a  getOverview            GET  /api/college/dashboard_overview
 *
 *  ON DEMAND:
 *   #105b  getPlacementStats      GET  /api/college/dashboard_placement_stats
 *   #105c  getApplicationFunnel   GET  /api/college/dashboard_application_funnel
 *   #105d  getStudentReadiness    GET  /api/college/dashboard_student_readiness
 *   #105e  getDiversityStats      GET  /api/college/dashboard_diversity_stats
 *   #105f  getTrainingStats       GET  /api/college/dashboard_training_stats
 *   #106   getDepartmentWise      GET  /api/college/dashboard_department_wise
 *   #107   getCompanyWise         GET  /api/college/dashboard_company_wise
 *   #108   getYearComparison      GET  /api/college/dashboard_year_comparison
 * ============================================================================
 */

const dashboardService = require('../../services/college/dashboard.service');
const { sendSuccess } = require('../../utils/responseHelper');
const { SUCCESS_MESSAGES } = require('../../config/constants');

// ============================================================================
// #105a — OVERVIEW (loaded on login)
// ============================================================================

async function getOverview(req, res) {
    const data = await dashboardService.getOverview(
        req.user.college_id,
        req.validated.passout_year
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.DASHBOARD_OVERVIEW_RETRIEVED);
}

// ============================================================================
// #105b — PLACEMENT STATS (on demand)
// ============================================================================

async function getPlacementStats(req, res) {
    const data = await dashboardService.getPlacementStats(
        req.user.college_id,
        req.validated.passout_year
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.PLACEMENT_STATS_RETRIEVED);
}

// ============================================================================
// #105c — APPLICATION FUNNEL (on demand)
// ============================================================================

async function getApplicationFunnel(req, res) {
    const data = await dashboardService.getApplicationFunnel(
        req.user.college_id,
        req.validated.passout_year
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.APPLICATION_FUNNEL_RETRIEVED);
}

// ============================================================================
// #105d — STUDENT READINESS (on demand)
// ============================================================================

async function getStudentReadiness(req, res) {
    const data = await dashboardService.getStudentReadiness(
        req.user.college_id,
        req.validated.passout_year
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.STUDENT_READINESS_RETRIEVED);
}

// ============================================================================
// #105e — DIVERSITY STATS (on demand)
// ============================================================================

async function getDiversityStats(req, res) {
    const data = await dashboardService.getDiversityStats(
        req.user.college_id,
        req.validated.passout_year
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.DIVERSITY_STATS_RETRIEVED);
}

// ============================================================================
// #105f — TRAINING & FEEDBACK STATS (on demand)
// ============================================================================

async function getTrainingStats(req, res) {
    const data = await dashboardService.getTrainingStats(
        req.user.college_id,
        req.validated.passout_year
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.TRAINING_STATS_RETRIEVED);
}

// ============================================================================
// #106 — DEPARTMENT-WISE (on demand)
// ============================================================================

async function getDepartmentWise(req, res) {
    const data = await dashboardService.getDepartmentWise(
        req.user.college_id,
        req.validated.passout_year,
        req.validated.dept_id
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.DEPARTMENT_STATS_RETRIEVED);
}

// ============================================================================
// #107 — COMPANY-WISE (on demand)
// ============================================================================

async function getCompanyWise(req, res) {
    const data = await dashboardService.getCompanyWise(
        req.user.college_id,
        req.validated.passout_year,
        req.validated.company_id
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.COMPANY_STATS_RETRIEVED);
}

// ============================================================================
// #108 — YEAR COMPARISON (on demand)
// ============================================================================

async function getYearComparison(req, res) {
    const years = req.validated.passout_years.split(',').map(y => Number.parseInt(y, 10));
    const data = await dashboardService.getYearComparison(
        req.user.college_id,
        years
    );
    return sendSuccess(res, data, SUCCESS_MESSAGES.YEAR_COMPARISON_RETRIEVED);
}

module.exports = {
    getOverview,
    getPlacementStats,
    getApplicationFunnel,
    getStudentReadiness,
    getDiversityStats,
    getTrainingStats,
    getDepartmentWise,
    getCompanyWise,
    getYearComparison,
};
