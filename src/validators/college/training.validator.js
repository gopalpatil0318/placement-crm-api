/**
 * ============================================================================
 * TRAINING VALIDATORS — Joi Schemas for Training Program Management
 * ============================================================================
 *   - createTrainingSchema            POST  /create_training_program
 *   - listTrainingsSchema             GET   /get_all_training_programs (query)
 *   - updateTrainingSchema            PUT   /update_training_program/:programId
 *   - toggleTrainingStatusSchema      PATCH /toggle_training_status/:programId
 *   - listEnrollmentsSchema           GET   /get_training_enrollments/:programId (query)
 *   - updateEnrollmentSchema          PATCH /update_enrollment/:enrollmentId
 * ============================================================================
 */

const Joi = require('joi');
const { STATUS, TRAINING_PROGRAM_TYPES } = require('../../config/constants');

const PAYMENT_STATUSES = Object.values(STATUS.PAYMENT);

// Program types imported from constants (TRAINING_PROGRAM_TYPES)

// ============================================================================
// CREATE TRAINING PROGRAM
// ============================================================================

const createTrainingSchema = Joi.object({
    program_name: Joi.string()
        .trim()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Program name is required',
            'string.min': 'Program name must be at least 2 characters',
            'string.max': 'Program name cannot exceed 200 characters',
            'any.required': 'Program name is required',
        }),

    program_description: Joi.string()
        .trim()
        .max(3000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Program description cannot exceed 3000 characters',
        }),

    program_type: Joi.string()
        .valid(...TRAINING_PROGRAM_TYPES)
        .required()
        .messages({
            'any.only': `Program type must be one of: ${TRAINING_PROGRAM_TYPES.join(', ')}`,
            'any.required': 'Program type is required',
        }),

    trainer_name: Joi.string()
        .trim()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Trainer name cannot exceed 200 characters',
        }),

    trainer_organization: Joi.string()
        .trim()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Trainer organization cannot exceed 200 characters',
        }),

    start_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Start date must be a valid date (YYYY-MM-DD)',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .when('start_date', {
            is: Joi.exist(),
            then: Joi.date().min(Joi.ref('start_date')).messages({
                'date.min': 'End date must be on or after the start date',
            }),
        })
        .messages({
            'date.format': 'End date must be a valid date (YYYY-MM-DD)',
        }),

    total_sessions: Joi.number()
        .integer()
        .min(1)
        .max(500)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Total sessions must be at least 1',
            'number.max': 'Total sessions cannot exceed 500',
        }),

    session_duration_hours: Joi.number()
        .min(0.5)
        .max(24)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Session duration must be at least 0.5 hours',
            'number.max': 'Session duration cannot exceed 24 hours',
        }),

    target_dept_ids: Joi.array()
        .items(Joi.string().uuid())
        .optional()
        .allow(null)
        .messages({
            'array.includes': 'Each department ID must be a valid UUID',
        }),

    target_passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Passout year must be 2020 or later',
            'number.max': 'Passout year cannot exceed 2040',
        }),

    max_enrollment: Joi.number()
        .integer()
        .min(1)
        .max(10000)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Max enrollment must be at least 1',
            'number.max': 'Max enrollment cannot exceed 10000',
        }),

    enrollment_deadline: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Enrollment deadline must be a valid date (YYYY-MM-DD)',
        }),

    program_status: Joi.string()
        .valid(...Object.values(STATUS.TRAINING))
        .optional()
        .default('draft')
        .messages({
            'any.only': `Program status must be one of: ${Object.values(STATUS.TRAINING).join(', ')}`,
        }),

    program_fee: Joi.number()
        .min(0)
        .optional()
        .default(0)
        .messages({
            'number.min': 'Program fee cannot be negative',
        }),

    fee_currency: Joi.string()
        .trim()
        .max(10)
        .optional()
        .default('INR')
        .messages({
            'string.max': 'Fee currency cannot exceed 10 characters',
        }),

    min_attendance_pct: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .default(0)
        .messages({
            'number.min': 'Minimum attendance percentage cannot be negative',
            'number.max': 'Minimum attendance percentage cannot exceed 100',
        }),
});

// ============================================================================
// LIST TRAINING PROGRAMS (query params)
// ============================================================================

const listTrainingsSchema = Joi.object({
    program_status: Joi.string()
        .valid(...Object.values(STATUS.TRAINING))
        .optional()
        .messages({
            'any.only': `Status must be one of: ${Object.values(STATUS.TRAINING).join(', ')}`,
        }),

    program_type: Joi.string()
        .valid(...TRAINING_PROGRAM_TYPES)
        .optional()
        .messages({
            'any.only': `Program type must be one of: ${TRAINING_PROGRAM_TYPES.join(', ')}`,
        }),

    target_passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional(),

    search: Joi.string()
        .trim()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Search query cannot exceed 100 characters',
        }),

    sort_by: Joi.string()
        .valid('program_name', 'created_at', 'start_date', 'end_date', 'program_type', 'program_status')
        .optional()
        .default('created_at')
        .messages({
            'any.only': 'Sort must be by: program_name, created_at, start_date, end_date, program_type, or program_status',
        }),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc')
        .messages({
            'any.only': 'Sort order must be asc or desc',
        }),

    page: Joi.number()
        .positive()
        .optional()
        .default(1),

    limit: Joi.number()
        .positive()
        .max(100)
        .optional()
        .default(10),
});

// ============================================================================
// UPDATE TRAINING PROGRAM
// ============================================================================

const updateTrainingSchema = Joi.object({
    program_name: Joi.string()
        .trim()
        .min(2)
        .max(200)
        .optional()
        .messages({
            'string.min': 'Program name must be at least 2 characters',
            'string.max': 'Program name cannot exceed 200 characters',
        }),

    program_description: Joi.string()
        .trim()
        .max(3000)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Program description cannot exceed 3000 characters',
        }),

    program_type: Joi.string()
        .valid(...TRAINING_PROGRAM_TYPES)
        .optional()
        .messages({
            'any.only': `Program type must be one of: ${TRAINING_PROGRAM_TYPES.join(', ')}`,
        }),

    trainer_name: Joi.string()
        .trim()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Trainer name cannot exceed 200 characters',
        }),

    trainer_organization: Joi.string()
        .trim()
        .max(200)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Trainer organization cannot exceed 200 characters',
        }),

    start_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Start date must be a valid date (YYYY-MM-DD)',
        }),

    end_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'End date must be a valid date (YYYY-MM-DD)',
        }),

    total_sessions: Joi.number()
        .integer()
        .min(1)
        .max(500)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Total sessions must be at least 1',
            'number.max': 'Total sessions cannot exceed 500',
        }),

    session_duration_hours: Joi.number()
        .min(0.5)
        .max(24)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Session duration must be at least 0.5 hours',
            'number.max': 'Session duration cannot exceed 24 hours',
        }),

    target_dept_ids: Joi.array()
        .items(Joi.string().uuid())
        .optional()
        .allow(null)
        .messages({
            'array.includes': 'Each department ID must be a valid UUID',
        }),

    target_passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional()
        .allow(null),

    max_enrollment: Joi.number()
        .integer()
        .min(1)
        .max(10000)
        .optional()
        .allow(null),

    enrollment_deadline: Joi.date()
        .iso()
        .optional()
        .allow(null),

    program_fee: Joi.number()
        .min(0)
        .optional()
        .messages({
            'number.min': 'Program fee cannot be negative',
        }),

    fee_currency: Joi.string()
        .trim()
        .max(10)
        .optional()
        .messages({
            'string.max': 'Fee currency cannot exceed 10 characters',
        }),

    min_attendance_pct: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .messages({
            'number.min': 'Minimum attendance percentage cannot be negative',
            'number.max': 'Minimum attendance percentage cannot exceed 100',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

// ============================================================================
// TOGGLE TRAINING STATUS
// ============================================================================

const toggleTrainingStatusSchema = Joi.object({
    program_status: Joi.string()
        .valid(...Object.values(STATUS.TRAINING))
        .required()
        .messages({
            'any.only': `Program status must be one of: ${Object.values(STATUS.TRAINING).join(', ')}`,
            'any.required': 'Program status is required',
        }),
});

// ============================================================================
// TOGGLE ENROLLMENT ACCESS
// ============================================================================

const toggleEnrollmentAccessSchema = Joi.object({
    allow_enrollments: Joi.boolean()
        .required()
        .messages({
            'any.required': 'allow_enrollments is required',
            'boolean.base': 'allow_enrollments must be a boolean',
        }),
});

// ============================================================================
// LIST ENROLLMENTS (query params for GET /get_training_enrollments/:programId)
// ============================================================================

const listEnrollmentsSchema = Joi.object({
    completion_status: Joi.string()
        .valid(...Object.values(STATUS.ENROLLMENT))
        .optional()
        .messages({
            'any.only': `Completion status must be one of: ${Object.values(STATUS.ENROLLMENT).join(', ')}`,
        }),

    search: Joi.string()
        .trim()
        .max(100)
        .optional()
        .messages({
            'string.max': 'Search query cannot exceed 100 characters',
        }),

    sort_by: Joi.string()
        .valid('enrolled_at', 'sessions_attended', 'completion_percentage', 'student_name', 'student_rating')
        .optional()
        .default('enrolled_at')
        .messages({
            'any.only': 'Sort must be by: enrolled_at, sessions_attended, completion_percentage, student_name, or student_rating',
        }),

    sort_order: Joi.string()
        .valid('asc', 'desc')
        .optional()
        .default('desc'),

    page: Joi.number()
        .positive()
        .optional()
        .default(1),

    limit: Joi.number()
        .positive()
        .max(100)
        .optional()
        .default(10),
});

// ============================================================================
// UPDATE ENROLLMENT
// ============================================================================

const updateEnrollmentSchema = Joi.object({
    completion_status: Joi.string()
        .valid(...Object.values(STATUS.ENROLLMENT))
        .optional()
        .messages({
            'any.only': `Completion status must be one of: ${Object.values(STATUS.ENROLLMENT).join(', ')}`,
        }),

    certificate_issued: Joi.boolean()
        .optional(),

    certificate_url: Joi.string()
        .uri()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.uri': 'Please provide a valid certificate URL',
            'string.max': 'Certificate URL cannot exceed 500 characters',
        }),

    payment_status: Joi.string()
        .valid(...PAYMENT_STATUSES)
        .optional()
        .messages({
            'any.only': `Payment status must be one of: ${PAYMENT_STATUSES.join(', ')}`,
        }),

    amount_paid: Joi.number()
        .min(0)
        .optional()
        .messages({
            'number.min': 'Amount paid cannot be negative',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

// ============================================================================
// BULK UPDATE ENROLLMENTS
// ============================================================================

const bulkUpdateEnrollmentsSchema = Joi.object({
    updates: Joi.array()
        .items(
            Joi.object({
                enrollment_id: Joi.string().uuid().required().messages({
                    'string.guid': 'Invalid enrollment ID format',
                    'any.required': 'Enrollment ID is required',
                }),
                completion_status: Joi.string()
                    .valid(...Object.values(STATUS.ENROLLMENT))
                    .optional(),
                payment_status: Joi.string().valid(...PAYMENT_STATUSES).optional(),
                amount_paid: Joi.number().min(0).optional(),
                certificate_issued: Joi.boolean().optional(),
                certificate_url: Joi.string().uri().max(500).optional().allow(null, ''),
            }).min(2) // enrollment_id + at least 1 field
        )
        .min(1)
        .max(200)
        .required()
        .messages({
            'array.min': 'At least one enrollment update is required',
            'array.max': 'Cannot update more than 200 enrollments at once',
            'any.required': 'Enrollment updates are required',
        }),
});

// ============================================================================
// CREATE TRAINING SESSION
// ============================================================================

const createSessionSchema = Joi.object({
    session_number: Joi.number()
        .integer()
        .min(1)
        .max(500)
        .required()
        .messages({
            'number.min': 'Session number must be at least 1',
            'number.max': 'Session number cannot exceed 500',
            'any.required': 'Session number is required',
        }),

    session_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Session date must be a valid date (YYYY-MM-DD)',
        }),

    session_topic: Joi.string()
        .trim()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Session topic cannot exceed 500 characters',
        }),

    venue: Joi.string()
        .trim()
        .max(300)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Venue cannot exceed 300 characters',
        }),
});

// ============================================================================
// UPDATE TRAINING SESSION
// ============================================================================

const updateSessionSchema = Joi.object({
    session_number: Joi.number()
        .integer()
        .min(1)
        .max(500)
        .optional()
        .messages({
            'number.min': 'Session number must be at least 1',
            'number.max': 'Session number cannot exceed 500',
        }),

    session_date: Joi.date()
        .iso()
        .optional()
        .allow(null)
        .messages({
            'date.format': 'Session date must be a valid date (YYYY-MM-DD)',
        }),

    session_topic: Joi.string()
        .trim()
        .max(500)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Session topic cannot exceed 500 characters',
        }),

    venue: Joi.string()
        .trim()
        .max(300)
        .optional()
        .allow(null, '')
        .messages({
            'string.max': 'Venue cannot exceed 300 characters',
        }),
}).min(1).messages({
    'object.min': 'At least one field must be provided for update',
});

// ============================================================================
// MARK SESSION ATTENDANCE
// ============================================================================

const markAttendanceSchema = Joi.object({
    attendance: Joi.array()
        .items(
            Joi.object({
                enrollment_id: Joi.string().uuid().required().messages({
                    'string.guid': 'Invalid enrollment ID format',
                    'any.required': 'Enrollment ID is required',
                }),
                present: Joi.boolean().required().messages({
                    'any.required': 'Present/absent status is required',
                }),
            })
        )
        .min(1)
        .max(500)
        .required()
        .messages({
            'array.min': 'At least one attendance record is required',
            'array.max': 'Cannot mark attendance for more than 500 students at once',
            'any.required': 'Attendance data is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

const programIdParamSchema = Joi.object({
    programId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid program ID format',
        'any.required': 'Program ID is required',
    }),
});

const enrollmentIdParamSchema = Joi.object({
    enrollmentId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid enrollment ID format',
        'any.required': 'Enrollment ID is required',
    }),
});

const sessionIdParamSchema = Joi.object({
    sessionId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid session ID format',
        'any.required': 'Session ID is required',
    }),
});

const studentIdParamSchema = Joi.object({
    studentId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid student ID format',
        'any.required': 'Student ID is required',
    }),
});

module.exports = {
    createTrainingSchema,
    listTrainingsSchema,
    updateTrainingSchema,
    toggleTrainingStatusSchema,
    toggleEnrollmentAccessSchema,
    listEnrollmentsSchema,
    updateEnrollmentSchema,
    bulkUpdateEnrollmentsSchema,
    createSessionSchema,
    updateSessionSchema,
    markAttendanceSchema,
    programIdParamSchema,
    enrollmentIdParamSchema,
    sessionIdParamSchema,
    studentIdParamSchema,
};
