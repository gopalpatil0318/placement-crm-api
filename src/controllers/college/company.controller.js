/**
 * ============================================================================
 * COMPANY CONTROLLER — Route Handlers for Company Management
 * ============================================================================
 *   POST  /api/college/create_company
 *   GET   /api/college/get_all_companies
 *   GET   /api/college/get_company/:companyId
 *   PUT   /api/college/update_company/:companyId
 *   PATCH /api/college/toggle_company_status/:companyId
 * ============================================================================
 */

const companyService = require('../../services/college/company.service');
const { sendSuccess, sendCreated, sendError, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const logger = require('../../config/logger');
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    HTTP_STATUS,
    AUDIT_ACTIONS,
    AUDIT_RESOURCE_TYPES,
    LOG,
} = require('../../config/constants');

// ============================================================================
// 1. CREATE COMPANY
// ============================================================================

async function createCompany(req, res) {
    try {
        const result = await companyService.createCompany(
            req.user.college_id,
            req.validated
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.CREATE,
            resourceType: AUDIT_RESOURCE_TYPES.COMPANY,
            resourceId: result.company_id,
            summary: `Created company "${result.company_name}"`,
            newValue: result,
            metadata: { entityName: result.company_name },
            ipAddress: getClientIp(req),
        });

        return sendCreated(res, result, SUCCESS_MESSAGES.COMPANY_CREATED);
    } catch (err) {
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET ALL COMPANIES
// ============================================================================

async function getAllCompanies(req, res) {
    try {
        const { companies, total, page, limit } = await companyService.getAllCompanies(
            req.user.college_id,
            req.validated
        );

        return sendPaginated(res, companies, total, { page, limit }, SUCCESS_MESSAGES.COMPANIES_RETRIEVED);
    } catch (err) {
        logger.error(`${LOG.AUTH} Failed to fetch companies`, { error: err.message });
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. GET COMPANY BY ID (with contacts)
// ============================================================================

async function getCompany(req, res) {
    try {
        const result = await companyService.getCompanyById(
            req.params.companyId,
            req.user.college_id
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.COMPANY_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. UPDATE COMPANY
// ============================================================================

async function updateCompany(req, res) {
    try {
        const result = await companyService.updateCompany(
            req.params.companyId,
            req.user.college_id,
            req.validated
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.UPDATE,
            resourceType: AUDIT_RESOURCE_TYPES.COMPANY,
            resourceId: req.params.companyId,
            summary: `Updated company "${result.company_name}"`,
            newValue: result,
            metadata: { entityName: result.company_name },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.COMPANY_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 5. TOGGLE COMPANY STATUS
// ============================================================================

async function toggleCompanyStatus(req, res) {
    try {
        const { company_status } = req.validated;

        const result = await companyService.toggleCompanyStatus(
            req.params.companyId,
            req.user.college_id,
            company_status
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.COMPANY,
            resourceId: req.params.companyId,
            summary: `Changed company "${result.company_name}" status to ${company_status}`,
            oldValue: { company_status: result._previousStatus },
            newValue: { company_status },
            metadata: { entityName: result.company_name },
            ipAddress: getClientIp(req),
        });

        const message = company_status === 'active'
            ? SUCCESS_MESSAGES.COMPANY_ACTIVATED
            : SUCCESS_MESSAGES.COMPANY_DEACTIVATED;

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
    createCompany,
    getAllCompanies,
    getCompany,
    updateCompany,
    toggleCompanyStatus,
};
