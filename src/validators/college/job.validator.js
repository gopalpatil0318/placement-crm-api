/**
 * ============================================================================
 * JOB VALIDATORS — Joi Schemas for Job Posting Management
 * ============================================================================
 *   - createJobSchema              POST  /create_job
 *   - listJobsSchema               GET   /get_all_jobs (query)
 *   - updateJobSchema              PUT   /update_job/:jobId
 *   - updateJobStatusSchema        PATCH /update_job_status/:jobId
 * ============================================================================
 */

const Joi = require('joi');
const { STATUS } = require('../../config/constants');

// Valid enums
const JOB_TYPES = ['full-time', 'internship', 'both'];
const JOB_STATUSES = Object.values(STATUS.JOB);
const QUESTION_TYPES = ['mcq_single', 'mcq_multiple', 'text', 'essay', 'yes_no'];

// ============================================================================
// SUB-SCHEMAS — Positions, Criteria, Rounds, Questions
// ============================================================================

const positionSchema = Joi.object({
    position_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Position name is required',
            'any.required': 'Position name is required',
        }),
    position_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, ''),
    vacancies: Joi.number()
        .integer()
        .min(1)
        .max(9999)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'Vacancies must be at least 1',
        }),
});

const criteriaSchema = Joi.object({
    min_overall_cgpa: Joi.number()
        .min(0)
        .max(10)
        .optional()
        .allow(null)
        .messages({
            'number.min': 'CGPA cannot be negative',
            'number.max': 'CGPA cannot exceed 10',
        }),
    max_live_kts: Joi.number()
        .integer()
        .min(0)
        .max(20)
        .optional()
        .default(0)
        .messages({
            'number.min': 'Live KTs cannot be negative',
        }),
    min_tenth_percentage: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .allow(null),
    min_twelfth_percentage: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .allow(null),
    min_diploma_percentage: Joi.number()
        .min(0)
        .max(100)
        .optional()
        .allow(null),
    allowed_genders: Joi.array()
        .items(Joi.string().valid('Male', 'Female', 'Other'))
        .optional()
        .allow(null),
    allowed_departments: Joi.array()
        .items(Joi.string().max(150))
        .optional()
        .allow(null)
        .messages({
            'string.max': 'Department name cannot exceed 150 characters',
        }),
    allowed_gap_statuses: Joi.array()
        .items(Joi.string())
        .optional()
        .allow(null),
    min_existing_package: Joi.number()
        .min(0)
        .optional()
        .allow(null),
    max_existing_package: Joi.number()
        .min(0)
        .optional()
        .allow(null),
    exclude_already_placed: Joi.boolean()
        .optional()
        .default(false),
});

const roundSchema = Joi.object({
    round_number: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .required()
        .messages({
            'any.required': 'Round number is required',
            'number.min': 'Round number must be at least 1',
        }),
    round_name: Joi.string()
        .min(2)
        .max(200)
        .required()
        .messages({
            'string.empty': 'Round name is required',
            'any.required': 'Round name is required',
        }),
    round_description: Joi.string()
        .max(1000)
        .optional()
        .allow(null, ''),
    round_type: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),
    round_date: Joi.date()
        .iso()
        .optional()
        .allow(null),
    round_venue: Joi.string()
        .max(300)
        .optional()
        .allow(null, ''),
});

const questionSchema = Joi.object({
    question_text: Joi.string()
        .min(3)
        .max(1000)
        .required()
        .messages({
            'string.empty': 'Question text is required',
            'any.required': 'Question text is required',
        }),
    question_type: Joi.string()
        .valid(...QUESTION_TYPES)
        .required()
        .messages({
            'any.only': `Question type must be one of: ${QUESTION_TYPES.join(', ')}`,
            'any.required': 'Question type is required',
        }),
    question_options: Joi.when('question_type', {
        is: Joi.string().valid('mcq_single', 'mcq_multiple'),
        then: Joi.array()
            .items(Joi.string().max(500))
            .min(2)
            .max(10)
            .required()
            .messages({
                'array.min': 'MCQ questions must have at least 2 options',
                'array.max': 'MCQ questions cannot have more than 10 options',
                'any.required': 'Options are required for MCQ questions',
            }),
        otherwise: Joi.any().optional().allow(null),
    }),
    is_required: Joi.boolean()
        .optional()
        .default(true),
    question_order: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .required()
        .messages({
            'any.required': 'Question order is required',
            'number.min': 'Question order must be at least 1',
        }),
});

// ============================================================================
// CREATE JOB (with nested positions, criteria, rounds, questions)
// ============================================================================

const createJobSchema = Joi.object({
    // ---- Core job fields ----
    company_id: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid company ID format',
            'any.required': 'Company is required',
        }),

    job_title: Joi.string()
        .min(3)
        .max(300)
        .required()
        .messages({
            'string.empty': 'Job title is required',
            'string.min': 'Job title must be at least 3 characters',
            'any.required': 'Job title is required',
        }),

    job_description: Joi.string()
        .max(5000)
        .optional()
        .allow(null, ''),

    job_location: Joi.string()
        .min(2)
        .max(300)
        .required()
        .messages({
            'string.empty': 'Job location is required',
            'any.required': 'Job location is required',
        }),

    salary_package: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    salary_min: Joi.number()
        .min(0)
        .optional()
        .allow(null),

    salary_max: Joi.number()
        .min(0)
        .optional()
        .allow(null),

    bond_duration: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    bond_details: Joi.string()
        .max(1000)
        .optional()
        .allow(null, ''),

    job_type: Joi.string()
        .valid(...JOB_TYPES)
        .required()
        .messages({
            'any.only': `Job type must be one of: ${JOB_TYPES.join(', ')}`,
            'any.required': 'Job type is required',
        }),

    internship_duration: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    internship_stipend: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    passout_years: Joi.array()
        .items(
            Joi.number()
                .integer()
                .min(2020)
                .max(2040)
        )
        .min(1)
        .max(5)
        .required()
        .messages({
            'array.min': 'At least one passout year is required',
            'array.max': 'Cannot specify more than 5 passout years',
            'any.required': 'Passout years are required',
        }),

    application_deadline: Joi.date()
        .iso()
        .required()
        .messages({
            'date.format': 'Application deadline must be a valid ISO date',
            'any.required': 'Application deadline is required',
        }),

    // ---- Nested arrays ----
    positions: Joi.array()
        .items(positionSchema)
        .min(1)
        .max(20)
        .required()
        .messages({
            'array.min': 'At least one position is required',
            'array.max': 'Maximum 20 positions allowed',
            'any.required': 'Positions are required',
        }),

    eligibility_criteria: criteriaSchema
        .optional()
        .allow(null),

    rounds: Joi.array()
        .items(roundSchema)
        .max(20)
        .optional()
        .allow(null),

    questions: Joi.array()
        .items(questionSchema)
        .max(30)
        .optional()
        .allow(null),
});

// ============================================================================
// LIST JOBS (query params)
// ============================================================================

const listJobsSchema = Joi.object({
    passout_year: Joi.number()
        .integer()
        .min(2020)
        .max(2040)
        .optional(),

    job_status: Joi.string()
        .valid(...JOB_STATUSES)
        .optional()
        .messages({
            'any.only': `Status must be one of: ${JOB_STATUSES.join(', ')}`,
        }),

    company_id: Joi.string()
        .uuid()
        .optional(),

    job_type: Joi.string()
        .valid(...JOB_TYPES)
        .optional(),

    search: Joi.string()
        .max(100)
        .optional(),

    sort_by: Joi.string()
        .valid('job_title', 'created_at', 'application_deadline')
        .optional()
        .default('created_at'),

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
        .default(20),
});

// ============================================================================
// UPDATE JOB (core fields only — positions/rounds managed separately in future)
// ============================================================================

const updateJobSchema = Joi.object({
    job_title: Joi.string()
        .min(3)
        .max(300)
        .optional(),

    job_description: Joi.string()
        .max(5000)
        .optional()
        .allow(null, ''),

    job_location: Joi.string()
        .min(2)
        .max(300)
        .optional(),

    salary_package: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    salary_min: Joi.number()
        .min(0)
        .optional()
        .allow(null),

    salary_max: Joi.number()
        .min(0)
        .optional()
        .allow(null),

    bond_duration: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    bond_details: Joi.string()
        .max(1000)
        .optional()
        .allow(null, ''),

    job_type: Joi.string()
        .valid(...JOB_TYPES)
        .optional(),

    internship_duration: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    internship_stipend: Joi.string()
        .max(100)
        .optional()
        .allow(null, ''),

    passout_years: Joi.array()
        .items(
            Joi.number()
                .integer()
                .min(2020)
                .max(2040)
        )
        .min(1)
        .max(5)
        .optional(),

    application_deadline: Joi.date()
        .iso()
        .optional(),

    allow_applications: Joi.boolean()
        .optional(),
}).min(1).messages({
    'object.min': 'At least one field must be provided to update',
});

// ============================================================================
// UPDATE JOB STATUS
// ============================================================================

const updateJobStatusSchema = Joi.object({
    job_status: Joi.string()
        .valid(...JOB_STATUSES)
        .required()
        .messages({
            'any.only': `Status must be one of: ${JOB_STATUSES.join(', ')}`,
            'any.required': 'Job status is required',
        }),
});

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// PARAM SCHEMAS — UUID validation for route parameters
// ============================================================================

const jobIdParamSchema = Joi.object({
    jobId: Joi.string().uuid().required().messages({
        'string.guid': 'Invalid job ID format',
        'any.required': 'Job ID is required',
    }),
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    createJobSchema,
    listJobsSchema,
    updateJobSchema,
    updateJobStatusSchema,
    jobIdParamSchema,
};
