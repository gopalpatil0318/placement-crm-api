/**
 * ============================================================================
 * VERIFICATION SETTINGS VALIDATOR — Joi Schema
 * ============================================================================
 *   - updateVerificationSettingsSchema  PATCH /update_verification_settings
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// UPDATE VERIFICATION SETTINGS SCHEMA
// ============================================================================

const updateVerificationSettingsSchema = Joi.object({
    require_profile_approval_for_jobs: Joi.boolean(),
    auto_approve_profile_on_complete: Joi.boolean(),
    bypass: Joi.object({
        profiles:     Joi.boolean(),
        experience:   Joi.boolean(),
        achievements: Joi.boolean(),
        certificates: Joi.boolean(),
    }),
    re_verify_on_edit: Joi.object({
        personal_info:   Joi.boolean(),
        academic_info:   Joi.boolean(),
        semester_grades: Joi.boolean(),
        experience:      Joi.boolean(),
        achievements:    Joi.boolean(),
        certificates:    Joi.boolean(),
    }),
}).min(1).options({ allowUnknown: false }).messages({
    'object.min': 'At least one setting must be provided',
    'object.unknown': 'Unknown field: {#label}',
});

module.exports = {
    updateVerificationSettingsSchema,
};
