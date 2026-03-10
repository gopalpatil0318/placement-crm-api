/**
 * ============================================================================
 * STUDENT AUTH VALIDATORS — Joi Schemas for Student Authentication
 * ============================================================================
 * Schemas:
 *   - studentLoginSchema           POST /api/student/login
 *   - studentForgotPasswordSchema  POST /api/student/forgot_password
 *   - studentChangePasswordSchema  POST /api/student/change_password
 * ============================================================================
 */

const Joi = require('joi');
const { VALIDATION } = require('../../config/constants');

// ============================================================================
// LOGIN
// ============================================================================

const studentLoginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),

    password: Joi.string()
        .required()
        .messages({
            'string.empty': 'Password is required',
            'any.required': 'Password is required',
        }),
});

// ============================================================================
// FORGOT PASSWORD
// ============================================================================

const studentForgotPasswordSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),
});

// ============================================================================
// CHANGE PASSWORD
// ============================================================================

const studentChangePasswordSchema = Joi.object({
    current_password: Joi.string()
        .required()
        .messages({
            'string.empty': 'Current password is required',
            'any.required': 'Current password is required',
        }),

    new_password: Joi.string()
        .min(VALIDATION.PASSWORD_MIN_LENGTH)
        .max(VALIDATION.PASSWORD_MAX_LENGTH)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.empty': 'New password is required',
            'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
            'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
            'string.pattern.base': 'Password must contain uppercase, lowercase, and numeric characters',
            'any.required': 'New password is required',
        }),

    confirm_password: Joi.string()
        .valid(Joi.ref('new_password'))
        .required()
        .messages({
            'any.only': 'Passwords do not match',
            'string.empty': 'Please confirm your new password',
            'any.required': 'Please confirm your new password',
        }),
});

// ============================================================================
// RESET PASSWORD
// ============================================================================

const studentResetPasswordSchema = Joi.object({
    token: Joi.string()
        .required()
        .messages({
            'string.empty': 'Reset token is required',
            'any.required': 'Reset token is required',
        }),

    new_password: Joi.string()
        .min(VALIDATION.PASSWORD_MIN_LENGTH)
        .max(VALIDATION.PASSWORD_MAX_LENGTH)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.empty': 'New password is required',
            'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
            'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
            'string.pattern.base': 'Password must contain uppercase, lowercase, and numeric characters',
            'any.required': 'New password is required',
        }),

    confirm_password: Joi.string()
        .valid(Joi.ref('new_password'))
        .required()
        .messages({
            'any.only': 'Passwords do not match',
            'any.required': 'Please confirm your new password',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    studentLoginSchema,
    studentForgotPasswordSchema,
    studentChangePasswordSchema,
    studentResetPasswordSchema,
};
