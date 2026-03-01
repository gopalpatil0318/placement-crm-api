/**
 * ============================================================================
 * STUDENT CERTIFICATE ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST   /add_certificate                      authenticate + apiLimiter + validate
 *   GET    /get_all_certificates                  authenticate
 *   PUT    /update_certificate/:certificateId     authenticate + apiLimiter + validate
 *   DELETE /delete_certificate/:certificateId     authenticate + apiLimiter
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/certificate.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    addCertificateSchema,
    updateCertificateSchema,
} = require('../../validators/student/certificate.validator');

// ============================================================================
// CERTIFICATE ROUTES
// ============================================================================

// Add certificate (max 15)
router.post(
    '/add_certificate',
    authenticate,
    apiLimiter,
    validate(addCertificateSchema),
    asyncHandler(controller.addCertificate)
);

// List own certificates
router.get(
    '/get_all_certificates',
    authenticate,
    asyncHandler(controller.getAllCertificates)
);

// Update certificate
router.put(
    '/update_certificate/:certificateId',
    authenticate,
    apiLimiter,
    validate(updateCertificateSchema),
    asyncHandler(controller.updateCertificate)
);

// Delete certificate
router.delete(
    '/delete_certificate/:certificateId',
    authenticate,
    apiLimiter,
    asyncHandler(controller.deleteCertificate)
);

module.exports = router;
