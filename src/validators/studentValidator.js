/**
 * ============================================================================
 * STUDENT VALIDATORS - Request Validation Schemas (UPDATED)
 * ============================================================================
 * Joi schemas for student API endpoints
 */

const Joi = require('joi');
const { VALIDATION, STATUS } = require('../config/constants');

/**
 * Register student schema
 * Validates student registration request body
 */
const registerStudentSchema = Joi.object({
  college_id: Joi.string()
    .required()
    .messages({
      'string.empty': 'College ID is required',
      'any.required': 'College ID is required'
    }),

  student_name: Joi.string()
    .min(VALIDATION.STRING_MIN_LENGTH)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Student name is required',
      'string.min': `Minimum ${VALIDATION.STRING_MIN_LENGTH} characters`,
      'string.max': 'Student name cannot exceed 100 characters',
      'any.required': 'Student name is required'
    }),

  student_email: Joi.string()
    .email()
    .required()
    .messages({
      'string.empty': 'Student email is required',
      'string.email': 'Invalid email format',
      'any.required': 'Student email is required'
    }),

  student_password: Joi.string()
    .min(VALIDATION.PASSWORD_MIN_LENGTH)
    .max(VALIDATION.PASSWORD_MAX_LENGTH)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.empty': 'Student password is required',
      'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
      'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
      'string.pattern.base': 'Password must contain uppercase, lowercase, and numeric characters',
      'any.required': 'Student password is required'
    }),

  student_department: Joi.string()
    .min(VALIDATION.STRING_MIN_LENGTH)
    .max(50)
    .required()
    .messages({
      'string.empty': 'Student department is required',
      'string.min': `Minimum ${VALIDATION.STRING_MIN_LENGTH} characters`,
      'string.max': 'Student department cannot exceed 50 characters',
      'any.required': 'Student department is required'
    }),

  student_year: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .required()
    .messages({
      'number.base': 'Student year must be a number',
      'number.min': 'Student year must be at least 1',
      'number.max': 'Student year cannot exceed 4',
      'any.required': 'Student year is required'
    })
});

/**
 * Bulk register students schema
 * Validates bulk registration request body
 */
const bulkRegisterStudentsSchema = Joi.object({
  students: Joi.array()
    .items(
      Joi.object({
        student_name: Joi.string()
          .min(VALIDATION.STRING_MIN_LENGTH)
          .max(100)
          .required(),
        student_email: Joi.string()
          .email()
          .required(),
        student_password: Joi.string()
          .min(VALIDATION.PASSWORD_MIN_LENGTH)
          .max(VALIDATION.PASSWORD_MAX_LENGTH)
          .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .required(),
        student_department: Joi.string()
          .min(VALIDATION.STRING_MIN_LENGTH)
          .max(50)
          .required(),
        student_year: Joi.number()
          .integer()
          .min(1)
          .max(4)
          .required()
      })
    )
    .min(1)
    .required()
    .messages({
      'array.base': 'Students must be an array',
      'array.min': 'At least one student is required',
      'any.required': 'Students array is required'
    })
});

/**
 * Login student schema
 * Validates student login request body
 */
const loginStudentSchema = Joi.object({
  college_id: Joi.string()
    .required()
    .messages({
      'string.empty': 'College ID is required',
      'any.required': 'College ID is required'
    }),

  student_email: Joi.string()
    .email()
    .required()
    .messages({
      'string.empty': 'Student email is required',
      'string.email': 'Invalid email format',
      'any.required': 'Student email is required'
    }),

  student_password: Joi.string()
    .min(VALIDATION.PASSWORD_MIN_LENGTH)
    .max(VALIDATION.PASSWORD_MAX_LENGTH)
    .required()
    .messages({
      'string.empty': 'Student password is required',
      'string.min': `Minimum ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
      'string.max': `Maximum ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
      'any.required': 'Student password is required'
    })
});

/**
 * Update password schema
 * Validates password change request body
 */
const updatePasswordSchema = Joi.object({
  old_password: Joi.string()
    .min(VALIDATION.PASSWORD_MIN_LENGTH)
    .max(VALIDATION.PASSWORD_MAX_LENGTH)
    .required()
    .messages({
      'string.empty': 'Old password is required',
      'any.required': 'Old password is required'
    }),

  new_password: Joi.string()
    .min(VALIDATION.PASSWORD_MIN_LENGTH)
    .max(VALIDATION.PASSWORD_MAX_LENGTH)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.empty': 'New password is required',
      'string.min': `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters`,
      'string.max': `Password cannot exceed ${VALIDATION.PASSWORD_MAX_LENGTH} characters`,
      'string.pattern.base': 'Password must contain uppercase, lowercase, and numeric characters',
      'any.required': 'New password is required'
    })
});

/**
 * Update profile schema
 * Validates student profile update request body
 */
const personalInfoSchema = Joi.object({
  first_name: Joi.string().min(2).max(50).required(),

  middle_name: Joi.string().allow('', null),

  last_name: Joi.string().min(2).max(50).required(),


  mobile_number: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),

  birth_date: Joi.date().iso().required(),

  gender: Joi.string()
    .valid('Male', 'Female', 'Other')
    .required(),

aadhaar_number: Joi.string()
  .pattern(/^\d{12}$/)
  .optional(),

  caste: Joi.string().optional(),

  blood_group: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .optional(),

  father_name: Joi.string().optional(),

  father_mobile_number: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .optional(),

  father_occupation: Joi.string().optional(),

  mother_name: Joi.string().optional(),

  mother_mobile_number: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .optional(),

  mother_occupation: Joi.string().optional(),

  city: Joi.string().required(),

  district: Joi.string().optional(),

  state: Joi.string().required(),

  pincode: Joi.string()
    .pattern(/^\d{6}$/)
    .required(),

  local_address: Joi.string().required()
}).required();


const academicInfoSchema = Joi.object({
  prn_number: Joi.string().required(),

  tenth_percentage: Joi.number().min(0).max(100).required(),

  twelfth_or_diploma: Joi.string()
    .valid('12th', 'Diploma')
    .required(),

  diploma_or_12th_percentage: Joi.number().min(0).max(100).required(),

  admission_based_on: Joi.string().optional(),

  department: Joi.string().required(),
  division: Joi.string().optional(),

  passout_year: Joi.number().integer().min(2000).max(2100).required(),

  sem1_cgpa: Joi.number().min(0).max(10).optional(),
  sem1_backlog: Joi.boolean().optional(),

  sem2_cgpa: Joi.number().min(0).max(10).optional(),
  sem2_backlog: Joi.boolean().optional(),

  sem3_cgpa: Joi.number().min(0).max(10).optional(),
  sem3_backlog: Joi.boolean().optional(),

  sem4_cgpa: Joi.number().min(0).max(10).optional(),
  sem4_backlog: Joi.boolean().optional(),

  sem5_cgpa: Joi.number().min(0).max(10).optional(),
  sem5_backlog: Joi.boolean().optional(),

  sem6_cgpa: Joi.number().min(0).max(10).optional(),
  sem6_backlog: Joi.boolean().optional(),

  sem7_cgpa: Joi.number().min(0).max(10).optional(),
  sem7_backlog: Joi.boolean().optional(),
  
  sem8_cgpa: Joi.number().min(0).max(10).optional(),
  sem8_backlog: Joi.boolean().optional(),
  
  overall_cgpa: Joi.number().min(0).max(10).optional(),

  any_live_kt: Joi.boolean().optional(),

  any_gap_during_education: Joi.boolean().required(),

  gap_reason: Joi.when('any_gap_during_education', {
  is: true,
  then: Joi.string().min(3).required(),
  otherwise: Joi.string()
    .allow(null)
    .empty('')
    .optional()
})

}).required();

const skillInfoSchema = Joi.object({
  project_title_1: Joi.string().optional(),
  project_link_1: Joi.string().uri().optional(),
  project_description_1: Joi.string().optional(),

  project_title_2: Joi.string().optional(),
  project_link_2: Joi.string().uri().optional(),
  project_description_2: Joi.string().optional(),

  personal_portfolio_link: Joi.string().uri().optional(),

  resume_drive_link: Joi.string().uri().optional(),

  github_link: Joi.string().uri().optional(),
  linkedin_link: Joi.string().uri().optional(),
  instagram_link: Joi.string().uri().optional(),
  twitter_link: Joi.string().uri().optional(),

  leetcode_link: Joi.string().uri().optional(),
  geeksforgeeks_link: Joi.string().uri().optional(),
  codechef_link: Joi.string().uri().optional(),
  hackerrank_link: Joi.string().uri().optional(),

  area_of_interest: Joi.string().optional(),

  about_you: Joi.string().required(),

  profile_image: Joi.string().uri().optional()
}).required();


const updatePersonalInfoSchema = Joi.object({
  first_name: Joi.string().optional(),
  middle_name: Joi.string().optional().allow(null, ''),
  last_name: Joi.string().optional(),

  mobile_number: Joi.string().length(10).optional(),
  birth_date: Joi.date().iso().optional(),
  gender: Joi.string().valid('Male', 'Female', 'Other').optional(),

  aadhaar_number: Joi.string().length(12).optional(),
  caste: Joi.string().optional(),
  blood_group: Joi.string().optional(),

  father_name: Joi.string().optional(),
  father_mobile_number: Joi.string().length(10).optional(),
  father_occupation: Joi.string().optional(),

  mother_name: Joi.string().optional(),
  mother_mobile_number: Joi.string().length(10).optional(),
  mother_occupation: Joi.string().optional(),

  city: Joi.string().optional(),
  district: Joi.string().optional(),
  state: Joi.string().optional(),
  pincode: Joi.string().length(6).optional(),
  local_address: Joi.string().optional()
})
.min(1); 


const updateAcademicInfoSchema = Joi.object({
  prn_number: Joi.string().optional(),

  tenth_percentage: Joi.number().min(0).max(100).optional(),

  twelfth_or_diploma: Joi.string()
    .valid('12th', 'Diploma')
    .optional(),

  diploma_or_12th_percentage: Joi.number().min(0).max(100).optional(),

  admission_based_on: Joi.string().optional(),

  department: Joi.string().optional(),
  division: Joi.string().optional(),

  passout_year: Joi.number().integer().min(2000).max(2100).optional(),

  sem1_cgpa: Joi.number().min(0).max(10).optional(),
  sem1_backlog: Joi.boolean().optional(),

  sem2_cgpa: Joi.number().min(0).max(10).optional(),
  sem2_backlog: Joi.boolean().optional(),

  sem3_cgpa: Joi.number().min(0).max(10).optional(),
  sem3_backlog: Joi.boolean().optional(),

  sem4_cgpa: Joi.number().min(0).max(10).optional(),
  sem4_backlog: Joi.boolean().optional(),

  sem5_cgpa: Joi.number().min(0).max(10).optional(),
  sem5_backlog: Joi.boolean().optional(),

  sem6_cgpa: Joi.number().min(0).max(10).optional(),
  sem6_backlog: Joi.boolean().optional(),

  sem7_cgpa: Joi.number().min(0).max(10).optional(),
  sem7_backlog: Joi.boolean().optional(),

  sem8_cgpa: Joi.number().min(0).max(10).optional(),
  sem8_backlog: Joi.boolean().optional(),

  overall_cgpa: Joi.number().min(0).max(10).optional(),

  any_live_kt: Joi.boolean().optional(),

  any_gap_during_education: Joi.boolean().optional(),

  gap_reason: Joi.when('any_gap_during_education', {
    is: true,
    then: Joi.string().min(3).required(),
    otherwise: Joi.string().allow(null).empty('').optional()
  })
})
.min(1); 


const updateSkillInfoSchema = Joi.object({
  project_title_1: Joi.string().optional(),
  project_link_1: Joi.string().uri().optional(),
  project_description_1: Joi.string().optional(),

  project_title_2: Joi.string().optional(),
  project_link_2: Joi.string().uri().optional(),
  project_description_2: Joi.string().optional(),

  personal_portfolio_link: Joi.string().uri().optional(),

  resume_drive_link: Joi.string().uri().optional(),

  github_link: Joi.string().uri().optional(),
  linkedin_link: Joi.string().uri().optional(),
  instagram_link: Joi.string().uri().optional(),
  twitter_link: Joi.string().uri().optional(),

  leetcode_link: Joi.string().uri().optional(),
  geeksforgeeks_link: Joi.string().uri().optional(),
  codechef_link: Joi.string().uri().optional(),
  hackerrank_link: Joi.string().uri().optional(),

  area_of_interest: Joi.string().optional(),

  about_you: Joi.string().optional(),

  profile_image: Joi.string().uri().optional()
})
.min(1); 

module.exports = {
  registerStudentSchema,
  bulkRegisterStudentsSchema,
  loginStudentSchema,
  updatePasswordSchema,
  personalInfoSchema,
  academicInfoSchema,
  skillInfoSchema,
  updatePersonalInfoSchema,
  updateAcademicInfoSchema,
  updateSkillInfoSchema
};