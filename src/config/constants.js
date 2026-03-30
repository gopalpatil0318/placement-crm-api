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
  TPC: 'tpc',
});

const ROLE_HIERARCHY = Object.freeze({
  [ROLES.SYSADMIN]: 100,
  [ROLES.COLLEGEADMIN]: 80,
  [ROLES.TPO]: 70,
  [ROLES.HOD]: 60,
  [ROLES.TPC]: 55,
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

  // notifications.notification_type (matches schema CHECK constraint)
  NOTIFICATION_TYPE: Object.freeze({
    NEW_JOB_POSTED: 'new_job_posted',
    APPLICATION_RECEIVED: 'application_received',
    APPLICATION_STATUS_CHANGED: 'application_status_changed',
    ROUND_SCHEDULED: 'round_scheduled',
    ROUND_RESULT: 'round_result',
    OFFER_RECEIVED: 'offer_received',
    DEADLINE_REMINDER: 'deadline_reminder',
    RESTRICTION_APPLIED: 'restriction_applied',
    RESTRICTION_REMOVED: 'restriction_removed',
    TRAINING_ENROLLMENT: 'training_enrollment',
    TRAINING_COMPLETED: 'training_completed',
    PROFILE_INCOMPLETE: 'profile_incomplete',
    ELIGIBILITY_OVERRIDE_REQUESTED: 'eligibility_override_requested',
    ELIGIBILITY_OVERRIDE_APPROVED: 'eligibility_override_approved',
    ELIGIBILITY_OVERRIDE_REJECTED: 'eligibility_override_rejected',
    GENERAL: 'general',
  }),

  // notifications.recipient_type
  RECIPIENT_TYPE: Object.freeze({
    STUDENT: 'student',
    USER: 'user',
  }),

  // verification_status on experience/achievements/certificates + profile_approval_status on students
  VERIFICATION: Object.freeze({
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
  }),

  // job_eligibility_override_requests.override_status
  OVERRIDE: Object.freeze({
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
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
  DEPARTMENT_ALREADY_STATUS: 'Department is already in this status',
  COMPANY_NOT_FOUND: 'Company not found',
  COMPANY_ALREADY_STATUS: 'Company is already in this status',
  CONTACT_NOT_FOUND: 'Contact not found',
  CONTACT_ALREADY_STATUS: 'Contact is already in this status',
  JOB_NOT_FOUND: 'Job posting not found',
  APPLICATION_NOT_FOUND: 'Application not found',
  APPLICATION_ALREADY_STATUS: 'Application is already in this status',
  INVALID_APPLICATION_TRANSITION: 'Invalid application status transition',
  PLACEMENT_NOT_FOUND: 'Placement record not found',
  PLACEMENT_NOT_OFFERED_ACCEPT: 'Only offers with status "offered" can be accepted',
  PLACEMENT_NOT_OFFERED_REJECT: 'Only offers with status "offered" can be rejected',
  PLACEMENT_ALREADY_ACCEPTED: 'You have already accepted this offer',
  PLACEMENT_ALREADY_REJECTED: 'You have already rejected this offer',
  PLACEMENT_ALREADY_ACCEPTED_CANNOT_REJECT: 'This offer has already been accepted and cannot be rejected',
  PLACEMENT_ALREADY_REJECTED_CANNOT_ACCEPT: 'This offer has already been rejected and cannot be accepted',
  PLACEMENT_DUPLICATE_APPLICATION: 'Placement record already exists for this application',
  APPLICATION_NOT_ELIGIBLE_FOR_PLACEMENT: 'Application must be "selected" or "offered" to create a placement',
  JOINING_DATE_MUST_BE_FUTURE: 'Full-time joining date must be in the future',
  INTERNSHIP_START_DATE_MUST_BE_FUTURE: 'Internship start date must be in the future',
  PLACEMENT_NOT_UPDATEABLE: 'Cannot update a terminal placement record',
  PLACEMENT_NO_FIELDS_TO_UPDATE: 'No valid fields provided for update',
  OFFER_LETTER_NO_URL: 'Cannot verify offer letter — no offer letter URL uploaded yet',
  OFFER_LETTER_TERMINAL_STATUS: 'Cannot verify offer for a terminal placement',
  PLACEMENT_ALREADY_STATUS: 'Placement is already in this status',
  INVALID_PLACEMENT_TRANSITION: 'Invalid placement status transition',
  ROUND_NOT_FOUND: 'Selection round not found',
  RESTRICTION_NOT_FOUND: 'Restriction not found',
  RESTRICTION_DUPLICATE_ACTIVE: 'Student already has an active restriction of this type',
  RESTRICTION_VALID_UNTIL_PAST: 'Valid until date must be today or in the future',
  APPEAL_INACTIVE_RESTRICTION: 'Cannot appeal a restriction that is no longer active',
  APPEAL_ALREADY_SUBMITTED: 'An appeal has already been submitted for this restriction',
  TRAINING_NOT_FOUND: 'Training program not found',
  TRAINING_DUPLICATE_NAME: 'A training program with this name already exists',
  TRAINING_INVALID_DEPT_IDS: 'One or more department IDs are invalid or do not belong to your college',
  TRAINING_END_BEFORE_START: 'End date must be on or after the start date',
  TRAINING_CANCELLED_NOT_UPDATABLE: 'Cannot update a cancelled training program',
  TRAINING_NO_FIELDS: 'No valid fields to update',
  TRAINING_INVALID_TRANSITION: 'Invalid training status transition',
  ENROLLMENT_NOT_FOUND: 'Enrollment not found',
  ENROLLMENT_CANCELLED_PROGRAM: 'Cannot update enrollment for a cancelled program',
  ENROLLMENT_SESSIONS_EXCEED: 'Sessions attended cannot exceed total sessions',
  ENROLLMENT_DEADLINE_PASSED: 'Enrollment deadline has passed',
  MAX_ENROLLMENT_REACHED: 'Maximum enrollment capacity reached',
  DEPT_NOT_ELIGIBLE: 'Your department is not eligible for this program',
  YEAR_NOT_ELIGIBLE: 'Your year is not eligible for this program',
  TRAINING_FEEDBACK_ALREADY_SUBMITTED: 'You have already submitted feedback for this program',
  TRAINING_FEEDBACK_DROP_FORBIDDEN: 'Cannot submit feedback for a dropped enrollment',
  TRAINING_FEEDBACK_NOT_STARTED: 'Cannot submit feedback before program has started',
  NOTIFICATION_NOT_FOUND: 'Notification not found',
  FEEDBACK_NOT_FOUND: 'Feedback not found',
  INTERVIEW_QUESTION_NOT_FOUND: 'Interview question not found',
  POLICY_NOT_FOUND: 'Placement policy not found',
  POLICY_DUPLICATE_TITLE: 'A policy with this title already exists for this passout year',
  POLICY_ALREADY_STATUS: 'Policy is already in this status',
  SKILL_NOT_FOUND: 'Skill not found',
  SKILL_DUPLICATE: 'A skill with this name already exists in your college',
  RESOURCE_NOT_FOUND: 'The requested resource was not found',

  // Business logic
  PROFILE_NOT_APPROVED: 'Your profile must be approved before you can apply for jobs',
  PROFILE_INCOMPLETE: 'Please complete your profile before proceeding',
  NOT_ELIGIBLE: 'You do not meet the eligibility criteria for this job',
  ALREADY_APPLIED: 'You have already applied to this job',
  STUDENT_ALREADY_STATUS: 'Student is already in this status',
  DEADLINE_PASSED: 'The application deadline has passed',
  JOB_NOT_PUBLISHED: 'This job is not currently accepting applications',
  STUDENT_RESTRICTED: 'You are currently restricted from applying to placements',
  MAX_PLACEMENTS_REACHED: 'Maximum allowed placements reached',
  ROUND_SEQUENCE_INVALID: 'Student must pass previous round before proceeding',
  ALREADY_ENROLLED: 'You are already enrolled in this program',
  ENROLLMENT_CLOSED: 'Enrollment for this program is closed',
  NO_RECIPIENTS_FOUND: 'No matching recipients found for the given criteria',
  INVALID_NOTIFICATION_TYPE: 'Invalid notification type',
  FEEDBACK_ALREADY_SUBMITTED: 'You have already submitted feedback for this job',
  FEEDBACK_FEATURE_DISABLED: 'Feedback feature is not enabled for your college',
  INTERVIEW_QUESTIONS_FEATURE_DISABLED: 'Interview questions feature is not enabled for your college',

  // Override Requests (College)
  OVERRIDE_NOT_FOUND: 'Override request not found',
  OVERRIDE_ALREADY_REVIEWED: 'Override request has already been reviewed',
  OVERRIDE_REJECTION_REASON_REQUIRED: 'Rejection reason is required when rejecting an override request',
  OVERRIDE_BULK_REJECTION_REQUIRED: 'Rejection reason is required when bulk-rejecting override requests',
  OVERRIDE_NO_IDS: 'No override IDs provided',
  OVERRIDE_NO_VALID_IDS: 'No valid override requests found for the provided IDs',
  OVERRIDE_ALL_ALREADY_REVIEWED: 'All specified override requests have already been reviewed',

  // Override Requests (Student)
  STUDENT_OVERRIDE_ALREADY_APPLIED: 'You have already applied to this job. No override needed.',
  STUDENT_OVERRIDE_PENDING: 'You already have a pending override request for this job.',
  STUDENT_OVERRIDE_APPROVED: 'Your override request was already approved. You can now apply.',
  STUDENT_OVERRIDE_REJECTED: 'Your override request was rejected. You cannot submit another request for this job.',
  STUDENT_ALREADY_ELIGIBLE: 'You are already eligible for this job. No override request needed. You can apply directly.',
  PASSOUT_YEAR_NOT_OVERRIDABLE: 'Your passout year does not match the job requirements. Passout year cannot be overridden.',

  // Student Job Browsing & Applications
  JOB_NOT_ACCEPTING: 'This job is not currently accepting applications',
  JOB_PASSOUT_YEAR_MISMATCH: 'This job is not available for your passout year',
  ALREADY_OPTED_OUT: 'You have already opted out of this job',
  CANNOT_OPT_OUT_ALREADY_APPLIED: 'Cannot opt out — you have already applied to this job',
  APPLICATION_ALREADY_WITHDRAWN: 'Application is already withdrawn',
  CANNOT_WITHDRAW_STATUS: 'Cannot withdraw application with current status',
  OVERRIDE_REJECTED: 'Your eligibility override request was rejected',
  OVERRIDE_PENDING: 'You are not eligible for this job. Your override request is pending college review.',
  NOT_ELIGIBLE_SUBMIT_OVERRIDE: 'You are not eligible for this job. Please submit an override request for college review.',
  POSITION_NOT_ACTIVE: 'Selected position not found or is no longer active',
  REQUIRED_QUESTION_NOT_ANSWERED: 'Required question not answered',
  REQUIRED_QUESTION_EMPTY: 'Required question must have an answer',
  INVALID_ANSWER_QUESTIONS: 'One or more answers reference invalid questions',

  // Verification
  EXPERIENCE_NOT_FOUND: 'Experience not found',
  ACHIEVEMENT_NOT_FOUND: 'Achievement not found',
  CERTIFICATE_NOT_FOUND: 'Certificate not found',
  REJECTION_REASON_REQUIRED: 'Rejection reason is required when rejecting',
  PROFILE_INCOMPLETE_CANNOT_APPROVE: 'Cannot approve an incomplete profile. Student must complete their profile first',
  BULK_LIMIT_EXCEEDED: 'Maximum 100 items allowed per bulk operation',

  // Permissions
  ONLY_SYSADMIN: 'Only system administrators can perform this action',
  ONLY_ADMIN: 'Only college admins can perform this action',
  COLLEGE_ACCESS_REQUIRED: 'College access is required for this action',

  // Database
  DATABASE_ERROR: 'A database error occurred. Please try again',
  TRANSACTION_FAILED: 'Operation failed and has been rolled back. Please try again',

  // Job
  INACTIVE_COMPANY: 'Cannot create a job for an inactive company. Activate the company first',
  DEADLINE_MUST_BE_FUTURE: 'Application deadline must be in the future',
  SALARY_MIN_EXCEEDS_MAX: 'Minimum salary cannot be greater than maximum salary',
  JOB_NOT_EDITABLE: 'Cannot edit a closed or cancelled job posting',
  NO_FIELDS_TO_UPDATE: 'No valid fields provided for update',
  JOB_ALREADY_STATUS: 'Job already has the requested status',
  INVALID_JOB_STATUS_TRANSITION: 'Invalid job status transition',
  JOB_NO_ACTIVE_POSITIONS: 'Cannot publish a job without at least one active position',
  JOB_EXPIRED_DEADLINE_REOPEN: 'Cannot reopen a job with an expired deadline. Update the deadline first',

  // Position
  POSITION_NOT_FOUND: 'Position not found',
  CANNOT_ADD_POSITION_CANCELLED_JOB: 'Cannot add positions to a cancelled job',
  POSITION_DUPLICATE_NAME: 'A position with this name already exists for this job',
  CANNOT_EDIT_POSITION_CANCELLED_JOB: 'Cannot edit positions in a cancelled job',
  CANNOT_MODIFY_POSITION_CANCELLED_JOB: 'Cannot modify positions in a cancelled job',
  POSITION_ALREADY_STATUS: 'Position already has the requested status',

  // Criteria
  CRITERIA_ALREADY_EXISTS: 'Eligibility criteria already exists for this job. Use update instead',
  CRITERIA_NOT_FOUND: 'No eligibility criteria found for this job. Use set criteria first',

  // Round
  CANNOT_ADD_ROUND_CANCELLED_JOB: 'Cannot add rounds to a cancelled job',
  CANNOT_EDIT_ROUND_CANCELLED_JOB: 'Cannot edit rounds in a cancelled job',
  CANNOT_MODIFY_ROUND_CANCELLED_JOB: 'Cannot modify rounds in a cancelled job',
  ROUND_DUPLICATE_NAME: 'A round with this name already exists for this job',
  ROUND_NOT_EDITABLE: 'Round is in a terminal state and cannot be edited',
  ROUND_ALREADY_STATUS: 'Round already has the requested status',
  INVALID_ROUND_STATUS_TRANSITION: 'Invalid round status transition',

  // Round Result
  RESULT_NOT_FOUND: 'Round result not found',
  RESULT_ALREADY_EXISTS: 'Result already exists for this student in this round. Use update instead',
  RESULT_DATES_INVALID: 'Completed date cannot be before scheduled date',
  CANNOT_ADD_RESULT_CANCELLED_ROUND: 'Cannot add results to a cancelled round',
  CANNOT_ADD_RESULT_CANCELLED_JOB: 'Cannot add results for a cancelled job',
  CANNOT_UPDATE_RESULT_CANCELLED_ROUND: 'Cannot update results in a cancelled round',
  CANNOT_UPDATE_RESULT_CANCELLED_JOB: 'Cannot update results for a cancelled job',
  INVALID_APPLICATION_FOR_RESULT: 'Application not found for this job or does not belong to this college',

  // Question
  QUESTION_NOT_FOUND: 'Application question not found',
  CANNOT_ADD_QUESTION_CANCELLED_JOB: 'Cannot add questions to a cancelled job',
  CANNOT_ADD_QUESTION_CLOSED_JOB: 'Cannot add questions to a closed job',
  QUESTION_DUPLICATE: 'This question already exists for this job posting',
  CANNOT_EDIT_QUESTION_CANCELLED_JOB: 'Cannot edit questions in a cancelled job',
  CANNOT_EDIT_QUESTION_CLOSED_JOB: 'Cannot edit questions in a closed job',
  CANNOT_EDIT_QUESTION_WITH_APPLICATIONS: 'Cannot edit questions after students have started applying. Consider closing the job first',
  MCQ_OPTIONS_REQUIRED: 'Options are required when changing question type to MCQ',
  CANNOT_DELETE_QUESTION_CANCELLED_JOB: 'Cannot delete questions from a cancelled job',
  CANNOT_DELETE_QUESTION_CLOSED_JOB: 'Cannot delete questions from a closed job',
  CANNOT_DELETE_QUESTION_WITH_APPLICATIONS: 'Cannot delete questions after students have started applying',

  // Dashboard
  DASHBOARD_NOT_SPECIFIED: 'Not specified',

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
  ACADEMIC_YEAR_UPDATED: 'Academic year updated successfully',

  // User
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  USER_ACTIVATED: 'User account activated',
  USER_DEACTIVATED: 'User account deactivated',

  // Department
  DEPARTMENT_CREATED: 'Department created successfully',
  DEPARTMENT_UPDATED: 'Department updated successfully',
  DEPARTMENT_ACTIVATED: 'Department activated successfully',
  DEPARTMENT_DEACTIVATED: 'Department deactivated successfully',
  DEPARTMENTS_RETRIEVED: 'Departments retrieved successfully',
  DEPARTMENT_RETRIEVED: 'Department retrieved successfully',

  // Student
  STUDENTS_RETRIEVED: 'Students retrieved successfully',
  STUDENT_RETRIEVED: 'Student retrieved successfully',
  STUDENT_PROFILE_RETRIEVED: 'Student full profile retrieved successfully',
  STUDENT_REGISTERED: 'Student registered successfully',
  STUDENTS_BULK_REGISTERED: 'Bulk student registration completed',
  STUDENT_UPDATED: 'Student information updated',
  STUDENT_STATUS_TOGGLED: 'Student status updated successfully',
  STUDENT_PROFILE_APPROVED: 'Student profile approved',
  STUDENT_PROFILE_REJECTED: 'Student profile sent back for corrections',

  // Verification
  VERIFICATION_APPROVED: 'Verification approved successfully',
  VERIFICATION_REJECTED: 'Item rejected with reason',
  BULK_VERIFICATION_COMPLETED: 'Bulk verification completed',
  PENDING_PROFILES_RETRIEVED: 'Pending profiles retrieved successfully',
  PENDING_EXPERIENCES_RETRIEVED: 'Pending experiences retrieved successfully',
  PENDING_ACHIEVEMENTS_RETRIEVED: 'Pending achievements retrieved successfully',
  PENDING_CERTIFICATES_RETRIEVED: 'Pending certificates retrieved successfully',

  // Company
  COMPANIES_RETRIEVED: 'Companies retrieved successfully',
  COMPANY_RETRIEVED: 'Company retrieved successfully',
  COMPANY_CREATED: 'Company added successfully',
  COMPANY_UPDATED: 'Company information updated',
  COMPANY_ACTIVATED: 'Company activated successfully',
  COMPANY_DEACTIVATED: 'Company deactivated successfully',
  CONTACT_ADDED: 'Contact person added successfully',
  CONTACT_UPDATED: 'Contact information updated',
  CONTACT_ACTIVATED: 'Contact activated successfully',
  CONTACT_DEACTIVATED: 'Contact deactivated successfully',
  CONTACTS_RETRIEVED: 'Company contacts retrieved successfully',

  // Job
  JOB_CREATED: 'Job posting created successfully',
  JOB_UPDATED: 'Job posting updated',
  JOB_PUBLISHED: 'Job is now live and visible to students',
  JOB_CLOSED: 'Job posting closed',
  JOB_CANCELLED: 'Job posting cancelled',
  JOBS_RETRIEVED: 'Jobs retrieved successfully',
  JOB_RETRIEVED: 'Job details retrieved successfully',

  // Position
  POSITION_ADDED: 'Position added successfully',
  POSITION_UPDATED: 'Position updated successfully',
  POSITION_ACTIVATED: 'Position activated successfully',
  POSITION_DEACTIVATED: 'Position deactivated successfully',
  POSITION_FILLED: 'Position marked as filled',

  // Criteria
  CRITERIA_SET: 'Eligibility criteria set successfully',
  CRITERIA_UPDATED: 'Eligibility criteria updated successfully',
  ELIGIBLE_STUDENTS_RETRIEVED: 'Eligible students retrieved successfully',
  JOB_DENIALS_RETRIEVED: 'Job denials retrieved successfully',

  // Application
  APPLICATION_SUBMITTED: 'Application submitted successfully. Good luck!',
  APPLICATION_WITHDRAWN: 'Application withdrawn successfully',
  APPLICATION_STATUS_UPDATED: 'Application status updated',
  APPLICATION_UNDER_REVIEW: 'Application marked as under review',
  APPLICATION_SHORTLISTED: 'Application shortlisted',
  APPLICATION_REJECTED: 'Application rejected',
  CANDIDATE_SELECTED: 'Candidate selected',
  OFFER_EXTENDED: 'Offer extended to candidate',
  BULK_UPDATE_COMPLETE: 'Bulk application status update complete',
  JOB_APPLICATIONS_RETRIEVED: 'Job applications retrieved successfully',
  APPLICATION_RETRIEVED: 'Application details retrieved successfully',
  JOB_OPTED_OUT: 'Job opted out successfully',
  AVAILABLE_JOBS_RETRIEVED: 'Available jobs retrieved successfully',
  JOB_DETAILS_RETRIEVED: 'Job details retrieved successfully',
  ELIGIBILITY_CHECKED: 'Eligibility check completed',
  JOB_YEARS_RETRIEVED: 'Available job years retrieved successfully',
  APPLICATIONS_RETRIEVED: 'Applications retrieved successfully',
  APPLICATION_DETAILS_RETRIEVED: 'Application details retrieved successfully',

  // Placement
  PLACEMENT_CREATED: 'Placement record created successfully',
  PLACEMENT_UPDATED: 'Placement record updated',
  OFFER_ACCEPTED: 'Congratulations! Offer accepted successfully',
  OFFER_REJECTED: 'Offer declined',
  OFFER_LETTER_VERIFIED: 'Offer letter verified successfully',
  OFFER_LETTER_UNVERIFIED: 'Offer letter verification removed',
  PLACEMENTS_RETRIEVED: 'Placements retrieved successfully',
  PLACEMENT_RETRIEVED: 'Placement details retrieved successfully',
  PLACEMENT_ACCEPTED: 'Placement accepted',
  PLACEMENT_JOINED: 'Student marked as joined',
  PLACEMENT_REJECTED: 'Placement rejected',
  PLACEMENT_CANCELLED: 'Placement cancelled',

  // Round
  ROUND_ADDED: 'Selection round added',
  ROUND_UPDATED: 'Round details updated',
  ROUND_RESULTS_ADDED: 'Round results recorded successfully',
  ROUND_PENDING: 'Round reset to pending',
  ROUND_IN_PROGRESS: 'Round is now in progress',
  ROUND_COMPLETED: 'Round marked as completed',
  ROUND_CANCELLED: 'Round has been cancelled',

  // Round Result
  RESULT_ADDED: 'Round result added successfully',
  BULK_RESULTS_COMPLETE: 'Bulk add complete',
  RESULTS_RETRIEVED: 'Round results retrieved successfully',
  RESULT_UPDATED: 'Round result updated successfully',

  // Question
  QUESTION_ADDED: 'Application question added successfully',
  QUESTIONS_RETRIEVED: 'Job questions retrieved successfully',
  QUESTION_UPDATED: 'Question updated successfully',

  // Policy
  POLICY_CREATED: 'Placement policy created',
  POLICY_UPDATED: 'Placement policy updated',
  POLICY_DELETED: 'Placement policy removed',
  POLICIES_RETRIEVED: 'Placement policies retrieved successfully',
  POLICY_RETRIEVED: 'Placement policy retrieved successfully',
  POLICY_ACTIVATED: 'Policy activated successfully',
  POLICY_DEACTIVATED: 'Policy deactivated successfully',

  // Restriction
  RESTRICTION_ADDED: 'Student restriction applied',
  RESTRICTION_UPDATED: 'Restriction updated',
  RESTRICTION_RESOLVED: 'Restriction resolved successfully',
  RESTRICTIONS_RETRIEVED: 'Restrictions retrieved successfully',
  STUDENT_RESTRICTIONS_RETRIEVED: 'Student restrictions retrieved successfully',
  APPEAL_SUBMITTED: 'Appeal submitted successfully. You will be notified of the outcome',
  MY_RESTRICTIONS_RETRIEVED: 'Your restrictions retrieved successfully',

  // Training
  TRAINING_CREATED: 'Training program created',
  TRAINING_UPDATED: 'Training program updated',
  TRAINING_STATUS_CHANGED: 'Training program status updated',
  TRAININGS_RETRIEVED: 'Training programs retrieved successfully',
  TRAINING_RETRIEVED: 'Training program retrieved successfully',
  ENROLLMENTS_RETRIEVED: 'Enrollments retrieved successfully',
  ENROLLMENT_UPDATED: 'Enrollment updated successfully',
  ENROLLMENT_SUCCESS: 'Successfully enrolled in the training program',
  AVAILABLE_TRAININGS_RETRIEVED: 'Available training programs retrieved successfully',
  ENROLLED_TRAININGS_RETRIEVED: 'Enrolled training programs retrieved successfully',
  FEEDBACK_SUBMITTED: 'Thank you for your feedback!',
  FEEDBACK_RETRIEVED: 'Feedback retrieved successfully',
  MY_FEEDBACK_RETRIEVED: 'Your feedback retrieved successfully',
  FEEDBACK_APPROVED: 'Feedback approved successfully',
  FEEDBACK_REJECTED: 'Feedback rejected',
  INTERVIEW_QUESTIONS_RETRIEVED: 'Interview questions retrieved successfully',
  BROWSE_QUESTIONS_RETRIEVED: 'Approved interview questions retrieved successfully',
  INTERVIEW_QUESTION_SUBMITTED: 'Interview question submitted for review',
  INTERVIEW_QUESTION_APPROVED: 'Interview question approved successfully',
  INTERVIEW_QUESTION_REJECTED: 'Interview question rejected',

  // Override Requests (College)
  OVERRIDE_REQUESTS_RETRIEVED: 'Job override requests retrieved successfully',
  ALL_OVERRIDE_REQUESTS_RETRIEVED: 'Override requests retrieved successfully',
  OVERRIDE_REVIEWED: 'Override request reviewed successfully',
  BULK_OVERRIDE_REVIEWED: 'Bulk override review complete',

  // Override Requests (Student)
  OVERRIDE_ELIGIBILITY_CHECKED: 'Override eligibility check completed',
  OVERRIDE_REQUESTED: 'Eligibility override request submitted successfully',
  MY_OVERRIDES_RETRIEVED: 'Override requests retrieved successfully',

  // Notification
  NOTIFICATION_SENT: 'Notification sent successfully',
  BULK_NOTIFICATION_SENT: 'Bulk notifications sent successfully',
  SENT_NOTIFICATIONS_RETRIEVED: 'Sent notifications retrieved successfully',
  MY_NOTIFICATIONS_RETRIEVED: 'Notifications retrieved successfully',
  UNREAD_COUNT_RETRIEVED: 'Unread count retrieved',
  NOTIFICATIONS_MARKED_READ: 'Notifications marked as read',

  // Skills
  SKILL_CREATED: 'Skill added successfully',
  SKILL_DELETED: 'Skill deleted successfully',
  SKILL_UPDATED: 'Skill updated',
  SKILL_REMOVED: 'Skill removed from your profile',
  SKILLS_RETRIEVED: 'Skills retrieved successfully',

  // Profile
  PROFILE_UPDATED: 'Profile updated successfully',
  PROFILE_LINKS_UPDATED: 'Profile links updated',

  // Dashboard
  DASHBOARD_OVERVIEW_RETRIEVED: 'Dashboard overview retrieved',
  PLACEMENT_STATS_RETRIEVED: 'Placement statistics retrieved',
  APPLICATION_FUNNEL_RETRIEVED: 'Application funnel retrieved',
  STUDENT_READINESS_RETRIEVED: 'Student readiness data retrieved',
  DIVERSITY_STATS_RETRIEVED: 'Diversity statistics retrieved',
  TRAINING_STATS_RETRIEVED: 'Training & feedback statistics retrieved',
  DEPARTMENT_STATS_RETRIEVED: 'Department-wise statistics retrieved',
  COMPANY_STATS_RETRIEVED: 'Company-wise statistics retrieved',
  YEAR_COMPARISON_RETRIEVED: 'Year comparison data retrieved',

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
const config = require('./env');

const RATE_LIMIT = Object.freeze({
  // Auth endpoints (strict — brute force protection)
  WINDOW_MS_AUTH: 15 * 60 * 1000, // 15 minutes
  MAX_REQUESTS_AUTH: 10,

  // General API endpoints — env-configurable via RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX
  WINDOW_MS_API: config.rateLimitWindowMs, // default 60 000 ms (1 min)
  MAX_REQUESTS_API: config.rateLimitMax,   // default 200
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
// JOB TYPES (matches job_postings.job_type column)
// ============================================================================
const JOB_TYPES = Object.freeze([
  'full-time', 'internship', 'both',
]);

// ============================================================================
// QUESTION TYPES (matches job_questions.question_type column)
// ============================================================================
const QUESTION_TYPES = Object.freeze([
  'mcq_single', 'mcq_multiple', 'text', 'essay', 'yes_no',
]);

// ============================================================================
// COLLEGE TYPES (matches schema CHECK constraint)
// ============================================================================
const COLLEGE_TYPES = Object.freeze([
  'engineering', 'diploma', 'mba', 'polytechnic', 'degree', 'medical'
]);

// ============================================================================
// DEPARTMENT TYPES (matches departments.dept_type column)
// ============================================================================
const DEPT_TYPES = Object.freeze([
  'engineering', 'science', 'commerce', 'arts', 'management',
  'pharmacy', 'medical', 'polytechnic', 'other'
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
// ROUND TYPE ENUMS
// ============================================================================
const ROUND_TYPES = Object.freeze(['aptitude', 'technical', 'hr', 'group_discussion', 'coding', 'other']);

// ============================================================================
// MCQ QUESTION TYPES (subset of QUESTION_TYPES that require options)
// ============================================================================
const MCQ_TYPES = Object.freeze(['mcq_single', 'mcq_multiple']);

// ============================================================================
// PLACEMENT TYPE & STATUS ENUMS
// ============================================================================
const PLACEMENT_TYPES = Object.freeze(['full-time', 'internship', 'both']);
const PLACEMENT_STATUSES = Object.freeze(['offered', 'accepted', 'rejected', 'joined', 'cancelled']);
const ACCEPTANCE_STATUSES = Object.freeze(['accepted', 'rejected', 'pending']);
const RESTRICTION_TYPES = Object.freeze(Object.values(STATUS.RESTRICTION));
const OVERRIDE_STATUSES = Object.freeze(Object.values(STATUS.OVERRIDE));
const REVIEW_ACTIONS = Object.freeze(['approve', 'reject']);
const TRAINING_PROGRAM_TYPES = Object.freeze([
  'aptitude', 'coding', 'soft_skills', 'interview_prep',
  'resume_building', 'technical', 'group_discussion', 'other',
]);

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
  DEPT_TYPES,
  FEATURES,
  JOB_TYPES,
  QUESTION_TYPES,
  MCQ_TYPES,
  ROUND_TYPES,
  PLACEMENT_TYPES,
  PLACEMENT_STATUSES,
  ACCEPTANCE_STATUSES,
  RESTRICTION_TYPES,
  OVERRIDE_STATUSES,
  REVIEW_ACTIONS,
  TRAINING_PROGRAM_TYPES,
};