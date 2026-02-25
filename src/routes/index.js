/**
 * ============================================================================
 * ROUTES INDEX — Central Route Registration
 * ============================================================================
 * All routes are separated by user type:
 *   /api/sysadmin/*   → System admin operations
 *   /api/college/*    → College admin/TPO/HOD operations
 *   /api/student/*    → Student operations
 *   /api/auth/*       → Shared auth (verify, logout)      (future)
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

// Route groups — Sysadmin
const sysadminRoutes = require('./sysadmin/sysadmin.routes');

// Route groups — College
const collegeUserRoutes = require('./college/user.routes');
const collegeDepartmentRoutes = require('./college/department.routes');
const collegeStudentRoutes = require('./college/student.routes');

// Route groups — Student
const studentAuthRoutes = require('./student/auth.routes');

// ============================================================================
// MOUNT ROUTES
// ============================================================================

router.use('/sysadmin', sysadminRoutes);
router.use('/college', collegeUserRoutes);
router.use('/college', collegeDepartmentRoutes);
router.use('/college', collegeStudentRoutes);
router.use('/student', studentAuthRoutes);

module.exports = router;