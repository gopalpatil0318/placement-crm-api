/**
 * ============================================================================
 * STUDENT PERSONAL INFO ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   PUT  /save_personal_info    authenticate + apiLimiter + validate
 *   GET  /get_personal_info     authenticate
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/personal.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    savePersonalInfoSchema,
} = require('../../validators/student/personal.validator');

// ============================================================================
// PERSONAL INFO ROUTES
// ============================================================================

// Save personal info (upsert — creates if new, updates if exists)
router.put(
    '/save_personal_info',
    authenticate,
    apiLimiter,
    validate(savePersonalInfoSchema),
    asyncHandler(controller.savePersonalInfo)
);

// Get own personal info
router.get(
    '/get_personal_info',
    authenticate,
    asyncHandler(controller.getPersonalInfo)
);

module.exports = router;
