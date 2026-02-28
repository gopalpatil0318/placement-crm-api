/**
 * ============================================================================
 * STUDENT PERSONAL INFO VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - savePersonalInfoSchema   PUT /api/student/save_personal_info (upsert)
 * ============================================================================
 */

const Joi = require('joi');
const { VALIDATION } = require('../../config/constants');

// Enum values matching schema CHECK constraints
const VALID_GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const VALID_CATEGORIES = ['General', 'OBC', 'SC', 'ST', 'NT', 'VJ', 'SBC'];

// ============================================================================
// SAVE PERSONAL INFO (Upsert — create or update)
// ============================================================================

const savePersonalInfoSchema = Joi.object({
    // Contact
    mobile_number: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Mobile number must be a valid 10-digit Indian number',
        }),

    alternate_mobile: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Alternate mobile must be a valid 10-digit Indian number',
        }),

    // Personal
    birth_date: Joi.date()
        .iso()
        .max('now')
        .optional()
        .allow(null)
        .messages({
            'date.max': 'Birth date cannot be in the future',
            'date.format': 'Birth date must be in YYYY-MM-DD format',
        }),

    gender: Joi.string()
        .valid(...VALID_GENDERS)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Gender must be one of: ${VALID_GENDERS.join(', ')}`,
        }),

    blood_group: Joi.string()
        .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
        .optional()
        .allow(null, '')
        .messages({
            'any.only': 'Invalid blood group',
        }),

    aadhaar_number: Joi.string()
        .length(VALIDATION.AADHAAR_LENGTH)
        .pattern(/^\d{12}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.length': `Aadhaar number must be exactly ${VALIDATION.AADHAAR_LENGTH} digits`,
            'string.pattern.base': 'Aadhaar number must contain only digits',
        }),

    caste: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Caste cannot exceed 100 characters',
        }),

    category: Joi.string()
        .valid(...VALID_CATEGORIES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
        }),

    nationality: Joi.string()
        .max(50)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Nationality cannot exceed 50 characters',
        }),

    // Father details
    father_name: Joi.string()
        .min(VALIDATION.NAME_MIN_LENGTH)
        .max(VALIDATION.NAME_MAX_LENGTH)
        .optional()
        .allow(null, '')
        .messages({
            'string.min': `Father name must be at least ${VALIDATION.NAME_MIN_LENGTH} characters`,
            'string.max': `Father name cannot exceed ${VALIDATION.NAME_MAX_LENGTH} characters`,
        }),

    father_mobile: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Father mobile must be a valid 10-digit Indian number',
        }),

    father_occupation: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Father occupation cannot exceed 100 characters',
        }),

    father_annual_income: Joi.number()
        .min(0)
        .max(99999999.99)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Annual income cannot be negative',
            'number.max': 'Annual income value is too large',
        }),

    // Mother details
    mother_name: Joi.string()
        .min(VALIDATION.NAME_MIN_LENGTH)
        .max(VALIDATION.NAME_MAX_LENGTH)
        .optional()
        .allow(null, '')
        .messages({
            'string.min': `Mother name must be at least ${VALIDATION.NAME_MIN_LENGTH} characters`,
            'string.max': `Mother name cannot exceed ${VALIDATION.NAME_MAX_LENGTH} characters`,
        }),

    mother_mobile: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Mother mobile must be a valid 10-digit Indian number',
        }),

    mother_occupation: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Mother occupation cannot exceed 100 characters',
        }),

    mother_annual_income: Joi.number()
        .min(0)
        .max(99999999.99)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Annual income cannot be negative',
            'number.max': 'Annual income value is too large',
        }),

    // Guardian details
    guardian_name: Joi.string()
        .max(VALIDATION.NAME_MAX_LENGTH)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': `Guardian name cannot exceed ${VALIDATION.NAME_MAX_LENGTH} characters`,
        }),

    guardian_mobile: Joi.string()
        .pattern(/^[6-9]\d{9}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.pattern.base': 'Guardian mobile must be a valid 10-digit Indian number',
        }),

    // Permanent address
    permanent_address: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Address cannot exceed 500 characters',
        }),

    permanent_city: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'City cannot exceed 100 characters',
        }),

    permanent_district: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'District cannot exceed 100 characters',
        }),

    permanent_state: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'State cannot exceed 100 characters',
        }),

    permanent_pincode: Joi.string()
        .length(VALIDATION.PINCODE_LENGTH)
        .pattern(/^\d{6}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.length': `Pincode must be exactly ${VALIDATION.PINCODE_LENGTH} digits`,
            'string.pattern.base': 'Pincode must contain only digits',
        }),

    // Current address
    current_address: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Address cannot exceed 500 characters',
        }),

    current_city: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'City cannot exceed 100 characters',
        }),

    current_district: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'District cannot exceed 100 characters',
        }),

    current_state: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'State cannot exceed 100 characters',
        }),

    current_pincode: Joi.string()
        .length(VALIDATION.PINCODE_LENGTH)
        .pattern(/^\d{6}$/)
        .optional()
        .allow(null, '')
        .messages({
            'string.length': `Pincode must be exactly ${VALIDATION.PINCODE_LENGTH} digits`,
            'string.pattern.base': 'Pincode must contain only digits',
        }),

    // Same as permanent flag
    same_as_permanent: Joi.boolean()
        .optional()
        .default(true)
        .messages({
            'boolean.base': 'same_as_permanent must be true or false',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided',
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    savePersonalInfoSchema,
};
