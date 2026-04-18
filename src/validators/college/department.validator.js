/**
 * ============================================================================
 * DEPARTMENT VALIDATORS — Joi Schemas for Department Management
 * ============================================================================
 *   - createDepartmentSchema     POST  /api/college/create_department
 *   - updateDepartmentSchema     PUT   /api/college/update_department/:deptId
 *   - listDepartmentsSchema      GET   /api/college/get_all_departments
 *   - toggleDepartmentSchema     PATCH /api/college/toggle_department_status/:deptId
 * ============================================================================
 */

const Joi = require('joi');
const { DEPT_TYPES } = require('../../config/constants');

// ============================================================================
// CREATE DEPARTMENT
// ============================================================================

const createDepartmentSchema = Joi.object({
    dept_name: Joi.string()
        .min(2)
        .max(150)
        .required()
        .messages({
            'string.empty': 'Department name is required',
            'string.min': 'Department name must be at least 2 characters',
            'string.max': 'Department name cannot exceed 150 characters',
            'any.required': 'Department name is required',
        }),

    dept_code: Joi.string()
        .max(20)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Department code cannot exceed 20 characters',
        }),

    dept_type: Joi.string()
        .valid(...DEPT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Department type must be one of: ${DEPT_TYPES.join(', ')}`,
        }),

    program_duration_years: Joi.number()
        .integer()
        .min(1)
        .max(6)
        .optional()
        .default(4)
        .messages({
            'number.min': 'Program duration must be at least 1 year',
            'number.max': 'Program duration cannot exceed 6 years',
            'number.integer': 'Program duration must be a whole number',
        }),

    total_semesters: Joi.number()
        .integer()
        .min(1)
        .max(12)
        .optional()
        .default(8)
        .messages({
            'number.min': 'Total semesters must be at least 1',
            'number.max': 'Total semesters cannot exceed 12',
            'number.integer': 'Total semesters must be a whole number',
        }),
});

// ============================================================================
// UPDATE DEPARTMENT
// ============================================================================

const updateDepartmentSchema = Joi.object({
    dept_name: Joi.string()
        .min(2)
        .max(150)
        .optional()
        .messages({
            'string.min': 'Department name must be at least 2 characters',
            'string.max': 'Department name cannot exceed 150 characters',
        }),

    dept_code: Joi.string()
        .max(20)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Department code cannot exceed 20 characters',
        }),

    dept_type: Joi.string()
        .valid(...DEPT_TYPES)
        .optional()
        .allow(null)
        .messages({
            'any.only': `Department type must be one of: ${DEPT_TYPES.join(', ')}`,
        }),

    program_duration_years: Joi.number()
        .integer()
        .min(1)
        .max(6)
        .optional()
        .messages({
            'number.min': 'Program duration must be at least 1 year',
            'number.max': 'Program duration cannot exceed 6 years',
        }),

    total_semesters: Joi.number()
        .integer()
        .min(1)
        .max(12)
        .optional()
        .messages({
            'number.min': 'Total semesters must be at least 1',
            'number.max': 'Total semesters cannot exceed 12',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

// ============================================================================
// LIST DEPARTMENTS (query params)
// ============================================================================

const listDepartmentsSchema = Joi.object({
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

    is_active: Joi.boolean()
        .optional()
        .messages({
            'boolean.base': 'is_active must be true or false',
        }),

    search: Joi.string()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Search term cannot exceed 100 characters',
        }),

    passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional()
        .messages({
            'number.base': 'Passout year must be a number',
            'number.integer': 'Passout year must be a whole number',
            'number.min': 'Passout year must be at least 2020',
            'number.max': 'Passout year cannot exceed 2040',
        }),
});

// ============================================================================
// TOGGLE DEPARTMENT STATUS
// ============================================================================

const toggleDepartmentSchema = Joi.object({
    is_active: Joi.boolean()
        .required()
        .messages({
            'boolean.base': 'is_active must be true or false',
            'any.required': 'is_active is required',
        }),
});

/**
 * Dept ID param validation (for routes with :deptId)
 */
const deptIdParamSchema = Joi.object({
    deptId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid department ID format',
            'any.required': 'Department ID is required',
        }),
});

const deptDetailQuerySchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional()
        .messages({
            'number.base': 'Passout year must be a number',
            'number.integer': 'Passout year must be a whole number',
            'number.min': 'Passout year must be at least 2020',
            'number.max': 'Passout year cannot exceed 2040',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createDepartmentSchema,
    updateDepartmentSchema,
    listDepartmentsSchema,
    toggleDepartmentSchema,
    deptIdParamSchema,
    deptDetailQuerySchema,
};
