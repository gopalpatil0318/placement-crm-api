/**
 * ============================================================================
 * CONSTANTS.JS - Centralized Application Constants
 * ============================================================================
 * All magic strings, configuration values, and constants are defined here
 * to ensure maintainability, reduce duplication, and enable single-point updates.
 * ============================================================================
 */

// ============================================================================
// DATABASE CONSTANTS
// ============================================================================
const DB = {
  CONNECTION_TIMEOUT: 5000, // ms
  QUERY_TIMEOUT: 30000, // ms
  POOL_MIN_CONNECTIONS: 2,
  POOL_MAX_CONNECTIONS: 20,
  POOL_IDLE_TIMEOUT: 30000, // ms
  POOL_REUSE_COUNT: 1000
};

// ============================================================================
// USER & AUTHENTICATION CONSTANTS
// ============================================================================
const AUTH = {
  SALT_ROUNDS: 10,
  JWT_TOKEN_SPLIT_INDEX: 1,
  PASSWORD_MIN_LENGTH: 8,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  SUBDOMAIN_REGEX: /^[a-z0-9-]+$/,
  SUBDOMAIN_MIN_LENGTH: 2,
  SUBDOMAIN_MAX_LENGTH: 50
};

// ============================================================================
// USER ROLES & PERMISSIONS
// ============================================================================
const ROLES = {
  SYSADMIN: 'sysadmin',
  COLLEGEADMIN: 'collegeadmin',
  ADMIN: 'admin',
  TEACHER: 'teacher',
  STUDENT: 'student'
};

const ROLE_HIERARCHY = {
  [ROLES.SYSADMIN]: 100,
  [ROLES.COLLEGEADMIN]: 80,
  [ROLES.ADMIN]: 60,
  [ROLES.TEACHER]: 50,
  [ROLES.STUDENT]: 10
};

const VALID_ROLES = Object.values(ROLES);

// ============================================================================
// STATUS CONSTANTS
// ============================================================================
const STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

// ============================================================================
// HTTP STATUS CODES
// ============================================================================
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

// ============================================================================
// ERROR MESSAGES
// ============================================================================
const ERROR_MESSAGES = {
  // Authentication
  MISSING_AUTH_HEADER: 'Missing Authorization header',
  INVALID_AUTH_HEADER: 'Invalid Authorization header format',
  INVALID_TOKEN: 'Invalid or expired token',
  INVALID_CREDENTIALS: 'Invalid email or password',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden - insufficient permissions',

  // Validation
  MISSING_REQUIRED_FIELDS: 'Missing required fields',
  INVALID_EMAIL_FORMAT: 'Invalid email format',
  INVALID_SUBDOMAIN_FORMAT: 'Subdomain must be lowercase alphanumeric with hyphens only',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters',
  INVALID_ROLE: 'Invalid user role provided',
  INVALID_STATUS: 'Invalid status value',

  // Resource conflicts
  EMAIL_ALREADY_EXISTS: 'Email already exists in system',
  SUBDOMAIN_ALREADY_EXISTS: 'College subdomain already exists',
  COLLEGE_NOT_FOUND: 'College not found',
  USER_NOT_FOUND: 'User not found',
  STUDENT_NOT_FOUND: 'Student not found',

  // Permissions
  ONLY_SYSADMIN: 'Only system administrator can perform this action',
  ONLY_ADMIN: 'Only college admin can perform this action',

  // Database
  DATABASE_ERROR: 'Database operation failed',
  TRANSACTION_FAILED: 'Transaction failed - operation rolled back',

  // General
  SERVER_ERROR: 'Internal server error',
  NOT_FOUND: 'Resource not found'
};

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================
const SUCCESS_MESSAGES = {
  LOGIN_SUCCESSFUL: 'Login successful',
  LOGOUT_SUCCESSFUL: 'Logout successful',
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  STUDENT_REGISTERED: 'Student registered successfully',
  COLLEGE_CREATED: 'College created successfully',
  COLLEGE_UPDATED: 'College updated successfully'
};

// ============================================================================
// LOGGING CONSTANTS
// ============================================================================
const LOG = {
  API_START_PREFIX: '[API_START]',
  API_END_PREFIX: '[API_END]',
  API_ERROR_PREFIX: '[API_ERROR]',
  TRANSACTION_PREFIX: '[TRANSACTION]',
  SECURITY_PREFIX: '[SECURITY]'
};

const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// ============================================================================
// REQUEST VALIDATION CONSTRAINTS
// ============================================================================
const VALIDATION = {
  STRING_MIN_LENGTH: 2,
  STRING_MAX_LENGTH: 200,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 255,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128
};

// ============================================================================
// DATABASE ERROR CODES (PostgreSQL)
// ============================================================================
const DB_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502'
};

// ============================================================================
// APPLICATION CONFIGURATION
// ============================================================================
const APP = {
  NAME: 'College Placement CRM',
  VERSION: '1.0.0',
  API_PREFIX: '/api/v1',
  DEFAULT_HOST_DOMAIN: 'pcrm.in'
};

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================
const RATE_LIMIT = {
  // Authentication endpoints (very strict)
  WINDOW_MS_AUTH: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS_AUTH: 5, // 5 attempts

  // General API endpoints (moderate)
  WINDOW_MS_API: 1 * 60 * 1000, // 1 minute
  MAX_REQUESTS_API: 50 // 50 requests
};

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  DB,
  AUTH,
  ROLES,
  ROLE_HIERARCHY,
  VALID_ROLES,
  STATUS,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  LOG,
  LOG_LEVELS,
  VALIDATION,
  DB_ERROR_CODES,
  APP,
  RATE_LIMIT
};