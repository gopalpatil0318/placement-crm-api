/**
 * ============================================================================
 * COLLEGE DASHBOARD ROUTES — Dashboard & Statistics Endpoints
 * ============================================================================
 * Base: /api/college
 *
 *  ON LOGIN (lightweight — call immediately):
 *   #105a  GET  /dashboard_overview              → Headline KPIs
 *
 *  ON DEMAND (lazy-load when user clicks section):
 *   #105b  GET  /dashboard_placement_stats        → Package slabs, offer breakdown
 *   #105c  GET  /dashboard_application_funnel     → Application pipeline
 *   #105d  GET  /dashboard_student_readiness      → Profile status, restrictions
 *   #105e  GET  /dashboard_diversity_stats         → Gender/category (NAAC)
 *   #105f  GET  /dashboard_training_stats          → Training + feedback
 *   #106   GET  /dashboard_department_wise         → Department-wise stats
 *   #107   GET  /dashboard_company_wise            → Company-wise stats
 *   #108   GET  /dashboard_year_comparison         → Year-over-year comparison
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/dashboard.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    passoutYearSchema,
    departmentWiseSchema,
    companyWiseSchema,
    yearComparisonSchema,
} = require('../../validators/college/dashboard.validator');

// All routes: authenticate + college admin/TPO + rate limit
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// #105a — Overview (on login)
router.get('/dashboard_overview',
    validate(passoutYearSchema, 'query'),
    asyncHandler(controller.getOverview)
);

// #105b — Placement stats (on demand)
router.get('/dashboard_placement_stats',
    validate(passoutYearSchema, 'query'),
    asyncHandler(controller.getPlacementStats)
);

// #105c — Application funnel (on demand)
router.get('/dashboard_application_funnel',
    validate(passoutYearSchema, 'query'),
    asyncHandler(controller.getApplicationFunnel)
);

// #105d — Student readiness (on demand)
router.get('/dashboard_student_readiness',
    validate(passoutYearSchema, 'query'),
    asyncHandler(controller.getStudentReadiness)
);

// #105e — Diversity stats (on demand)
router.get('/dashboard_diversity_stats',
    validate(passoutYearSchema, 'query'),
    asyncHandler(controller.getDiversityStats)
);

// #105f — Training & feedback stats (on demand)
router.get('/dashboard_training_stats',
    validate(passoutYearSchema, 'query'),
    asyncHandler(controller.getTrainingStats)
);

// #106 — Department-wise stats (on demand)
router.get('/dashboard_department_wise',
    validate(departmentWiseSchema, 'query'),
    asyncHandler(controller.getDepartmentWise)
);

// #107 — Company-wise stats (on demand)
router.get('/dashboard_company_wise',
    validate(companyWiseSchema, 'query'),
    asyncHandler(controller.getCompanyWise)
);

// #108 — Year comparison (on demand)
router.get('/dashboard_year_comparison',
    validate(yearComparisonSchema, 'query'),
    asyncHandler(controller.getYearComparison)
);

module.exports = router;
