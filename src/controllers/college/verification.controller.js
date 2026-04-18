/**
 * ============================================================================
 * VERIFICATION CONTROLLER — Route Handlers for Verification APIs
 * ============================================================================
 *   GET   /api/college/get_pending_verification_counts
 *   GET   /api/college/get_pending_profiles
 *   GET   /api/college/get_pending_experiences
 *   GET   /api/college/get_pending_achievements
 *   GET   /api/college/get_pending_certificates
 *   PATCH /api/college/verify_student_profile/:studentId
 *   PATCH /api/college/verify_experience/:experienceId
 *   PATCH /api/college/verify_achievement/:achievementId
 *   PATCH /api/college/verify_certificate/:certificateId
 *   PATCH /api/college/bulk_verify_profiles
 *   PATCH /api/college/bulk_verify_experiences
 *   PATCH /api/college/bulk_verify_achievements
 *   PATCH /api/college/bulk_verify_certificates
 * ============================================================================
 */

const verificationService = require('../../services/college/verification.service');
const { sendSuccess, sendPaginated } = require('../../utils/responseHelper');
const { logAudit, getClientIp } = require('../../utils/auditHelper');
const { query } = require('../../config/db');
const { SUCCESS_MESSAGES, STATUS, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } = require('../../config/constants');

// ============================================================================
// 1. GET PENDING VERIFICATION COUNTS
// ============================================================================

async function getPendingVerificationCounts(req, res) {
    const result = await verificationService.getPendingVerificationCounts(
        req.user.college_id,
        req.validated || {}
    );

    return sendSuccess(res, result, SUCCESS_MESSAGES.FETCHED_SUCCESSFULLY);
}

// ============================================================================
// 2. GET PENDING PROFILES
// ============================================================================

async function getPendingProfiles(req, res) {
    const { students, total, page, limit } = await verificationService.getPendingProfiles(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, students, total, { page, limit }, SUCCESS_MESSAGES.PENDING_PROFILES_RETRIEVED);
}

// ============================================================================
// 3. GET PENDING EXPERIENCES
// ============================================================================

async function getPendingExperiences(req, res) {
    const { experiences, total, page, limit } = await verificationService.getPendingExperiences(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, experiences, total, { page, limit }, SUCCESS_MESSAGES.PENDING_EXPERIENCES_RETRIEVED);
}

// ============================================================================
// 4. GET PENDING ACHIEVEMENTS
// ============================================================================

async function getPendingAchievements(req, res) {
    const { achievements, total, page, limit } = await verificationService.getPendingAchievements(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, achievements, total, { page, limit }, SUCCESS_MESSAGES.PENDING_ACHIEVEMENTS_RETRIEVED);
}

// ============================================================================
// 5. GET PENDING CERTIFICATES
// ============================================================================

async function getPendingCertificates(req, res) {
    const { certificates, total, page, limit } = await verificationService.getPendingCertificates(
        req.user.college_id,
        req.validated
    );

    return sendPaginated(res, certificates, total, { page, limit }, SUCCESS_MESSAGES.PENDING_CERTIFICATES_RETRIEVED);
}

// ============================================================================
// 6. VERIFY STUDENT PROFILE
// ============================================================================

async function verifyStudentProfile(req, res) {
    const { action, rejection_reason } = req.validated;

    const result = await verificationService.verifyStudentProfile(
        req.params.studentId,
        req.user.college_id,
        req.user.id,
        action,
        rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: req.params.studentId,
        summary: `${action === STATUS.VERIFICATION.APPROVED ? 'Approved' : 'Rejected'} student profile verification`,
        newValue: { action, rejection_reason: rejection_reason ?? null },
        ipAddress: getClientIp(req),
    });

    const message = action === STATUS.VERIFICATION.APPROVED
        ? SUCCESS_MESSAGES.STUDENT_PROFILE_APPROVED
        : SUCCESS_MESSAGES.STUDENT_PROFILE_REJECTED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// 7. VERIFY EXPERIENCE
// ============================================================================

async function verifyExperience(req, res) {
    const { action, rejection_reason } = req.validated;

    const result = await verificationService.verifyExperience(
        req.params.experienceId,
        req.user.college_id,
        req.user.id,
        action,
        rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: result.student_id,
        summary: `${action === STATUS.VERIFICATION.APPROVED ? 'Approved' : 'Rejected'} experience verification — ${result.student_first_name} ${result.student_last_name} (${result.company_name}, ${result.position_title})`,
        newValue: { action, rejection_reason: rejection_reason ?? null },
        metadata: { verificationType: 'experience', experienceId: req.params.experienceId },
        ipAddress: getClientIp(req),
    });

    const message = action === STATUS.VERIFICATION.APPROVED
        ? SUCCESS_MESSAGES.VERIFICATION_APPROVED
        : SUCCESS_MESSAGES.VERIFICATION_REJECTED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// 8. VERIFY ACHIEVEMENT
// ============================================================================

async function verifyAchievement(req, res) {
    const { action, rejection_reason } = req.validated;

    const result = await verificationService.verifyAchievement(
        req.params.achievementId,
        req.user.college_id,
        req.user.id,
        action,
        rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: result.student_id,
        summary: `${action === STATUS.VERIFICATION.APPROVED ? 'Approved' : 'Rejected'} achievement verification — ${result.student_first_name} ${result.student_last_name} (${result.achievement_title})`,
        newValue: { action, rejection_reason: rejection_reason ?? null },
        metadata: { verificationType: 'achievement', achievementId: req.params.achievementId },
        ipAddress: getClientIp(req),
    });

    const message = action === STATUS.VERIFICATION.APPROVED
        ? SUCCESS_MESSAGES.VERIFICATION_APPROVED
        : SUCCESS_MESSAGES.VERIFICATION_REJECTED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// 9. VERIFY CERTIFICATE
// ============================================================================

async function verifyCertificate(req, res) {
    const { action, rejection_reason } = req.validated;

    const result = await verificationService.verifyCertificate(
        req.params.certificateId,
        req.user.college_id,
        req.user.id,
        action,
        rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.STATUS_CHANGE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        resourceId: result.student_id,
        summary: `${action === STATUS.VERIFICATION.APPROVED ? 'Approved' : 'Rejected'} certificate verification — ${result.student_first_name} ${result.student_last_name} (${result.certificate_name})`,
        newValue: { action, rejection_reason: rejection_reason ?? null },
        metadata: { verificationType: 'certificate', certificateId: req.params.certificateId },
        ipAddress: getClientIp(req),
    });

    const message = action === STATUS.VERIFICATION.APPROVED
        ? SUCCESS_MESSAGES.VERIFICATION_APPROVED
        : SUCCESS_MESSAGES.VERIFICATION_REJECTED;

    return sendSuccess(res, result, message);
}

// ============================================================================
// 10. BULK VERIFY PROFILES
// ============================================================================

async function bulkVerifyProfiles(req, res) {
    const { ids, action, rejection_reason } = req.validated;

    const result = await verificationService.bulkVerifyProfiles(
        ids, req.user.college_id, req.user.id, action, rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        summary: `Bulk ${action} ${ids.length} student profiles`,
        metadata: { count: ids.length, action, verificationType: 'profile' },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.BULK_VERIFICATION_COMPLETED);
}

// ============================================================================
// 11. BULK VERIFY EXPERIENCES
// ============================================================================

async function bulkVerifyExperiences(req, res) {
    const { ids, action, rejection_reason } = req.validated;

    const result = await verificationService.bulkVerifyExperiences(
        ids, req.user.college_id, req.user.id, action, rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        summary: `Bulk ${action} ${ids.length} experiences`,
        metadata: { count: ids.length, action, verificationType: 'experience' },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.BULK_VERIFICATION_COMPLETED);
}

// ============================================================================
// 12. BULK VERIFY ACHIEVEMENTS
// ============================================================================

async function bulkVerifyAchievements(req, res) {
    const { ids, action, rejection_reason } = req.validated;

    const result = await verificationService.bulkVerifyAchievements(
        ids, req.user.college_id, req.user.id, action, rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        summary: `Bulk ${action} ${ids.length} achievements`,
        metadata: { count: ids.length, action, verificationType: 'achievement' },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.BULK_VERIFICATION_COMPLETED);
}

// ============================================================================
// 13. BULK VERIFY CERTIFICATES
// ============================================================================

async function bulkVerifyCertificates(req, res) {
    const { ids, action, rejection_reason } = req.validated;

    const result = await verificationService.bulkVerifyCertificates(
        ids, req.user.college_id, req.user.id, action, rejection_reason
    );

    logAudit(query, {
        collegeId: req.user.college_id,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: AUDIT_ACTIONS.BULK_UPDATE,
        resourceType: AUDIT_RESOURCE_TYPES.STUDENT,
        summary: `Bulk ${action} ${ids.length} certificates`,
        metadata: { count: ids.length, action, verificationType: 'certificate' },
        ipAddress: getClientIp(req),
    });

    return sendSuccess(res, result, SUCCESS_MESSAGES.BULK_VERIFICATION_COMPLETED);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    getPendingVerificationCounts,
    getPendingProfiles,
    getPendingExperiences,
    getPendingAchievements,
    getPendingCertificates,
    verifyStudentProfile,
    verifyExperience,
    verifyAchievement,
    verifyCertificate,
    bulkVerifyProfiles,
    bulkVerifyExperiences,
    bulkVerifyAchievements,
    bulkVerifyCertificates,
};
