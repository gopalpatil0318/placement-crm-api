/**
 * ============================================================================
 * STUDENT CERTIFICATE VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - addCertificateSchema      POST /api/student/add_certificate
 *   - updateCertificateSchema   PUT  /api/student/update_certificate/:certificateId
 * ============================================================================
 */

const Joi = require('joi');

// Enum values matching schema CHECK constraint
const VALID_CERTIFICATE_TYPES = ['course', 'training', 'workshop', 'seminar', 'certification', 'bootcamp'];

// ============================================================================
// ADD CERTIFICATE
// ============================================================================

const addCertificateSchema = Joi.object({
    // ── MANDATORY FIELDS ──
    certificate_name: Joi.string()
        .min(2)
        .max(300)
        .required()
        .messages({
            'string.empty': 'Certificate name is required',
            'string.min': 'Certificate name must be at least 2 characters',
            'string.max': 'Certificate name cannot exceed 300 characters',
            'any.required': 'Certificate name is required',
        }),

    issuing_organization: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Issuing organization is required',
            'string.min': 'Organization must be at least 2 characters',
            'string.max': 'Organization cannot exceed 200 characters',
            'any.required': 'Issuing organization is required',
        }),

    // ── OPTIONAL FIELDS ──
    certificate_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 1000 characters',
        }),

    certificate_type: Joi.string()
        .valid(...VALID_CERTIFICATE_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Certificate type must be one of: ${VALID_CERTIFICATE_TYPES.join(', ')}`,
        }),

    issuing_platform: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Platform name cannot exceed 100 characters',
        }),

    credential_id: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Credential ID cannot exceed 100 characters',
        }),

    credential_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Credential URL must be a valid URL',
        }),

    issue_date: Joi.date()
        .iso()
        .max('now')
        .optional()
        .allow(null)
        .messages({
            'date.max': 'Issue date cannot be in the future',
            'date.format': 'Issue date must be in YYYY-MM-DD format',
        }),

    expiry_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Expiry date must be in YYYY-MM-DD format',
        }),

    does_not_expire: Joi.boolean()
        .optional()
        .default(true)
        .messages({
            'boolean.base': 'does_not_expire must be true or false',
        }),

    skills_covered: Joi.array()
        .items(Joi.string().max(50))
        .max(20)
        .optional()
        .allow(null)
        .default([])
        .messages({
            'array.max': 'Cannot list more than 20 skills',
        }),

    certificate_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Certificate URL must be a valid URL',
        }),
});

// ============================================================================
// UPDATE CERTIFICATE (all fields optional, at least 1 required)
// ============================================================================

const updateCertificateSchema = Joi.object({
    certificate_name: Joi.string()
        .min(2)
        .max(300)
        .optional()
        .messages({
            'string.min': 'Certificate name must be at least 2 characters',
            'string.max': 'Certificate name cannot exceed 300 characters',
        }),

    issuing_organization: Joi.string()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Organization must be at least 2 characters',
            'string.max': 'Organization cannot exceed 200 characters',
        }),

    certificate_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Description cannot exceed 1000 characters',
        }),

    certificate_type: Joi.string()
        .valid(...VALID_CERTIFICATE_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Certificate type must be one of: ${VALID_CERTIFICATE_TYPES.join(', ')}`,
        }),

    issuing_platform: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Platform name cannot exceed 100 characters',
        }),

    credential_id: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Credential ID cannot exceed 100 characters',
        }),

    credential_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Credential URL must be a valid URL',
        }),

    issue_date: Joi.date()
        .iso()
        .max('now')
        .optional()
        .allow(null)
        .messages({
            'date.max': 'Issue date cannot be in the future',
        }),

    expiry_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Expiry date must be in YYYY-MM-DD format',
        }),

    does_not_expire: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'does_not_expire must be true or false',
        }),

    skills_covered: Joi.array()
        .items(Joi.string().max(50))
        .max(20)
        .optional()
        .allow(null)
        .messages({
            'array.max': 'Cannot list more than 20 skills',
        }),

    certificate_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Certificate URL must be a valid URL',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// PARAM SCHEMA — certificateId
// ============================================================================

const certificateIdParamSchema = Joi.object({
    certificateId: Joi.string().uuid().required().messages({
        'string.guid': 'Certificate ID must be a valid UUID',
        'any.required': 'Certificate ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addCertificateSchema,
    updateCertificateSchema,
    certificateIdParamSchema,
};
