/**
 * ============================================================================
 * ROUTES INDEX - API Routes (SIMPLIFIED)
 * ============================================================================
 * Single Database Architecture
 * - No multi-tenant/tenant routes
 * - Only college, auth, students, users routes
 */

const express = require('express');
const authRoutes = require('./auth.routes');
const collegeRoutes = require('./college.routes');
const studentRoutes = require('./student.routes');
const userRoutes = require('./user.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/sysadmin', collegeRoutes);
router.use('/students', studentRoutes);
router.use('/users', userRoutes);

module.exports = router;