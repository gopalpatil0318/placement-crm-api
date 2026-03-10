/**
 * ============================================================================
 * STUDENT PROJECT ROUTES — CRUD Endpoints
 * ============================================================================
 * Base path: /api/student (mounted in routes/index.js)
 *
 * Endpoints:
 *   POST   /add_project                authenticate + apiLimiter + validate
 *   GET    /get_all_projects            authenticate
 *   PUT    /update_project/:projectId   authenticate + apiLimiter + validate
 *   DELETE /delete_project/:projectId   authenticate + apiLimiter
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/student/project.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    addProjectSchema,
    updateProjectSchema,
    projectIdParamSchema,
} = require('../../validators/student/project.validator');

// ============================================================================
// PROJECT ROUTES
// ============================================================================

// Add a project (max 10)
router.post(
    '/add_project',
    authenticate,
    apiLimiter,
    validate(addProjectSchema),
    asyncHandler(controller.addProject)
);

// List own projects
router.get(
    '/get_all_projects',
    authenticate,
    asyncHandler(controller.getAllProjects)
);

// Update a project
router.put(
    '/update_project/:projectId',
    authenticate,
    apiLimiter,
    validate(projectIdParamSchema, 'params'),
    validate(updateProjectSchema),
    asyncHandler(controller.updateProject)
);

// Delete a project
router.delete(
    '/delete_project/:projectId',
    authenticate,
    apiLimiter,
    validate(projectIdParamSchema, 'params'),
    asyncHandler(controller.deleteProject)
);

module.exports = router;
