/**
 * ============================================================================
 * STUDENT DASHBOARD CONTROLLER — Dashboard Overview Handler
 * ============================================================================
 * Endpoints:
 *   GET  /api/student/get_dashboard_overview  — Composite dashboard data
 * ============================================================================
 */

const dashboardService = require('../../services/student/dashboard.service');
const { sendSuccess } = require('../../utils/responseHelper');

// ============================================================================
// 1. GET DASHBOARD OVERVIEW
// ============================================================================

async function getDashboardOverview(req, res) {
    const result = await dashboardService.getDashboardOverview(
        req.user.id,
        req.user.college_id
    );

    return sendSuccess(res, result, 'Dashboard overview retrieved successfully');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getDashboardOverview,
};
