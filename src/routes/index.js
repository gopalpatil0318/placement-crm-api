/**
 * ============================================================================
 * ROUTES INDEX — Central Route Registration
 * ============================================================================
 * All routes are separated by user type:
 *   /api/sysadmin/*   → System admin operations
 *   /api/college/*    → College admin/TPO/HOD operations
 *   /api/student/*    → Student operations                (future)
 *   /api/auth/*       → Shared auth (verify, logout)      (future)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

// Route groups
const sysadminRoutes = require('./sysadmin/sysadmin.routes');
const collegeUserRoutes = require('./college/user.routes');
const collegeDepartmentRoutes = require('./college/department.routes');

// ============================================================================
// MOUNT ROUTES
// ============================================================================

router.use('/sysadmin', sysadminRoutes);
router.use('/college', collegeUserRoutes);
router.use('/college', collegeDepartmentRoutes);
// router.use('/auth', authRoutes);

module.exports = router;