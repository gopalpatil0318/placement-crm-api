/**
 * ============================================================================
 * PROFILE VALIDATOR — Joi schemas for self-service profile
 * ============================================================================
 */

const Joi = require('joi');

// ============================================================================
// UPDATE MY PROFILE
// ============================================================================

const updateMyProfileSchema = Joi.object({
  user_name: Joi.string().trim().min(2).max(100).messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name must not exceed 100 characters',
  }),

  phone_number: Joi.string()
    .trim()
    .pattern(/^[+]?[\d\s\-()]{7,20}$/)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Phone number must be a valid format (7-20 digits, optional + prefix)',
    }),

  profile_picture_url: Joi.string()
    .trim()
    .uri({ scheme: ['https'] })
    .max(2048)
    .allow(null, '')
    .messages({
      'string.uri': 'Profile picture must be a valid HTTPS URL',
      'string.uriCustomScheme': 'Profile picture must be a valid HTTPS URL',
      'string.max': 'Profile picture URL must not exceed 2048 characters',
    }),
}).min(1).messages({
  'object.min': 'At least one field must be provided to update',
});

module.exports = {
  updateMyProfileSchema,
};
