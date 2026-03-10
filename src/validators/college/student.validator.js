/**
 * ============================================================================
 * STUDENT VALIDATORS — Joi Schemas for Student Management
 * ============================================================================
 *   - registerStudentSchema        POST  /register_student
 *   - bulkRegisterStudentsSchema   POST  /bulk_register_students
 *   - listStudentsSchema           GET   /get_all_students (query)
 *   - updateStudentSchema          PUT   /update_student/:studentId
 *   - toggleStudentStatusSchema    PATCH /toggle_student_status/:studentId
 *   - approveStudentProfileSchema  PATCH /approve_student_profile/:studentId
 * ============================================================================
 */

const Joi = require('joi');
const { STATUS } = require('../../config/constants');

// ============================================================================
// SINGLE STUDENT SCHEMA (reused in both single and bulk)
// ============================================================================

const studentFields = {
    first_name: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.empty': 'First name is required',
            'string.min': 'First name must be at least 2 characters',
            'any.required': 'First name is required',
        }),

    middle_name: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    last_name: Joi.string()
        .min(1)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Last name is required',
            'any.required': 'Last name is required',
        }),

    student_email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Student email is required',
        }),

    // Frontend sends dept_name, not dept_id
    dept_name: Joi.string()
        .min(2)
        .max(150)
        .required()
        .messages({
            'string.empty': 'Department name is required',
            'any.required': 'Department name is required',
        }),

    student_passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .required()
        .messages({
            'number.min': 'Passout year must be 2020 or later',
            'number.max': 'Passout year cannot exceed 2040',
            'any.required': 'Passout year is required',
        }),

    current_year: Joi.number()
        .integer()
        .min(1)
        .max(6)
        .required()
        .messages({
            'number.min': 'Current year must be at least 1',
            'number.max': 'Current year cannot exceed 6',
            'any.required': 'Current year is required',
        }),
};

// ============================================================================
// REGISTER SINGLE STUDENT
// ============================================================================

const registerStudentSchema = Joi.object({
    ...studentFields,

    student_password: Joi.string()
        .min(8)
        .max(128)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'any.required': 'Password is required',
        }),
});

// ============================================================================
// BULK REGISTER STUDENTS
// ============================================================================

const bulkStudentItemSchema = Joi.object({
    ...studentFields,
});

const bulkRegisterStudentsSchema = Joi.object({
    students: Joi.array()
        .items(bulkStudentItemSchema)
        .min(1)
        .max(500)
        .required()
        .messages({
            'array.min': 'At least one student is required',
            'array.max': 'Maximum 500 students allowed per batch',
            'any.required': 'Students array is required',
        }),
});

// ============================================================================
// LIST STUDENTS (query params)
// ============================================================================

const listStudentsSchema = Joi.object({
    page: Joi.number()
        .positive()
        .optional()
        .default(1),

    limit: Joi.number()
        .positive()
        .max(100)
        .optional()
        .default(20),

    student_status: Joi.string()
        .valid(
            STATUS.STUDENT.ACTIVE,
            STATUS.STUDENT.INACTIVE,
            STATUS.STUDENT.SUSPENDED,
            STATUS.STUDENT.GRADUATED,
            STATUS.STUDENT.DROPOUT
        )
        .optional()
        .messages({
            'any.only': 'Invalid student status',
        }),

    dept_id: Joi.string()
        .uuid()
        .optional()
        .messages({
            'string.guid': 'Invalid department ID format',
        }),

    student_passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional(),

    search: Joi.string()
        .max(100)
        .optional(),

    profile_complete: Joi.boolean()
        .optional(),

    profile_is_approved: Joi.boolean()
        .optional(),
});

// ============================================================================
// UPDATE STUDENT (basic info only)
// ============================================================================

const updateStudentSchema = Joi.object({
    first_name: Joi.string()
        .min(2)
        .max(100)
        .optional(),

    middle_name: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    last_name: Joi.string()
        .min(1)
        .max(100)
        .optional(),

    student_email: Joi.string()
        .email()
        .optional(),

    dept_name: Joi.string()
        .min(2)
        .max(150)
        .optional(),

    student_passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional(),

    current_year: Joi.number()
        .integer()
        .min(1)
        .max(6)
        .optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

// ============================================================================
// TOGGLE STUDENT STATUS
// ============================================================================

const toggleStudentStatusSchema = Joi.object({
    student_status: Joi.string()
        .valid(
            STATUS.STUDENT.ACTIVE,
            STATUS.STUDENT.INACTIVE,
            STATUS.STUDENT.SUSPENDED,
            STATUS.STUDENT.GRADUATED,
            STATUS.STUDENT.DROPOUT
        )
        .required()
        .messages({
            'any.only': `Status must be one of: ${Object.values(STATUS.STUDENT).join(', ')}`,
            'any.required': 'Student status is required',
        }),
});

// ============================================================================
// APPROVE / REJECT STUDENT PROFILE
// ============================================================================

const approveStudentProfileSchema = Joi.object({
    action: Joi.string()
        .valid('approved', 'rejected')
        .required()
        .messages({
            'any.only': 'Action must be "approved" or "rejected"',
            'any.required': 'Action is required',
        }),
    rejection_reason: Joi.string()
        .max(500)
        .when('action', {
            is: 'rejected',
            then: Joi.required(),
            otherwise: Joi.optional().allow(null, ''),
        })
        .messages({
            'any.required': 'Rejection reason is required when rejecting',
            'string.max': 'Rejection reason must not exceed 500 characters',
        }),
});

// ============================================================================
// GET STUDENT FULL PROFILE (query params)
// ============================================================================

const getStudentFullProfileQuerySchema = Joi.object({
    review: Joi.boolean()
        .default(false),
});

/**
 * Student ID param validation (for routes with :studentId)
 */
const studentIdParamSchema = Joi.object({
    studentId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid student ID format',
            'any.required': 'Student ID is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    registerStudentSchema,
    bulkRegisterStudentsSchema,
    listStudentsSchema,
    updateStudentSchema,
    toggleStudentStatusSchema,
    approveStudentProfileSchema,
    getStudentFullProfileQuerySchema,
    studentIdParamSchema,
};
