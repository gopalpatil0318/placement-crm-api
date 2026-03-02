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
const {
    SUCCESS_MESSAGES,
    ERROR_MESSAGES,
    HTTP_STATUS,
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

        return sendSuccess(res, result, 'Company contacts retrieved successfully');
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

        return sendSuccess(res, result, SUCCESS_MESSAGES.CONTACT_UPDATED);
    } catch (err) {
        if (err.status === 400) return sendError(res, err.message, HTTP_STATUS.BAD_REQUEST);
        if (err.status === 404) return sendError(res, err.message, HTTP_STATUS.NOT_FOUND);
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

        const message = is_active
            ? 'Contact activated successfully'
            : 'Contact deactivated successfully';

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
