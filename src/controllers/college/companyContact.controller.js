/**
 * ============================================================================
 * COMPANY CONTACT CONTROLLER — Route Handlers for Contact Management
 * ============================================================================
 *   POST  /api/college/add_company_contact/:companyId
 *   GET   /api/college/get_company_contacts/:companyId
 *   PUT   /api/college/update_contact/:contactId
 *   PATCH /api/college/toggle_contact_status/:contactId
 * ============================================================================
 */

const contactService = require('../../services/college/companyContact.service');
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
// 1. ADD CONTACT
// ============================================================================

async function addContact(req, res) {
    try {
        const result = await contactService.addContact(
            req.params.companyId,
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
            resourceId: req.params.companyId,
            summary: `Added contact "${result.contact_name}" to company`,
            newValue: result,
            metadata: { contactId: result.contact_id, entityName: result.contact_name },
            ipAddress: getClientIp(req),
        });

        return sendCreated(res, result, SUCCESS_MESSAGES.CONTACT_ADDED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 2. GET COMPANY CONTACTS
// ============================================================================

async function getCompanyContacts(req, res) {
    try {
        const result = await contactService.getCompanyContacts(
            req.params.companyId,
            req.user.college_id,
            req.validated || {}
        );

        return sendSuccess(res, result, SUCCESS_MESSAGES.CONTACTS_RETRIEVED);
    } catch (err) {
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 3. UPDATE CONTACT
// ============================================================================

async function updateContact(req, res) {
    try {
        const result = await contactService.updateContact(
            req.params.contactId,
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
            resourceId: result.company_id,
            summary: `Updated contact "${result.contact_name}"`,
            newValue: result,
            metadata: { contactId: req.params.contactId, entityName: result.contact_name },
            ipAddress: getClientIp(req),
        });

        return sendSuccess(res, result, SUCCESS_MESSAGES.CONTACT_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
        if (err.status === 409) return sendError(res, err.message, HTTP_STATUS.CONFLICT);
        return sendError(res, ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
}

// ============================================================================
// 4. TOGGLE CONTACT STATUS
// ============================================================================

async function toggleContactStatus(req, res) {
    try {
        const { is_active } = req.validated;

        const result = await contactService.toggleContactStatus(
            req.params.contactId,
            req.user.college_id,
            is_active
        );

        logAudit(query, {
            collegeId: req.user.college_id,
            userId: req.user.id,
            userName: req.user.name,
            userRole: req.user.role,
            action: AUDIT_ACTIONS.STATUS_CHANGE,
            resourceType: AUDIT_RESOURCE_TYPES.COMPANY,
            resourceId: result.company_id,
            summary: `${is_active ? 'Activated' : 'Deactivated'} contact "${result.contact_name}"`,
            newValue: { is_active },
            metadata: { contactId: req.params.contactId, entityName: result.contact_name },
            ipAddress: getClientIp(req),
        });

        const message = is_active
            ? SUCCESS_MESSAGES.CONTACT_ACTIVATED
            : SUCCESS_MESSAGES.CONTACT_DEACTIVATED;

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
    addContact,
    getCompanyContacts,
    updateContact,
    toggleContactStatus,
};
