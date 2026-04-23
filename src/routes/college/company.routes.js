/**
 * ============================================================================
 * COMPANY ROUTES — Company Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /create_company                      Create + validate
 *   GET   /get_all_companies                    List + validate(query)
 *   GET   /get_company/:companyId               Get single with contacts
 *   PUT   /update_company/:companyId            Update + validate
 *   PATCH /toggle_company_status/:companyId     Toggle status + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/company.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    createCompanySchema,
    listCompaniesSchema,
    updateCompanySchema,
    toggleCompanyStatusSchema,
    companyIdParamSchema,
} = require('../../validators/college/company.validator');

// All company routes require authentication
router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/create_company',
    requirePermission(PERMISSIONS.COMPANIES_CREATE),
    validate(createCompanySchema),
    asyncHandler(controller.createCompany)
);

router.get(
    '/get_all_companies',
    requirePermission(PERMISSIONS.COMPANIES_VIEW),
    validate(listCompaniesSchema, 'query'),
    asyncHandler(controller.getAllCompanies)
);

router.get(
    '/get_company/:companyId',
    requirePermission(PERMISSIONS.COMPANIES_VIEW),
    validate(companyIdParamSchema, 'params'),
    asyncHandler(controller.getCompany)
);

router.put(
    '/update_company/:companyId',
    requirePermission(PERMISSIONS.COMPANIES_UPDATE),
    validate(companyIdParamSchema, 'params'),
    validate(updateCompanySchema),
    asyncHandler(controller.updateCompany)
);

router.patch(
    '/toggle_company_status/:companyId',
    requirePermission(PERMISSIONS.COMPANIES_UPDATE),
    validate(companyIdParamSchema, 'params'),
    validate(toggleCompanyStatusSchema),
    asyncHandler(controller.toggleCompanyStatus)
);

module.exports = router;
