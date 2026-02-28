/**
 * ============================================================================
 * STUDENT SEMESTER GRADES VALIDATORS — Joi Schemas
 * ============================================================================
 * Schemas:
 *   - addSemesterGradeSchema     POST /api/student/add_semester_grade
 *   - updateSemesterGradeSchema  PUT  /api/student/update_semester_grade/:gradeId
 * ============================================================================
 */

const Joi = require('joi');

// Enum values matching schema CHECK constraints
const VALID_SEMESTER_STATUSES = ['in_progress', 'completed', 'detained', 'failed'];

// ============================================================================
// ADD SEMESTER GRADE
// ============================================================================

const addSemesterGradeSchema = Joi.object({
    semester_number: Joi.number()
        .integer()
        .min(1)
        .max(12)
        .required()
        .messages({
            'number.min': 'Semester number must be at least 1',
            'number.max': 'Semester number cannot exceed 12',
            'number.integer': 'Semester number must be a whole number',
            'any.required': 'Semester number is required',
        }),

    academic_year: Joi.string()
        .max(20)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Academic year cannot exceed 20 characters',
        }),

    sgpa: Joi.number()
        .min(0)
        .max(10)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'SGPA cannot be negative',
            'number.max': 'SGPA cannot exceed 10',
        }),

    cgpa: Joi.number()
        .min(0)
        .max(10)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'CGPA cannot be negative',
            'number.max': 'CGPA cannot exceed 10',
        }),

    backlogs_in_semester: Joi.number()
        .integer()
        .min(0)
        .max(20)
        .optional()
        .allow(null)
        .default(0)
        .messages({
            'number.min': 'Backlogs cannot be negative',
            'number.max': 'Backlogs cannot exceed 20',
            'number.integer': 'Backlogs must be a whole number',
        }),

    backlog_subjects: Joi.array()
        .items(Joi.string().max(100))
        .optional()
        .allow(null)
        .default([])
        .messages({
            'array.base': 'Backlog subjects must be an array',
        }),

    semester_status: Joi.string()
        .valid(...VALID_SEMESTER_STATUSES)
        .optional()
        .default('in_progress')
        .messages({
            'any.only': `Semester status must be one of: ${VALID_SEMESTER_STATUSES.join(', ')}`,
        }),
});

// ============================================================================
// UPDATE SEMESTER GRADE (gradeId comes from URL params)
// ============================================================================

const updateSemesterGradeSchema = Joi.object({
    academic_year: Joi.string()
        .max(20)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Academic year cannot exceed 20 characters',
        }),

    sgpa: Joi.number()
        .min(0)
        .max(10)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'SGPA cannot be negative',
            'number.max': 'SGPA cannot exceed 10',
        }),

    cgpa: Joi.number()
        .min(0)
        .max(10)
        .precision(2)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'CGPA cannot be negative',
            'number.max': 'CGPA cannot exceed 10',
        }),

    backlogs_in_semester: Joi.number()
        .integer()
        .min(0)
        .max(20)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Backlogs cannot be negative',
            'number.max': 'Backlogs cannot exceed 20',
            'number.integer': 'Backlogs must be a whole number',
        }),

    backlog_subjects: Joi.array()
        .items(Joi.string().max(100))
        .optional()
        .allow(null)
        .messages({
            'array.base': 'Backlog subjects must be an array',
        }),

    semester_status: Joi.string()
        .valid(...VALID_SEMESTER_STATUSES)
        .optional()
        .messages({
            'any.only': `Semester status must be one of: ${VALID_SEMESTER_STATUSES.join(', ')}`,
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    addSemesterGradeSchema,
    updateSemesterGradeSchema,
};
