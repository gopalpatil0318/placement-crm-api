/**
 * ============================================================================
 * CONSTANTS.JS — Centralized Application Constants
 * ============================================================================
 * All enums, messages, config values aligned with the full schema (36 tables)
 * and 175 API endpoints. Every magic string lives here.
 * ============================================================================
 */

// ============================================================================
// USER ROLES (matches users.user_role CHECK constraint)
// ============================================================================
const ROLES = Object.freeze({
  SYSADMIN: 'sysadmin',
  COLLEGEADMIN: 'collegeadmin',
  TEACHER: 'teacher',
  HOD: 'hod',
  TPO: 'tpo',
});

const ROLE_HIERARCHY = Object.freeze({
  [ROLES.SYSADMIN]: 100,
  [ROLES.COLLEGEADMIN]: 80,
  [ROLES.TPO]: 70,
  [ROLES.HOD]: 60,
  [ROLES.TEACHER]: 50,
});

const VALID_ROLES = Object.values(ROLES);

// ============================================================================
// STATUS ENUMS (matching all schema CHECK constraints)
// ============================================================================
const STATUS = Object.freeze({
  // Generic
  ACTIVE: 'active',
  INACTIVE: 'inactive',

  // students.student_status
  STUDENT: Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    GRADUATED: 'graduated',
    DROPOUT: 'dropout',
  }),

  // colleges.college_status
  COLLEGE: Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  }),

  // users.user_status
  USER: Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  }),

  // job_postings.job_status
  JOB: Object.freeze({
    DRAFT: 'draft',
    PUBLISHED: 'published',
    CLOSED: 'closed',
    CANCELLED: 'cancelled',
  }),

  // student_applications.application_status
  APPLICATION: Object.freeze({
    PENDING: 'pending',
    UNDER_REVIEW: 'under_review',
    SHORTLISTED: 'shortlisted',
    REJECTED: 'rejected',
    SELECTED: 'selected',
    OFFERED: 'offered',
    WITHDRAWN: 'withdrawn',
  }),

  // job_rounds.round_status
  ROUND: Object.freeze({
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  }),

  // student_round_results.result_status
  ROUND_RESULT: Object.freeze({
    PENDING: 'pending',
    PASSED: 'passed',
    FAILED: 'failed',
    ON_HOLD: 'on_hold',
    ABSENT: 'absent',
  }),

  // placement_results.placement_status
  PLACEMENT: Object.freeze({
    OFFERED: 'offered',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    JOINED: 'joined',
    CANCELLED: 'cancelled',
  }),

  // job_positions.position_status
  POSITION: Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    FILLED: 'filled',
  }),

  // student_semester_grades.semester_status
  SEMESTER: Object.freeze({
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    DETAINED: 'detained',
    FAILED: 'failed',
  }),

  // student_restrictions.restriction_type
  RESTRICTION: Object.freeze({
    BAR_FROM_PLACEMENTS: 'bar_from_placements',
    BAR_FROM_COMPANY: 'bar_from_company',
    PROBATION: 'probation',
    WARNING: 'warning',
    TEMPORARY_SUSPENSION: 'temporary_suspension',
  }),

  // training_programs.program_status
  TRAINING: Object.freeze({
    UPCOMING: 'upcoming',
    ENROLLMENT_OPEN: 'enrollment_open',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  }),

  // training_enrollments.completion_status
  ENROLLMENT: Object.freeze({
    ENROLLED: 'enrolled',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    DROPPED: 'dropped',
    FAILED: 'failed',
  }),

  // companies.company_status
  COMPANY: Object.freeze({
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  }),
});

// ============================================================================
// HTTP STATUS CODES
// ============================================================================
const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

// ============================================================================
// AUTH CONSTANTS
// ============================================================================
const AUTH = Object.freeze({
  SALT_ROUNDS: 10,
  JWT_TOKEN_SPLIT_INDEX: 1,
  PASSWORD_MIN_LENGTH: 8,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
});

// ============================================================================
// ERROR MESSAGES
// ============================================================================
const ERROR_MESSAGES = Object.freeze({
  // Authentication
  MISSING_AUTH_HEADER: 'Authorization header is required',
  INVALID_AUTH_HEADER: 'Invalid authorization format. Use: Bearer <token>',
  INVALID_TOKEN: 'Session expired or invalid. Please log in again',
  INVALID_CREDENTIALS: 'Incorrect email or password',
  UNAUTHORIZED: 'You must be logged in to access this resource',
  FORBIDDEN: 'You do not have permission to perform this action',
  ACCOUNT_INACTIVE: 'Your account has been deactivated. Contact your administrator',
  COLLEGE_INACTIVE: 'Your college account is deactivated. Contact system administrator',

  // Validation
  MISSING_REQUIRED_FIELDS: 'Please fill in all required fields',
  INVALID_EMAIL_FORMAT: 'Please enter a valid email address',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters long',
  INVALID_ROLE: 'Invalid user role specified',
  INVALID_STATUS: 'Invalid status value',
  INVALID_UUID: 'Invalid ID format provided',
  VALIDATION_FAILED: 'Please check your input and try again',

  // Resource conflicts
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists',
  SUBDOMAIN_ALREADY_EXISTS: 'This college subdomain is already taken',
  DUPLICATE_ENTRY: 'This record already exists',

  // Not found
  COLLEGE_NOT_FOUND: 'College not found',
  USER_NOT_FOUND: 'User not found',
  STUDENT_NOT_FOUND: 'Student not found',
  DEPARTMENT_NOT_FOUND: 'Department not found',
  COMPANY_NOT_FOUND: 'Company not found',
  JOB_NOT_FOUND: 'Job posting not found',
  APPLICATION_NOT_FOUND: 'Application not found',
  PLACEMENT_NOT_FOUND: 'Placement record not found',
  ROUND_NOT_FOUND: 'Selection round not found',
  RESTRICTION_NOT_FOUND: 'Restriction not found',
  TRAINING_NOT_FOUND: 'Training program not found',
  NOTIFICATION_NOT_FOUND: 'Notification not found',
  POLICY_NOT_FOUND: 'Placement policy not found',
  SKILL_NOT_FOUND: 'Skill not found',
  RESOURCE_NOT_FOUND: 'The requested resource was not found',

  // Business logic
  PROFILE_NOT_APPROVED: 'Your profile must be approved before you can apply for jobs',
  PROFILE_INCOMPLETE: 'Please complete your profile before proceeding',
  NOT_ELIGIBLE: 'You do not meet the eligibility criteria for this job',
  ALREADY_APPLIED: 'You have already applied to this job',
  DEADLINE_PASSED: 'The application deadline has passed',
  JOB_NOT_PUBLISHED: 'This job is not currently accepting applications',
  STUDENT_RESTRICTED: 'You are currently restricted from applying to placements',
  MAX_PLACEMENTS_REACHED: 'Maximum allowed placements reached',
  ROUND_SEQUENCE_INVALID: 'Student must pass previous round before proceeding',
  ALREADY_ENROLLED: 'You are already enrolled in this program',
  ENROLLMENT_CLOSED: 'Enrollment for this program is closed',

  // Permissions
  ONLY_SYSADMIN: 'Only system administrators can perform this action',
  ONLY_ADMIN: 'Only college admins can perform this action',
  COLLEGE_ACCESS_REQUIRED: 'College access is required for this action',

  // Database
  DATABASE_ERROR: 'A database error occurred. Please try again',
  TRANSACTION_FAILED: 'Operation failed and has been rolled back. Please try again',

  // General
  SERVER_ERROR: 'Something went wrong. Please try again later',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please slow down and try again',
  INVALID_REQUEST: 'Invalid request. Please check your input',
});

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================
const SUCCESS_MESSAGES = Object.freeze({
  // Auth
  LOGIN_SUCCESSFUL: 'Welcome back! Logged in successfully',
  LOGOUT_SUCCESSFUL: 'Logged out successfully',
  PASSWORD_CHANGED: 'Password changed successfully',
  PASSWORD_RESET_SENT: 'Password reset instructions sent to your email',
  PASSWORD_RESET_SUCCESS: 'Password has been reset successfully',

  // College
  COLLEGE_CREATED: 'College created successfully',
  COLLEGE_UPDATED: 'College updated successfully',
  COLLEGE_ACTIVATED: 'College activated successfully',
  COLLEGE_DEACTIVATED: 'College deactivated successfully',
  COLLEGE_FEATURES_UPDATED: 'College features updated successfully',

  // User
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  USER_ACTIVATED: 'User account activated',
  USER_DEACTIVATED: 'User account deactivated',

  // Department
  DEPARTMENT_CREATED: 'Department created successfully',
  DEPARTMENT_UPDATED: 'Department updated successfully',

  // Student
  STUDENT_REGISTERED: 'Student registered successfully',
  STUDENTS_BULK_REGISTERED: 'Bulk student registration completed',
  STUDENT_UPDATED: 'Student information updated',
  STUDENT_PROFILE_APPROVED: 'Student profile approved',
  STUDENT_PROFILE_REJECTED: 'Student profile sent back for corrections',

  // Company
  COMPANY_CREATED: 'Company added successfully',
  COMPANY_UPDATED: 'Company information updated',
  CONTACT_ADDED: 'Contact person added successfully',
  CONTACT_UPDATED: 'Contact information updated',

  // Job
  JOB_CREATED: 'Job posting created successfully',
  JOB_UPDATED: 'Job posting updated',
  JOB_PUBLISHED: 'Job is now live and visible to students',
  JOB_CLOSED: 'Job posting closed',

  // Application
  APPLICATION_SUBMITTED: 'Application submitted successfully. Good luck!',
  APPLICATION_WITHDRAWN: 'Application withdrawn successfully',
  APPLICATION_STATUS_UPDATED: 'Application status updated',

  // Placement
  PLACEMENT_CREATED: 'Placement record created successfully',
  PLACEMENT_UPDATED: 'Placement record updated',
  OFFER_ACCEPTED: 'Congratulations! Offer accepted successfully',
  OFFER_REJECTED: 'Offer declined',
  OFFER_LETTER_VERIFIED: 'Offer letter verified successfully',

  // Round
  ROUND_ADDED: 'Selection round added',
  ROUND_UPDATED: 'Round details updated',
  ROUND_RESULTS_ADDED: 'Round results recorded successfully',

  // Policy
  POLICY_CREATED: 'Placement policy created',
  POLICY_UPDATED: 'Placement policy updated',
  POLICY_DELETED: 'Placement policy removed',

  // Restriction
  RESTRICTION_ADDED: 'Student restriction applied',
  RESTRICTION_UPDATED: 'Restriction updated',
  APPEAL_SUBMITTED: 'Appeal submitted successfully. You will be notified of the outcome',

  // Training
  TRAINING_CREATED: 'Training program created',
  TRAINING_UPDATED: 'Training program updated',
  ENROLLMENT_SUCCESS: 'Successfully enrolled in the training program',
  FEEDBACK_SUBMITTED: 'Thank you for your feedback!',

  // Notification
  NOTIFICATION_SENT: 'Notification sent successfully',
  NOTIFICATIONS_MARKED_READ: 'Notifications marked as read',

  // Skills
  SKILL_CREATED: 'Skill added successfully',
  SKILL_UPDATED: 'Skill updated',
  SKILL_REMOVED: 'Skill removed from your profile',

  // Profile
  PROFILE_UPDATED: 'Profile updated successfully',
  PROFILE_LINKS_UPDATED: 'Profile links updated',

  // Generic
  FETCHED_SUCCESSFULLY: 'Data retrieved successfully',
  DELETED_SUCCESSFULLY: 'Record deleted successfully',
  STATUS_UPDATED: 'Status updated successfully',
});

// ============================================================================
// LOGGING CONSTANTS
// ============================================================================
const LOG = Object.freeze({
  API_START: '[API_START]',
  API_END: '[API_END]',
  API_ERROR: '[API_ERROR]',
  DB_QUERY: '[DB_QUERY]',
  DB_SLOW: '[DB_SLOW]',
  DB_ERROR: '[DB_ERROR]',
  TRANSACTION: '[TRANSACTION]',
  SECURITY: '[SECURITY]',
  AUTH: '[AUTH]',
  STARTUP: '[STARTUP]',
  SHUTDOWN: '[SHUTDOWN]',
});

// ============================================================================
// PAGINATION DEFAULTS
// ============================================================================
const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
});

// ============================================================================
// VALIDATION CONSTRAINTS
// ============================================================================
const VALIDATION = Object.freeze({
  STRING_MIN_LENGTH: 2,
  STRING_MAX_LENGTH: 200,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 255,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  PHONE_LENGTH: 10,
  PINCODE_LENGTH: 6,
  AADHAAR_LENGTH: 12,
});

// ============================================================================
// PROFILE COMPLETION WEIGHTS
// ============================================================================
const PROFILE_COMPLETION_WEIGHTS = Object.freeze({
  PERSONAL_INFO: 20,
  ACADEMIC_INFO: 20,
  SEMESTER_GRADES: 15,
  SKILLS: 15,
  PROFILE_LINKS: 10,
  PROJECTS: 10,
  EXPERIENCE: 5,
  CERTIFICATES: 5,
});

// ============================================================================
// DATABASE ERROR CODES (PostgreSQL)
// ============================================================================
const DB_ERROR_CODES = Object.freeze({
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
});

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================
const RATE_LIMIT = Object.freeze({
  // Auth endpoints (strict — brute force protection)
  WINDOW_MS_AUTH: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS_AUTH: 5,

  // General API endpoints (moderate)
  WINDOW_MS_API: 1 * 60 * 1000, // 1 minute
  MAX_REQUESTS_API: 50,
});

// ============================================================================
// APPLICATION META
// ============================================================================
const APP = Object.freeze({
  NAME: 'Placement CRM API',
  VERSION: '2.0.0',
  API_PREFIX: '/api',
});

// ============================================================================
// COLLEGE TYPES (matches schema CHECK constraint)
// ============================================================================
const COLLEGE_TYPES = Object.freeze([
  'engineering', 'diploma', 'mba', 'polytechnic', 'degree', 'medical'
]);

// ============================================================================
// ENABLED FEATURES
// ============================================================================
const FEATURES = Object.freeze({
  CORE: 'core',
  TRAINING: 'training',
  FEEDBACK: 'feedback',
  INTERVIEW_QUESTIONS: 'interview_questions',
});

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  VALID_ROLES,
  STATUS,
  HTTP_STATUS,
  AUTH,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  LOG,
  PAGINATION,
  VALIDATION,
  PROFILE_COMPLETION_WEIGHTS,
  DB_ERROR_CODES,
  RATE_LIMIT,
  APP,
  COLLEGE_TYPES,
  FEATURES,
};