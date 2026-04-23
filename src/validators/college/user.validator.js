/**
 * ============================================================================
 * COLLEGE USER VALIDATORS — Joi Schemas for Auth, Password & User Management
 * ============================================================================
 * Auth schemas:
 *   - collegeLoginSchema        POST /api/college/login
 *   - forgotPasswordSchema      POST /api/college/forgot_password
 *   - changePasswordSchema      POST /api/college/change_password
 *
 * Management schemas (COLLEGEADMIN only):
 *   - createUserSchema          POST /api/college/create_user
 *   - updateUserSchema          PUT  /api/college/update_user/:userId
 *   - listUsersSchema           GET  /api/college/get_all_users
 *   - toggleUserStatusSchema    PATCH /api/college/toggle_user_status/:userId
 * ============================================================================
 */

const Joi = require('joi');
const { VALIDATION, ROLES, STATUS } = require('../../config/constants');

// Valid roles that a college admin can assign
const ASSIGNABLE_ROLES = [ROLES.TPO, ROLES.TPC, ROLES.HOD, ROLES.TEACHER];

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

const collegeLoginSchema = Joi.object({
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

const forgotPasswordSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),
});

const changePasswordSchema = Joi.object({
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

const resetPasswordSchema = Joi.object({
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
// USER MANAGEMENT SCHEMAS (COLLEGEADMIN only)
// ============================================================================

/**
 * Create user — all fields required
 */
const createUserSchema = Joi.object({
    user_name: Joi.string()
        .min(VALIDATION.STRING_MIN_LENGTH)
        .max(100)
        .required()
        .messages({
            'string.empty': 'User name is required',
            'string.min': `Minimum ${VALIDATION.STRING_MIN_LENGTH} characters`,
            'string.max': 'User name cannot exceed 100 characters',
            'any.required': 'User name is required',
        }),

    user_email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'User email is required',
            'string.email': 'Invalid email format',
            'any.required': 'User email is required',
        }),

    user_password: Joi.string()
        .min(VALIDATION.PASSWORD_MIN_LENGTH)
        .max(VALIDATION.PASSWORD_MAX_LENGTH)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.empty': 'Password is required',
            'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
            'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
            'string.pattern.base': 'Password must contain uppercase, lowercase, and numeric characters',
            'any.required': 'Password is required',
        }),

    user_role: Joi.string()
        .valid(...ASSIGNABLE_ROLES)
        .required()
        .messages({
            'any.only': `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
            'any.required': 'User role is required',
        }),

    dept_id: Joi.string()
        .uuid()
        .when('user_role', {
            is: Joi.valid(ROLES.HOD, ROLES.TEACHER),
            then: Joi.required().messages({
                'any.required': 'Department is required for HOD and Teacher roles',
            }),
            otherwise: Joi.optional().allow(null),
        })
        .messages({
            'string.guid': 'Invalid department ID format',
        }),
});

/**
 * Update user — at least one field must be provided
 */
const updateUserSchema = Joi.object({
    user_name: Joi.string()
        .min(VALIDATION.STRING_MIN_LENGTH)
        .max(100)
        .optional()
        .messages({
            'string.min': `Minimum ${VALIDATION.STRING_MIN_LENGTH} characters`,
            'string.max': 'User name cannot exceed 100 characters',
        }),

    user_email: Joi.string()
        .email()
        .optional()
        .messages({
            'string.email': 'Invalid email format',
        }),

    user_role: Joi.string()
        .valid(...ASSIGNABLE_ROLES)
        .optional()
        .messages({
            'any.only': `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
        }),

    dept_id: Joi.string()
        .uuid()
        .optional()
        .allow(null)
        .when('user_role', {
            is: Joi.valid(ROLES.HOD, ROLES.TEACHER),
            then: Joi.required().messages({
                'any.required': 'Department is required for HOD and Teacher roles',
            }),
        })
        .messages({
            'string.guid': 'Invalid department ID format',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

/**
 * List users — query params for filtering and pagination
 */
const listUsersSchema = Joi.object({
    page: Joi.number()
        .positive()
        .optional()
        .default(1)
        .messages({ 'number.positive': 'Page must be a positive number' }),

    limit: Joi.number()
        .positive()
        .max(100)
        .optional()
        .default(20)
        .messages({
            'number.positive': 'Limit must be a positive number',
            'number.max': 'Limit cannot exceed 100',
        }),

    role: Joi.string()
        .valid(...ASSIGNABLE_ROLES, ROLES.COLLEGEADMIN)
        .optional()
        .messages({
            'any.only': `Filter role must be one of: ${[...ASSIGNABLE_ROLES, ROLES.COLLEGEADMIN].join(', ')}`,
        }),

    status: Joi.string()
        .valid(STATUS.ACTIVE, STATUS.INACTIVE)
        .optional()
        .messages({
            'any.only': `Status filter must be ${STATUS.ACTIVE} or ${STATUS.INACTIVE}`,
        }),

    search: Joi.string()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Search term cannot exceed 100 characters',
        }),
});

/**
 * Toggle user status — active or inactive
 */
const toggleUserStatusSchema = Joi.object({
    user_status: Joi.string()
        .valid(STATUS.ACTIVE, STATUS.INACTIVE)
        .required()
        .messages({
            'any.only': `Status must be ${STATUS.ACTIVE} or ${STATUS.INACTIVE}`,
            'any.required': 'User status is required',
        }),
});

/**
 * User ID param validation (for routes with :userId)
 */
const userIdParamSchema = Joi.object({
    userId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid user ID format',
            'any.required': 'User ID is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Auth
    collegeLoginSchema,
    forgotPasswordSchema,
    changePasswordSchema,
    resetPasswordSchema,
    // Management
    createUserSchema,
    updateUserSchema,
    listUsersSchema,
    toggleUserStatusSchema,
    userIdParamSchema,
};
