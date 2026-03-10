/**
 * ============================================================================
 * VERIFICATION ROUTES — Student Data Verification Endpoints
 * ============================================================================
 * Base path: /api/college
 * All routes require: authenticate (any college user role)
 *
 *   GET   /get_pending_verification_counts
 *   GET   /get_pending_profiles
 *   GET   /get_pending_experiences
 *   GET   /get_pending_achievements
 *   GET   /get_pending_certificates
 *   PATCH /verify_student_profile/:studentId
 *   PATCH /verify_experience/:experienceId
 *   PATCH /verify_achievement/:achievementId
 *   PATCH /verify_certificate/:certificateId
 *   PATCH /bulk_verify_profiles
 *   PATCH /bulk_verify_experiences
 *   PATCH /bulk_verify_achievements
 *   PATCH /bulk_verify_certificates
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

const controller = require('../../controllers/college/verification.controller');
const { authenticate } = require('../../middleware/authMiddleware');
const validate = require('../../middleware/validateRequest');
const asyncHandler = require('../../utils/asyncHandler');
const { apiLimiter } = require('../../config/rateLimiter');

const {
    pendingListSchema,
    verifyActionSchema,
    bulkVerifySchema,
    studentIdParamSchema,
    experienceIdParamSchema,
    achievementIdParamSchema,
    certificateIdParamSchema,
} = require('../../validators/college/verification.validator');

// Any college user can verify (collegeadmin, tpo, hod, teacher)
router.use(authenticate, apiLimiter);

// ============================================================================
// DASHBOARD
// ============================================================================

router.get(
    '/get_pending_verification_counts',
    asyncHandler(controller.getPendingVerificationCounts)
);

// ============================================================================
// PENDING LISTS
// ============================================================================

router.get(
    '/get_pending_profiles',
    validate(pendingListSchema, 'query'),
    asyncHandler(controller.getPendingProfiles)
);

router.get(
    '/get_pending_experiences',
    validate(pendingListSchema, 'query'),
    asyncHandler(controller.getPendingExperiences)
);

router.get(
    '/get_pending_achievements',
    validate(pendingListSchema, 'query'),
    asyncHandler(controller.getPendingAchievements)
);

router.get(
    '/get_pending_certificates',
    validate(pendingListSchema, 'query'),
    asyncHandler(controller.getPendingCertificates)
);

// ============================================================================
// SINGLE VERIFY
// ============================================================================

router.patch(
    '/verify_student_profile/:studentId',
    validate(studentIdParamSchema, 'params'),
    validate(verifyActionSchema),
    asyncHandler(controller.verifyStudentProfile)
);

router.patch(
    '/verify_experience/:experienceId',
    validate(experienceIdParamSchema, 'params'),
    validate(verifyActionSchema),
    asyncHandler(controller.verifyExperience)
);

router.patch(
    '/verify_achievement/:achievementId',
    validate(achievementIdParamSchema, 'params'),
    validate(verifyActionSchema),
    asyncHandler(controller.verifyAchievement)
);

router.patch(
    '/verify_certificate/:certificateId',
    validate(certificateIdParamSchema, 'params'),
    validate(verifyActionSchema),
    asyncHandler(controller.verifyCertificate)
);

// ============================================================================
// BULK VERIFY
// ============================================================================

router.patch(
    '/bulk_verify_profiles',
    validate(bulkVerifySchema),
    asyncHandler(controller.bulkVerifyProfiles)
);

router.patch(
    '/bulk_verify_experiences',
    validate(bulkVerifySchema),
    asyncHandler(controller.bulkVerifyExperiences)
);

router.patch(
    '/bulk_verify_achievements',
    validate(bulkVerifySchema),
    asyncHandler(controller.bulkVerifyAchievements)
);

router.patch(
    '/bulk_verify_certificates',
    validate(bulkVerifySchema),
    asyncHandler(controller.bulkVerifyCertificates)
);

module.exports = router;
