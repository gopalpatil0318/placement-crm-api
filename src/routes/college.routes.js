/**
 * ============================================================================
 * COLLEGE ROUTES - College Management
 * ============================================================================
 * Single Database Architecture
 * - POST /colleges - Create college (sysadmin only)
 * - GET /colleges - List colleges (sysadmin only)
 * - GET /colleges/:collegeId - Get single college (sysadmin only)
 * - PUT /colleges/:collegeId - Update college (sysadmin only)
 * - PUT /colleges/:collegeId/features - Update college features (sysadmin only)
 */

const express = require('express');
const router = express.Router();

const collegeController = require('../controllers/collegeController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const validate = require('../middleware/validateRequest');
const { apiLimiter } = require('../config/rateLimiter');
const {
  createCollegeSchema,
  updateCollegeSchema,
  updateCollegeFeaturesSchema,
  listCollegeSchema,
  forgotPasswordSchema
} = require('../validators/collegeValidators');
const { ROLES } = require('../config/constants');

// ============================================================================
// POST /api/v1/colleges
// Create new college (sysadmin only)
// Sets enabled_features to ["core"] by default
// ============================================================================
router.post(
  '/',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(createCollegeSchema),
  collegeController.createCollege
);

// ============================================================================
// GET /api/v1/colleges
// List all colleges with pagination (sysadmin only)
// ============================================================================
router.get(
  '/',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(listCollegeSchema),
  collegeController.listColleges
);

//forget password route
router.put(
  '/admin/forgot-password',
  authMiddleware,
  requireRole(ROLES.ADMIN),
  apiLimiter,
  validate(forgotPasswordSchema),
  collegeController.forgotCollegeAdminPassword
)

// ============================================================================
// GET /api/v1/colleges/:collegeId
// Get single college by ID (sysadmin only)
// ============================================================================
router.get(
  '/:collegeId',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  collegeController.getCollege
);

// ============================================================================
// PUT /api/v1/colleges/:collegeId
// Update college (name, subdomain, status) (sysadmin only)
// ============================================================================
router.put(
  '/:collegeId',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(updateCollegeSchema),
  collegeController.updateCollege
);

// ============================================================================
// PUT /api/v1/colleges/:collegeId/features
// Update college enabled features (sysadmin only)
// Core feature cannot be removed
// ============================================================================
router.put(
  '/:collegeId/features',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(updateCollegeFeaturesSchema),
  collegeController.updateCollegeFeatures
);

module.exports = router;