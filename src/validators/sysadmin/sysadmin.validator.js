/**
 * ============================================================================
 * SYSADMIN VALIDATORS — Joi Schemas for Sysadmin Endpoints
 * ============================================================================
 */

const Joi = require('joi');
const { VALIDATION, COLLEGE_TYPES } = require('../../config/constants');

// ============================================================================
// Sysadmin Login
// POST /api/sysadmin/login
// ============================================================================
const sysadminLoginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'Email is required',
            'string.email': 'Please enter a valid email address',
            'any.required': 'Email is required',
        }),

    password: Joi.string()
        .min(VALIDATION.PASSWORD_MIN_LENGTH)
        .max(VALIDATION.PASSWORD_MAX_LENGTH)
        .required()
        .messages({
            'string.empty': 'Password is required',
            'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
            'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
            'any.required': 'Password is required',
        }),
});

// ============================================================================
// Create New College (with first admin user)
// POST /api/sysadmin/create_new_college
// ============================================================================
const createCollegeSchema = Joi.object({
    // College info
    college_name: Joi.string()
        .trim()
        .min(VALIDATION.NAME_MIN_LENGTH)
        .max(VALIDATION.STRING_MAX_LENGTH)
        .required()
        .messages({
            'string.empty': 'College name is required',
            'string.min': `College name must be at least ${VALIDATION.NAME_MIN_LENGTH} characters`,
            'string.max': `College name cannot exceed ${VALIDATION.STRING_MAX_LENGTH} characters`,
            'any.required': 'College name is required',
        }),

    college_subdomain: Joi.string()
        .trim()
        .lowercase()
        .pattern(/^[a-z0-9-]+$/)
        .min(2)
        .max(50)
        .required()
        .messages({
            'string.empty': 'College subdomain is required',
            'string.pattern.base': 'Subdomain can only contain lowercase letters, numbers, and hyphens',
            'string.min': 'Subdomain must be at least 2 characters',
            'string.max': 'Subdomain cannot exceed 50 characters',
            'any.required': 'College subdomain is required',
        }),

    college_type: Joi.string()
        .valid(...COLLEGE_TYPES)
        .required()
        .messages({
            'any.only': `College type must be one of: ${COLLEGE_TYPES.join(', ')}`,
            'any.required': 'College type is required',
        }),

    college_address: Joi.string().trim().max(500).optional().allow(''),
    college_city: Joi.string().trim().max(100).optional().allow(''),
    college_taluka: Joi.string().trim().max(100).optional().allow(''),
    college_district: Joi.string().trim().max(100).optional().allow(''),
    college_state: Joi.string().trim().max(100).optional().allow(''),
    college_pincode: Joi.string().length(VALIDATION.PINCODE_LENGTH).pattern(/^\d+$/).optional().allow('').messages({
        'string.length': `Pincode must be exactly ${VALIDATION.PINCODE_LENGTH} digits`,
        'string.pattern.base': 'Pincode must contain only digits',
    }),

    default_academic_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .required()
        .messages({
            'number.base': 'Academic year must be a number',
            'number.min': 'Academic year must be 2020 or later',
            'number.max': 'Academic year cannot be after 2040',
            'any.required': 'Default academic year is required',
        }),

    // First admin user
    admin_name: Joi.string()
        .trim()
        .min(VALIDATION.NAME_MIN_LENGTH)
        .max(VALIDATION.NAME_MAX_LENGTH)
        .required()
        .messages({
            'string.empty': 'Admin name is required',
            'string.min': `Admin name must be at least ${VALIDATION.NAME_MIN_LENGTH} characters`,
            'any.required': 'Admin name is required',
        }),

    admin_email: Joi.string()
        .email()
        .required()
        .messages({
            'string.empty': 'Admin email is required',
            'string.email': 'Please enter a valid admin email',
            'any.required': 'Admin email is required',
        }),

    admin_password: Joi.string()
        .min(VALIDATION.PASSWORD_MIN_LENGTH)
        .max(VALIDATION.PASSWORD_MAX_LENGTH)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.empty': 'Admin password is required',
            'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
            'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
            'string.pattern.base': 'Password must contain at least one uppercase, one lowercase, and one number',
            'any.required': 'Admin password is required',
        }),
});

// ============================================================================
// Update College Info
// PUT /api/sysadmin/update_college/:collegeId
// ============================================================================
const updateCollegeSchema = Joi.object({
    college_name: Joi.string().trim().min(VALIDATION.NAME_MIN_LENGTH).max(VALIDATION.STRING_MAX_LENGTH).optional(),
    college_subdomain: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]+$/).min(2).max(50).optional(),
    college_type: Joi.string().valid(...COLLEGE_TYPES).optional(),
    college_address: Joi.string().trim().max(500).optional().allow(''),
    college_city: Joi.string().trim().max(100).optional().allow(''),
    college_taluka: Joi.string().trim().max(100).optional().allow(''),
    college_district: Joi.string().trim().max(100).optional().allow(''),
    college_state: Joi.string().trim().max(100).optional().allow(''),
    college_pincode: Joi.string().length(VALIDATION.PINCODE_LENGTH).pattern(/^\d+$/).optional().allow(''),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// Toggle College Status
// PATCH /api/sysadmin/toggle_college_status/:collegeId
// ============================================================================
const toggleCollegeStatusSchema = Joi.object({
    college_status: Joi.string()
        .valid('active', 'inactive')
        .required()
        .messages({
            'any.only': 'Status must be either active or inactive',
            'any.required': 'College status is required',
        }),
});

// ============================================================================
// Update College Features
// PATCH /api/sysadmin/update_college_features/:collegeId
// ============================================================================
const updateCollegeFeaturesSchema = Joi.object({
    enabled_features: Joi.array()
        .items(Joi.string().trim().min(1))
        .min(1)
        .required()
        .custom((value, helpers) => {
            if (!value.includes('core')) {
                return helpers.error('any.custom', { message: 'Core feature must always be included' });
            }
            return value;
        })
        .messages({
            'array.base': 'Enabled features must be an array',
            'array.min': 'At least one feature is required',
            'any.required': 'Enabled features are required',
            'any.custom': '{{#message}}',
        }),
});

// ============================================================================
// Update Academic Year
// PATCH /api/sysadmin/update_academic_year/:collegeId
// ============================================================================
const updateAcademicYearSchema = Joi.object({
    default_academic_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .required()
        .messages({
            'number.base': 'Academic year must be a number',
            'number.min': 'Academic year must be 2020 or later',
            'number.max': 'Academic year cannot be after 2040',
            'any.required': 'Academic year is required',
        }),
});

// ============================================================================
// List Colleges Query Params
// GET /api/sysadmin/get_all_colleges
// ============================================================================
const listCollegesQuerySchema = Joi.object({
    page: Joi.number().integer().positive().default(1),
    limit: Joi.number().integer().positive().max(100).default(10),
    status: Joi.string().valid('active', 'inactive').optional(),
    type: Joi.string().valid(...COLLEGE_TYPES).optional(),
    search: Joi.string().trim().max(100).optional(),
});

// ============================================================================
// College ID Param Validation (shared across routes with :collegeId)
// ============================================================================
const collegeIdParamSchema = Joi.object({
    collegeId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid college ID format',
            'any.required': 'College ID is required',
        }),
});

module.exports = {
    sysadminLoginSchema,
    createCollegeSchema,
    updateCollegeSchema,
    toggleCollegeStatusSchema,
    updateCollegeFeaturesSchema,
    updateAcademicYearSchema,
    listCollegesQuerySchema,
    collegeIdParamSchema,
};
