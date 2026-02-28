/**
 * ============================================================================
 * STUDENT ACADEMIC INFO VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - saveAcademicInfoSchema   PUT /api/student/save_academic_info (upsert)
 * ============================================================================
 */

const Joi = require('joi');

// Enum values matching schema CHECK constraints
const VALID_TWELFTH_DIPLOMA = ['12th', 'Diploma'];
const VALID_ADMISSION_BASED_ON = ['JEE', 'MHT-CET', 'GATE', 'Direct', 'Management', 'CAT', 'Other'];

// ============================================================================
// SAVE ACADEMIC INFO (Upsert — create or update)
// ============================================================================

const saveAcademicInfoSchema = Joi.object({
    // Enrollment details
    roll_number: Joi.string()
        .max(50)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Roll number cannot exceed 50 characters',
        }),

    enrollment_number: Joi.string()
        .max(50)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Enrollment number cannot exceed 50 characters',
        }),

    admission_year: Joi.number()
        .integer()
        .min(2000)
        .max(2100)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Admission year must be 2000 or later',
            'number.max': 'Admission year is invalid',
            'number.integer': 'Admission year must be a whole number',
        }),

    admission_based_on: Joi.string()
        .valid(...VALID_ADMISSION_BASED_ON)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Admission must be based on: ${VALID_ADMISSION_BASED_ON.join(', ')}`,
        }),

    // 10th details
    tenth_percentage: Joi.number()
        .min(0)
        .max(100)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Percentage cannot be negative',
            'number.max': 'Percentage cannot exceed 100',
        }),

    tenth_board: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': '10th board name cannot exceed 100 characters',
        }),

    tenth_passing_year: Joi.number()
        .integer()
        .min(2000)
        .max(2100)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Passing year must be 2000 or later',
            'number.max': 'Passing year is invalid',
        }),

    // 12th or Diploma
    twelfth_or_diploma: Joi.string()
        .valid(...VALID_TWELFTH_DIPLOMA)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Must be one of: ${VALID_TWELFTH_DIPLOMA.join(', ')}`,
        }),

    twelfth_percentage: Joi.number()
        .min(0)
        .max(100)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Percentage cannot be negative',
            'number.max': 'Percentage cannot exceed 100',
        }),

    twelfth_board: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': '12th board name cannot exceed 100 characters',
        }),

    diploma_percentage: Joi.number()
        .min(0)
        .max(100)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Percentage cannot be negative',
            'number.max': 'Percentage cannot exceed 100',
        }),

    diploma_branch: Joi.string()
        .max(100)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Diploma branch cannot exceed 100 characters',
        }),

    higher_education_passing_year: Joi.number()
        .integer()
        .min(2000)
        .max(2100)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Passing year must be 2000 or later',
            'number.max': 'Passing year is invalid',
        }),

    // Current academic performance
    overall_cgpa: Joi.number()
        .min(0)
        .max(10)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'CGPA cannot be negative',
            'number.max': 'CGPA cannot exceed 10',
        }),

    total_live_kts: Joi.number()
        .integer()
        .min(0)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Live KTs cannot be negative',
            'number.integer': 'Live KTs must be a whole number',
        }),

    total_dead_kts: Joi.number()
        .integer()
        .min(0)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Dead KTs cannot be negative',
            'number.integer': 'Dead KTs must be a whole number',
        }),

    // Education gap
    any_gap_during_education: Joi.boolean()
        .optional()
        .allow(null)
        .messages({
            'boolean.base': 'Must be true or false',
        }),

    gap_years: Joi.number()
        .integer()
        .min(0)
        .max(10)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Gap years cannot be negative',
            'number.max': 'Gap years cannot exceed 10',
            'number.integer': 'Gap years must be a whole number',
        }),

    gap_reason: Joi.string()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Gap reason cannot exceed 500 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided',
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    saveAcademicInfoSchema,
};
