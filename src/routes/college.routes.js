/**
 * ============================================================================
 * COLLEGE ROUTES - SYSADMIN & COLLEGE ADMIN
 * ============================================================================
 *
 * SYSADMIN ROUTES
 * - POST /api/sysadmin/create-college
 * - GET  /api/sysadmin/colleges
 * - GET  /api/sysadmin/colleges/:collegeId
 * - PUT  /api/sysadmin/update-college/:collegeId
 * - PUT  /api/sysadmin/colleges/:collegeId/features
 *
 * COLLEGE ADMIN ROUTES
 * - PUT  /api/admin/colleges/forgot-password
 * ============================================================================
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
// SYSADMIN: Create College
// POST /api/sysadmin/create-college
// ============================================================================
// POST /api/systemadmin/create-college
router.post(
  '/create-college',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(createCollegeSchema),
  collegeController.createCollege
);

// ============================================================================
// SYSADMIN: List Colleges
// GET /api/sysadmin/colleges
// ============================================================================
router.get(
  '/colleges',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(listCollegeSchema),
  collegeController.listColleges
);

// ============================================================================
// SYSADMIN: Get College by ID
// GET /api/sysadmin/colleges/:collegeId
// ============================================================================
router.get(
  '/colleges/:collegeId',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  collegeController.getCollege
);

// ============================================================================
// SYSADMIN: Update College
// PUT /api/sysadmin/update-college/:collegeId
// ============================================================================
router.put(
  '/update-college/:collegeId',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(updateCollegeSchema),
  collegeController.updateCollege
);

// ============================================================================
// SYSADMIN: Update College Features
// PUT /api/sysadmin/colleges/:collegeId/features
// ============================================================================
router.put(
  '/colleges/:collegeId/features',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(updateCollegeFeaturesSchema),
  collegeController.updateCollegeFeatures
);

// ============================================================================
// COLLEGE ADMIN: Forgot Password
// PUT /api/admin/colleges/forgot-password
// ============================================================================
router.put(
  '/colleges/forgot-password',
  authMiddleware,
  requireRole(ROLES.SYSADMIN),
  apiLimiter,
  validate(forgotPasswordSchema),
  collegeController.forgotCollegeAdminPassword
);

module.exports = router;
