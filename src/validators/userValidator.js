/**
 * ============================================================================
 * USER VALIDATORS - Request Validation Schemas
 * ============================================================================
 * Joi schemas for user API endpoints
 */

const Joi = require('joi');
const { VALIDATION, STATUS, ROLES } = require('../config/constants');

/**
 * Create user schema
 * Validates user creation request body
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
      'any.required': 'User name is required'
    }),

  user_email: Joi.string()
    .email()
    .required()
    .messages({
      'string.empty': 'User email is required',
      'string.email': 'Invalid email format',
      'any.required': 'User email is required'
    }),

  user_password: Joi.string()
    .min(VALIDATION.PASSWORD_MIN_LENGTH)
    .max(VALIDATION.PASSWORD_MAX_LENGTH)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.empty': 'User password is required',
      'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
      'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
      'string.pattern.base': 'Password must contain uppercase, lowercase, and numeric characters',
      'any.required': 'User password is required'
    }),

  
});

/**
 * Update user schema
 * Validates user update request body
 */
const updateUserSchema = Joi.object({
  user_name: Joi.string()
    .min(VALIDATION.STRING_MIN_LENGTH)
    .max(100)
    .optional()
    .messages({
      'string.min': `Minimum ${VALIDATION.STRING_MIN_LENGTH} characters`,
      'string.max': 'User name cannot exceed 100 characters'
    }),

  user_role: Joi.string()
    .valid(ROLES.COLLEGEADMIN, ROLES.TEACHER, 'student', 'other')
    .optional()
    .messages({
      'any.only': `User role must be one of: ${ROLES.COLLEGEADMIN}, ${ROLES.TEACHER}, student, other`
    }),

  user_status: Joi.string()
    .valid(STATUS.ACTIVE, 'inactive')
    .optional()
    .messages({
      'any.only': `User status must be one of: ${STATUS.ACTIVE}, inactive`
    })
}).min(1).messages({
  'object.min': 'At least one field must be updated'
});

/**
 * List user schema
 * Validates pagination query parameters
 */
const listUserSchema = Joi.object({
  page: Joi.number()
    .positive()
    .optional()
    .default(1)
    .messages({
      'number.positive': 'Page must be a positive number'
    }),

  limit: Joi.number()
    .positive()
    .max(100)
    .optional()
    .default(20)
    .messages({
      'number.positive': 'Limit must be a positive number',
      'number.max': 'Limit cannot exceed 100'
    })
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  listUserSchema
};
