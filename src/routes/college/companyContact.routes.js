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
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');
const { ROLES } = require('../../config/constants');

const {
    addContactSchema,
    listContactsSchema,
    updateContactSchema,
    toggleContactStatusSchema,
} = require('../../validators/college/companyContact.validator');

// All contact routes require COLLEGEADMIN or TPO
router.use(authenticate, requireRole(ROLES.COLLEGEADMIN, ROLES.TPO), apiLimiter);

// ============================================================================
// ROUTES
// ============================================================================

router.post(
    '/add_company_contact/:companyId',
    validate(addContactSchema),
    asyncHandler(controller.addContact)
);

router.get(
    '/get_company_contacts/:companyId',
    validate(listContactsSchema, 'query'),
    asyncHandler(controller.getCompanyContacts)
);

router.put(
    '/update_contact/:contactId',
    validate(updateContactSchema),
    asyncHandler(controller.updateContact)
);

router.patch(
    '/toggle_contact_status/:contactId',
    validate(toggleContactStatusSchema),
    asyncHandler(controller.toggleContactStatus)
);

module.exports = router;
