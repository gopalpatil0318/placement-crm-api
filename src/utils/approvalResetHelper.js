/**
 * ============================================================================
 * APPROVAL RESET HELPER — Conditional profile approval reset
 * ============================================================================
 * Shared by all student profile-section services. Checks verification settings
 * before resetting profile_approval_status on student edits.
 *
 * KEY BEHAVIOR:
 *   - ITEM sections (experience, achievements, certificates):
 *     Item-level reset already happens in the service. Profile stays approved.
 *   - PROFILE sections (personal_info, academic_info, semester_grades):
 *     No item-level columns exist, so this helper resets profile approval.
 *
 * Usage:
 *   const { maybeResetApproval } = require('../../utils/approvalResetHelper');
 *   await maybeResetApproval(client, studentId, collegeId, 'experience');
 * ============================================================================
 */

const { getVerificationSettings } = require('../services/college/verificationSettings.service');
const logger = require('../config/logger');

// Sections that have their own verification_status column on the item table.
// For these, the service already resets the item — do NOT also reset the profile.
const ITEM_SECTIONS = new Set(['experience', 'achievements', 'certificates']);

const RESET_SQL = `UPDATE students
     SET profile_approval_status = 'pending', profile_is_approved = false,
         approved_by = NULL, approved_at = NULL,
         profile_rejection_reason = NULL, rejected_at = NULL,
         updated_at = NOW()
     WHERE student_id = $1 AND college_id = $2
       AND profile_approval_status != 'pending'`;

/**
 * Conditionally reset profile approval status based on verification settings.
 *
 * @param {object} dbClient — pg Client (inside transaction) or query function
 * @param {string} studentId
 * @param {string} collegeId
 * @param {string} sectionKey — key in re_verify_on_edit (e.g. 'experience', 'personal_info')
 */
async function maybeResetApproval(dbClient, studentId, collegeId, sectionKey) {
    // Item sections (experience/achievements/certificates): item-level reset
    // is handled by the service. Skip profile-level reset — profile stays approved.
    if (ITEM_SECTIONS.has(sectionKey)) {
        return;
    }

    // Profile sections (personal_info, academic_info, semester_grades):
    // check re_verify_on_edit setting before resetting profile approval.
    try {
        const settings = await getVerificationSettings(collegeId);
        if (!settings?.re_verify_on_edit?.[sectionKey]) {
            return; // Setting says skip reset
        }
    } catch (err) {
        // Fail-safe: do NOT reset approval if settings are unreachable
        logger.warn('Failed to fetch verification settings, skipping reset (fail-safe)', {
            collegeId, sectionKey, error: err.message,
        });
        return;
    }

    await dbClient.query(RESET_SQL, [studentId, collegeId]);
}

module.exports = { maybeResetApproval };
