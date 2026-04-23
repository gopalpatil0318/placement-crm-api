/**
 * ============================================================================
 * SYSADMIN SUBMISSION ROUTES — Express Router for Lead Management APIs
 * ============================================================================
 * Base path: /api/sysadmin
 *
 * #   Method   Endpoint                                Middleware
 * 1   GET      /demo-requests                          sysadminAuth + validate(query)
 * 2   GET      /demo-requests/:id                      sysadminAuth + validate(params)
 * 3   PATCH    /demo-requests/:id/status               sysadminAuth + validate
 * 4   POST     /demo-requests/:id/notes                sysadminAuth + validate
 * 5   GET      /contact-inquiries                      sysadminAuth + validate(query)
 * 6   GET      /contact-inquiries/:id                  sysadminAuth + validate(params)
 * 7   PATCH    /contact-inquiries/:id/status           sysadminAuth + validate
 * 8   POST     /contact-inquiries/:id/notes            sysadminAuth + validate
 * 9   GET      /submissions/stats                      sysadminAuth
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/public/submissions.controller');
const { authenticate, requireRole } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { ROLES } = require('../../config/constants');

const {
    listDemoRequestsSchema,
    listContactInquiriesSchema,
    updateDemoStatusSchema,
    updateContactStatusSchema,
    addNoteSchema,
    submissionIdParamSchema,
} = require('../../validators/public/submissions.validator');

// Shorthand: sysadmin-only middleware chain
const sysadminAuth = [authenticate, requireRole(ROLES.SYSADMIN)];

// ============================================================================
// DEMO REQUESTS
// ============================================================================

router.get(
    '/demo-requests',
    ...sysadminAuth,
    validate(listDemoRequestsSchema, 'query'),
    asyncHandler(controller.listDemoRequests)
);

router.get(
    '/demo-requests/:id',
    ...sysadminAuth,
    validate(submissionIdParamSchema, 'params'),
    asyncHandler(controller.getDemoRequest)
);

router.patch(
    '/demo-requests/:id/status',
    ...sysadminAuth,
    validate(submissionIdParamSchema, 'params'),
    validate(updateDemoStatusSchema),
    asyncHandler(controller.updateDemoRequestStatus)
);

router.post(
    '/demo-requests/:id/notes',
    ...sysadminAuth,
    validate(submissionIdParamSchema, 'params'),
    validate(addNoteSchema),
    asyncHandler(controller.addDemoRequestNote)
);

// ============================================================================
// CONTACT INQUIRIES
// ============================================================================

router.get(
    '/contact-inquiries',
    ...sysadminAuth,
    validate(listContactInquiriesSchema, 'query'),
    asyncHandler(controller.listContactInquiries)
);

router.get(
    '/contact-inquiries/:id',
    ...sysadminAuth,
    validate(submissionIdParamSchema, 'params'),
    asyncHandler(controller.getContactInquiry)
);

router.patch(
    '/contact-inquiries/:id/status',
    ...sysadminAuth,
    validate(submissionIdParamSchema, 'params'),
    validate(updateContactStatusSchema),
    asyncHandler(controller.updateContactInquiryStatus)
);

router.post(
    '/contact-inquiries/:id/notes',
    ...sysadminAuth,
    validate(submissionIdParamSchema, 'params'),
    validate(addNoteSchema),
    asyncHandler(controller.addContactInquiryNote)
);

// ============================================================================
// STATS
// ============================================================================

router.get(
    '/submissions/stats',
    ...sysadminAuth,
    asyncHandler(controller.getSubmissionStats)
);

module.exports = router;
