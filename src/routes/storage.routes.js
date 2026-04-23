/**
 * ============================================================================
 * STORAGE ROUTES — File Upload URL Generation
 * ============================================================================
 * Base path: /api/storage (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST /upload-url   authenticate + apiLimiter + validate → signed upload URL
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../controllers/storage.controller');
const { authenticate } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateRequest');
const asyncHandler = require('../utils/asyncHandler');
const { apiLimiter } = require('../config/rateLimiter');
const { uploadUrlSchema, downloadUrlSchema } = require('../validators/storage.validator');

// ============================================================================
// STORAGE ROUTES
// ============================================================================

// Generate a signed upload URL — any authenticated user
router.post(
  '/upload-url',
  authenticate,
  apiLimiter,
  validate(uploadUrlSchema),
  asyncHandler(controller.generateUploadUrl)
);

// Generate a signed download URL — any authenticated user (private files)
router.post(
  '/download-url',
  authenticate,
  apiLimiter,
  validate(downloadUrlSchema),
  asyncHandler(controller.generateDownloadUrl)
);

module.exports = router;
