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
const sysadminSubscriptionRoutes = require('./sysadmin/subscription.routes');
const sysadminSubmissionRoutes = require('./sysadmin/submissions.routes');

// Route groups — Public (no auth)
const publicSubmissionRoutes = require('./public/submissions.routes');

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
const collegeCompanyTierRoutes = require('./college/companyTier.routes');
const collegePlacementSettingsRoutes = require('./college/placementSettings.routes');
const collegeEligibleDenialRoutes = require('./college/eligibleDenial.routes');
const collegeTrainingRoutes = require('./college/training.routes');
const collegeNotificationRoutes = require('./college/notification.routes');
const collegeFeedbackRoutes = require('./college/feedback.routes');
const collegeSkillRoutes = require('./college/skill.routes');
const collegeDashboardRoutes = require('./college/dashboard.routes');
const collegeVerificationRoutes = require('./college/verification.routes');
const collegeVerificationSettingsRoutes = require('./college/verificationSettings.routes');
const collegeJobOverrideRoutes = require('./college/jobOverride.routes');
const collegeResolveRoutes = require('./college/resolve.routes');
const collegeRoundProcessingRoutes = require('./college/roundProcessing.routes');
const collegeAuditRoutes = require('./college/audit.routes');
const collegePermissionRoutes = require('./college/permission.routes');
const collegeProfileRoutes = require('./college/profile.routes');

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
const studentJobRoutes = require('./student/job.routes');
const studentPlacementRoutes = require('./student/placement.routes');
const studentRestrictionRoutes = require('./student/restriction.routes');
const studentTrainingRoutes = require('./student/training.routes');
const studentNotificationRoutes = require('./student/notification.routes');
const studentFeedbackRoutes = require('./student/feedback.routes');
const studentJobOverrideRoutes = require('./student/jobOverride.routes');
const studentPlacementPolicyRoutes = require('./student/placementPolicy.routes');
const studentSelfReportRoutes = require('./student/selfReport.routes');
const studentCompanySearchRoutes = require('./student/companySearch.routes');
const studentCompanyJobsRoutes = require('./student/companyJobs.routes');
const studentDashboardRoutes = require('./student/dashboard.routes');

// Route groups — Shared Auth
const authRoutes = require('./auth.routes');

// Route groups — Storage
const storageRoutes = require('./storage.routes');

// ============================================================================
// MOUNT ROUTES
// ============================================================================

// Shared auth (token refresh) — no role-specific prefix
router.use('/auth', authRoutes);

// Storage — any authenticated user
router.use('/storage', storageRoutes);

router.use('/sysadmin', sysadminRoutes);
router.use('/sysadmin', sysadminSubscriptionRoutes);
router.use('/sysadmin', sysadminSubmissionRoutes);

// Public routes (no auth required)
router.use('/public', publicSubmissionRoutes);

// PUBLIC college routes FIRST (no auth required) — must be before authenticated routes
router.use('/college', collegeResolveRoutes);

// Authenticated college routes
router.use('/college', collegeProfileRoutes);
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
router.use('/college', collegeCompanyTierRoutes);
router.use('/college', collegePlacementSettingsRoutes);
router.use('/college', collegeEligibleDenialRoutes);
router.use('/college', collegeTrainingRoutes);
router.use('/college', collegeNotificationRoutes);
router.use('/college', collegeFeedbackRoutes);
router.use('/college', collegeSkillRoutes);
router.use('/college', collegeDashboardRoutes);
router.use('/college', collegeVerificationRoutes);
router.use('/college', collegeVerificationSettingsRoutes);
router.use('/college', collegeJobOverrideRoutes);
router.use('/college', collegeRoundProcessingRoutes);
router.use('/college', collegeAuditRoutes);
router.use('/college', collegePermissionRoutes);
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
router.use('/student', studentJobRoutes);
router.use('/student', studentPlacementRoutes);
router.use('/student', studentRestrictionRoutes);
router.use('/student', studentTrainingRoutes);
router.use('/student', studentNotificationRoutes);
router.use('/student', studentFeedbackRoutes);
router.use('/student', studentJobOverrideRoutes);
router.use('/student', studentPlacementPolicyRoutes);
router.use('/student/self-report', studentSelfReportRoutes);
router.use('/student/companies', studentCompanySearchRoutes);
router.use('/student/company-jobs', studentCompanyJobsRoutes);
router.use('/student', studentDashboardRoutes);

module.exports = router;