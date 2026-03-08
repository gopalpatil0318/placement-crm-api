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
const collegeRestrictionRoutes = require('./college/restriction.routes');
const collegeCompanyRoutes = require('./college/company.routes');
const collegeCompanyContactRoutes = require('./college/companyContact.routes');
const collegeJobRoutes = require('./college/job.routes');
const collegeJobPositionRoutes = require('./college/jobPosition.routes');
const collegeJobCriteriaRoutes = require('./college/jobCriteria.routes');
const collegeJobRoundRoutes = require('./college/jobRound.routes');
const collegeJobQuestionRoutes = require('./college/jobQuestion.routes');
const collegeApplicationRoutes = require('./college/application.routes');
const collegeRoundResultRoutes = require('./college/roundResult.routes');
const collegePlacementRoutes = require('./college/placement.routes');
const collegePlacementPolicyRoutes = require('./college/placementPolicy.routes');
const collegeEligibleDenialRoutes = require('./college/eligibleDenial.routes');

// Route groups — Student
const studentAuthRoutes = require('./student/auth.routes');
const studentProfileRoutes = require('./student/profile.routes');
const studentPersonalRoutes = require('./student/personal.routes');
const studentAcademicRoutes = require('./student/academic.routes');
const studentSemesterRoutes = require('./student/semester.routes');
const studentSkillRoutes = require('./student/skill.routes');
const studentProjectRoutes = require('./student/project.routes');
const studentExperienceRoutes = require('./student/experience.routes');
const studentAchievementRoutes = require('./student/achievement.routes');
const studentCertificateRoutes = require('./student/certificate.routes');
const studentActivityRoutes = require('./student/activity.routes');
const studentProfileLinksRoutes = require('./student/profileLinks.routes');

// ============================================================================
// MOUNT ROUTES
// ============================================================================

router.use('/sysadmin', sysadminRoutes);
router.use('/college', collegeUserRoutes);
router.use('/college', collegeDepartmentRoutes);
router.use('/college', collegeStudentRoutes);
router.use('/college', collegeRestrictionRoutes);
router.use('/college', collegeCompanyRoutes);
router.use('/college', collegeCompanyContactRoutes);
router.use('/college', collegeJobRoutes);
router.use('/college', collegeJobPositionRoutes);
router.use('/college', collegeJobCriteriaRoutes);
router.use('/college', collegeJobRoundRoutes);
router.use('/college', collegeJobQuestionRoutes);
router.use('/college', collegeApplicationRoutes);
router.use('/college', collegeRoundResultRoutes);
router.use('/college', collegePlacementRoutes);
router.use('/college', collegePlacementPolicyRoutes);
router.use('/college', collegeEligibleDenialRoutes);
router.use('/student', studentAuthRoutes);
router.use('/student', studentProfileRoutes);
router.use('/student', studentPersonalRoutes);
router.use('/student', studentAcademicRoutes);
router.use('/student', studentSemesterRoutes);
router.use('/student', studentSkillRoutes);
router.use('/student', studentProjectRoutes);
router.use('/student', studentExperienceRoutes);
router.use('/student', studentAchievementRoutes);
router.use('/student', studentCertificateRoutes);
router.use('/student', studentActivityRoutes);
router.use('/student', studentProfileLinksRoutes);

module.exports = router;