/**
 * ============================================================================
 * PERMISSION VALIDATOR — Joi schemas for role templates + per-user permissions
 * ============================================================================
 */

const Joi = require('joi');
const { CONFIGURABLE_ROLES, ALL_PERMISSION_KEYS } = require('../../config/constants');

// ============================================================================
// UPDATE ROLE PERMISSIONS
// ============================================================================

const updateRolePermissionsSchema = Joi.object({
  permissions: Joi.array()
    .items(
      Joi.string()
        .valid(...ALL_PERMISSION_KEYS)
        .messages({ 'any.only': '{{#value}} is not a valid permission key' })
    )
    .unique()
    .required()
    .messages({
      'array.base': 'Permissions must be an array',
      'array.unique': 'Duplicate permission keys are not allowed',
      'any.required': 'Permissions array is required',
    }),

  dept_scoped: Joi.boolean()
    .required()
    .messages({
      'boolean.base': 'dept_scoped must be a boolean',
      'any.required': 'dept_scoped flag is required',
    }),
});

// ============================================================================
// ROLE PARAM — validates :role URL param
// ============================================================================

const roleParamSchema = Joi.object({
  role: Joi.string()
    .valid(...CONFIGURABLE_ROLES)
    .required()
    .messages({
      'any.only': 'Role must be one of: ' + CONFIGURABLE_ROLES.join(', '),
      'any.required': 'Role parameter is required',
    }),
});

// ============================================================================
// COPY PERMISSIONS
// ============================================================================

const copyPermissionsSchema = Joi.object({
  source_role: Joi.string()
    .valid(...CONFIGURABLE_ROLES)
    .required()
    .messages({
      'any.only': 'Source role must be one of: ' + CONFIGURABLE_ROLES.join(', '),
      'any.required': 'Source role is required',
    }),
  target_role: Joi.string()
    .valid(...CONFIGURABLE_ROLES)
    .required()
    .messages({
      'any.only': 'Target role must be one of: ' + CONFIGURABLE_ROLES.join(', '),
      'any.required': 'Target role is required',
    }),
}).custom((value, helpers) => {
  if (value.source_role === value.target_role) {
    return helpers.message({ custom: 'Source and target roles must be different' });
  }
  return value;
});

// ============================================================================
// ========== PER-USER PERMISSION SCHEMAS ==========
// ============================================================================

// ============================================================================
// USERS QUERY — GET /permissions/users query params
// ============================================================================

const usersQuerySchema = Joi.object({
  role: Joi.string()
    .valid(...CONFIGURABLE_ROLES)
    .optional()
    .messages({
      'any.only': 'Role filter must be one of: ' + CONFIGURABLE_ROLES.join(', '),
    }),
  search: Joi.string()
    .max(100)
    .trim()
    .optional()
    .messages({
      'string.max': 'Search query must not exceed 100 characters',
    }),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// ============================================================================
// USER ID PARAM — validates :userId URL param
// ============================================================================

const userIdParamSchema = Joi.object({
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'User ID must be a valid UUID',
      'any.required': 'User ID parameter is required',
    }),
});

// ============================================================================
// UPDATE USER PERMISSIONS
// ============================================================================

const updateUserPermissionsSchema = Joi.object({
  permissions: Joi.array()
    .items(
      Joi.string()
        .valid(...ALL_PERMISSION_KEYS)
        .messages({ 'any.only': '{{#value}} is not a valid permission key' })
    )
    .unique()
    .required()
    .messages({
      'array.base': 'Permissions must be an array',
      'array.unique': 'Duplicate permission keys are not allowed',
      'any.required': 'Permissions array is required',
    }),

  dept_ids: Joi.array()
    .items(
      Joi.string()
        .uuid()
        .messages({ 'string.guid': 'Each department ID must be a valid UUID' })
    )
    .unique()
    .default([])
    .messages({
      'array.base': 'Department IDs must be an array',
      'array.unique': 'Duplicate department IDs are not allowed',
    }),

  expected_updated_at: Joi.string()
    .isoDate()
    .optional()
    .messages({
      'string.isoDate': 'expected_updated_at must be a valid ISO date string',
    }),
});

// ============================================================================
// COPY USER PERMISSIONS
// ============================================================================

const copyUserPermissionsSchema = Joi.object({
  source_user_id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Source user ID must be a valid UUID',
      'any.required': 'Source user ID is required',
    }),
  target_user_id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Target user ID must be a valid UUID',
      'any.required': 'Target user ID is required',
    }),
}).custom((value, helpers) => {
  if (value.source_user_id === value.target_user_id) {
    return helpers.message({ custom: 'Source and target users must be different' });
  }
  return value;
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Role template schemas
  updateRolePermissionsSchema,
  roleParamSchema,
  copyPermissionsSchema,
  // Per-user schemas
  usersQuerySchema,
  userIdParamSchema,
  updateUserPermissionsSchema,
  copyUserPermissionsSchema,
};
