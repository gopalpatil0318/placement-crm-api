/**
 * ============================================================================
 * STUDENT ACADEMIC INFO ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   PUT  /save_academic_info    authenticate + apiLimiter + validate
 *   GET  /get_academic_info     authenticate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/academic.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    saveAcademicInfoSchema,
} = require('../../validators/student/academic.validator');

// ============================================================================
// ACADEMIC INFO ROUTES
// ============================================================================

// Save academic info (upsert — creates if new, updates if exists)
router.put(
    '/save_academic_info',
    authenticate,
    apiLimiter,
    validate(saveAcademicInfoSchema),
    asyncHandler(controller.saveAcademicInfo)
);

// Get own academic info
router.get(
    '/get_academic_info',
    authenticate,
    asyncHandler(controller.getAcademicInfo)
);

module.exports = router;
