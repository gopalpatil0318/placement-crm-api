/**
 * ============================================================================
 * COMPANY CONTACT ROUTES — Contact Management Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate + requireRole(COLLEGEADMIN, TPO)
 *
 *   POST  /add_company_contact/:companyId       Add contact + validate
 *   GET   /get_company_contacts/:companyId      List contacts + validate(query)
 *   PUT   /update_contact/:contactId            Update + validate
 *   PATCH /toggle_contact_status/:contactId     Toggle status + validate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/companyContact.controller');
const { authenticate, requirePermission } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { PERMISSIONS } = require('../../config/constants');

const {
    addContactSchema,
    listContactsSchema,
    updateContactSchema,
    toggleContactStatusSchema,
    companyIdParamSchema,
    contactIdParamSchema,
} = require('../../validators/college/companyContact.validator');

// All contact routes require authentication
router.use(authenticate, apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_company_contact/:companyId',
    requirePermission(PERMISSIONS.COMPANIES_CREATE),
    validate(companyIdParamSchema, 'params'),
    validate(addContactSchema),
    asyncHandler(controller.addContact)
);

router.get(
    '/get_company_contacts/:companyId',
    requirePermission(PERMISSIONS.COMPANIES_VIEW),
    validate(companyIdParamSchema, 'params'),
    validate(listContactsSchema, 'query'),
    asyncHandler(controller.getCompanyContacts)
);

router.put(
    '/update_contact/:contactId',
    requirePermission(PERMISSIONS.COMPANIES_UPDATE),
    validate(contactIdParamSchema, 'params'),
    validate(updateContactSchema),
    asyncHandler(controller.updateContact)
);

router.patch(
    '/toggle_contact_status/:contactId',
    requirePermission(PERMISSIONS.COMPANIES_UPDATE),
    validate(contactIdParamSchema, 'params'),
    validate(toggleContactStatusSchema),
    asyncHandler(controller.toggleContactStatus)
);

module.exports = router;
