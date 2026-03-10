/**
 * ============================================================================
 * STUDENT EXPERIENCE ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST   /add_experience                    authenticate + apiLimiter + validate
 *   GET    /get_all_experience                 authenticate
 *   PUT    /update_experience/:experienceId    authenticate + apiLimiter + validate
 *   DELETE /delete_experience/:experienceId    authenticate + apiLimiter
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/experience.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    addExperienceSchema,
    updateExperienceSchema,
    experienceIdParamSchema,
} = require('../../validators/student/experience.validator');

// ============================================================================
// EXPERIENCE ROUTES
// ============================================================================

// Add experience (max 10)
router.post(
    '/add_experience',
    authenticate,
    apiLimiter,
    validate(addExperienceSchema),
    asyncHandler(controller.addExperience)
);

// List own experience
router.get(
    '/get_all_experience',
    authenticate,
    asyncHandler(controller.getAllExperience)
);

// Update experience
router.put(
    '/update_experience/:experienceId',
    authenticate,
    apiLimiter,
    validate(experienceIdParamSchema, 'params'),
    validate(updateExperienceSchema),
    asyncHandler(controller.updateExperience)
);

// Delete experience
router.delete(
    '/delete_experience/:experienceId',
    authenticate,
    apiLimiter,
    validate(experienceIdParamSchema, 'params'),
    asyncHandler(controller.deleteExperience)
);

module.exports = router;
