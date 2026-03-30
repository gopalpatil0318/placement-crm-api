-- ============================================================================
-- CONSOLIDATED AUDIT MIGRATION — Phases 2–8
-- ============================================================================
-- Date: 2026-03-28
-- Covers: All audit phases (2 through 8) — constraint changes, composite
--         indexes, functional indexes, GIN trigram indexes, partial indexes.
-- Usage: Run once against an existing database.
--        Safe to re-run (IF NOT EXISTS / DROP IF EXISTS used throughout).
--        Each statement auto-commits; CONCURRENTLY indexes won't lock tables.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONSTRAINT CHANGES
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Expand category CHECK to 17 Indian reservation categories (was 7)
ALTER TABLE student_personal_information DROP CONSTRAINT IF EXISTS category_check;
ALTER TABLE student_personal_information
  ADD CONSTRAINT category_check CHECK (
    category IN (
      'General', 'OBC', 'OBC-NCL', 'SC', 'ST', 'EWS',
      'NT', 'NT-A', 'NT-B', 'NT-C', 'NT-D',
      'VJ', 'VJ-A', 'SBC', 'SEBC', 'DT/DNT', 'Open'
    )
  );

-- 2b. Roll number: global UNIQUE → per-college UNIQUE (multi-tenant)
ALTER TABLE student_academic_information
  DROP CONSTRAINT IF EXISTS student_academic_information_roll_number_key;
ALTER TABLE student_academic_information
  ADD CONSTRAINT roll_number_college_unique UNIQUE (roll_number, college_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. INDEXES — COLLEGES & DEPARTMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- College status filter (sysadmin queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_colleges_status
  ON colleges (college_status);

-- Department: college + active partial (login query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_college_active
  ON departments (college_id, is_active)
  WHERE is_active = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INDEXES — STUDENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Functional index for case-insensitive email uniqueness checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_email_college_lower
  ON students (college_id, LOWER(student_email));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. INDEXES — STUDENT PROFILE TABLES (composite lookups)
-- ─────────────────────────────────────────────────────────────────────────────

-- Personal information
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personal_info_student_college
  ON student_personal_information (student_id, college_id);

-- Academic information
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_academic_info_student_college
  ON student_academic_information (student_id, college_id);

-- Semester grades (ordered by semester_number)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_semester_grades_student_college_sem
  ON student_semester_grades (student_id, college_id, semester_number);

-- Skills
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_skills_student_college
  ON student_skills (student_id, college_id);

-- Projects
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_student_college
  ON student_projects (student_id, college_id);

-- Experience (with verification filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experience_student_college_status
  ON student_experience (student_id, college_id, verification_status);

-- Achievements (with verification filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_achievements_student_college_status
  ON student_achievements (student_id, college_id, verification_status);

-- Certificates (with verification filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certificates_student_college_status
  ON student_certificates (student_id, college_id, verification_status);

-- Activities
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activities_student_college
  ON student_activities (student_id, college_id);

-- Profile links
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profile_links_student_college
  ON student_profile_links (student_id, college_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. INDEXES — COMPANIES & CONTACTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Company list: college + status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_college_status
  ON companies (college_id, company_status);

-- Company contacts: company + college lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_company_contacts_company_college
  ON company_contacts (company_id, college_id);

-- Contact email uniqueness (functional partial)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_company_contacts_email_lower
  ON company_contacts (company_id, LOWER(contact_email))
  WHERE is_active = true;

-- Company name trigram search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_name_trgm
  ON companies USING GIN (company_name gin_trgm_ops);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. INDEXES — JOB POSTINGS
-- ─────────────────────────────────────────────────────────────────────────────

-- College + status (admin job listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_postings_college_status
  ON job_postings (college_id, job_status);

-- College + company (admin company filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_postings_college_company
  ON job_postings (college_id, company_id);

-- Published jobs: college + status + deadline (student browse)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_postings_college_published_deadline
  ON job_postings (college_id, job_status, application_deadline DESC)
  WHERE job_status = 'published';

-- GIN trigram for ILIKE search on title / description
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_postings_title_trgm
  ON job_postings USING GIN (job_title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_postings_desc_trgm
  ON job_postings USING GIN (job_description gin_trgm_ops);

-- GIN for passout_years array containment
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_postings_passout_years_gin
  ON job_postings USING GIN (passout_years);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. INDEXES — JOB POSITIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Position status per job
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_positions_job_status
  ON job_positions (job_id, position_status);

-- Functional: case-insensitive position name duplicate check
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_positions_job_lower_name
  ON job_positions (job_id, LOWER(position_name));


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. INDEXES — JOB ROUNDS
-- ─────────────────────────────────────────────────────────────────────────────

-- Round status per job
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_rounds_job_status
  ON job_rounds (job_id, round_status);

-- Functional: case-insensitive round name duplicate check
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_rounds_job_lower_name
  ON job_rounds (job_id, LOWER(round_name));


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. INDEXES — APPLICATION QUESTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Composite for ORDER BY (eliminates sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_questions_job_order
  ON application_questions (job_id, question_order, created_at);

-- Functional: case-insensitive duplicate question text
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_questions_job_lower_text
  ON application_questions (job_id, LOWER(TRIM(question_text)));


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. INDEXES — STUDENT APPLICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Student + job (duplicate check + LEFT JOIN)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_apps_student_job
  ON student_applications (student_id, job_id);

-- Student + college + applied_at (my-applications listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_apps_student_college
  ON student_applications (student_id, college_id, applied_at DESC);

-- Job + college + status (admin application listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_apps_job_college_status
  ON student_applications (job_id, college_id, application_status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. INDEXES — APPLICATION DENIALS
-- ─────────────────────────────────────────────────────────────────────────────

-- Student + job (denial checks + LEFT JOIN)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_denials_student_job
  ON application_denials (student_id, job_id);

-- Job + college (admin denial listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_application_denials_job_college
  ON application_denials (job_id, college_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. INDEXES — ROUND RESULTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Round + status (admin result listing, aggregation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_round_results_round_status
  ON student_round_results (round_id, result_status);

-- Round + created_at (ORDER BY in getRoundResults)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_round_results_round_created
  ON student_round_results (round_id, created_at);

-- Student FK (PostgreSQL does not auto-index FK referencing side)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_round_results_student
  ON student_round_results (student_id);

-- Application + student (application detail lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_round_results_app_student
  ON student_round_results (application_id, student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. INDEXES — PLACEMENT RESULTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Application + student (application detail lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_placement_results_app_student
  ON placement_results (application_id, student_id);

-- College + passout year + status (getAllPlacements WHERE clause)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_placement_results_college_year_status
  ON placement_results (college_id, passout_year, placement_status);

-- Student + college (verifyStudentPlacement + getMyPlacements WHERE clause)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_placement_results_student_college
  ON placement_results (student_id, college_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 15. INDEXES — STUDENT RESTRICTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Active restriction checks (partial)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_restrictions_active
  ON student_restrictions (student_id, restriction_type)
  WHERE is_active = true;

-- College-level restriction list queries (getAllRestrictions WHERE sr.college_id = $1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_restrictions_college
  ON student_restrictions (college_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 16. INDEXES — PLACEMENT POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Functional: case-insensitive duplicate title per college+year
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_placement_policies_college_year_lower_title
  ON placement_policies (college_id, passout_year, LOWER(TRIM(policy_title)));

-- College + active (status-filtered list)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_placement_policies_college_active
  ON placement_policies (college_id, is_active);


-- ─────────────────────────────────────────────────────────────────────────────
-- 17. INDEXES — NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- 5-column dedup check for batch notification INSERT
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_dedup_check
  ON notifications (college_id, recipient_id, related_entity_type, related_entity_id, notification_type);


-- ─────────────────────────────────────────────────────────────────────────────
-- 18. INDEXES — FEEDBACK & INTERVIEW QUESTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Feedback: college + approved (admin listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_college_approved
  ON placement_feedback (college_id, is_approved);

-- Feedback: student + job (uniqueness check)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_student_job
  ON placement_feedback (student_id, job_id);

-- Interview questions: college + approved
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_questions_college_approved
  ON interview_questions (college_id, is_approved);


-- ============================================================================
-- PHASE 8.2: Training Programs indexes
-- ============================================================================

-- Training programs: college + status (getAllTrainingPrograms filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_programs_college_status
  ON training_programs (college_id, program_status);

-- Training programs: college + lower name (duplicate name check)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_programs_college_lower_name
  ON training_programs (college_id, LOWER(program_name));

-- Training enrollments: program + college (getTrainingEnrollments WHERE)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_enrollments_program_college
  ON training_enrollments (program_id, college_id);

-- Training enrollments: student (student-side queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_training_enrollments_student
  ON training_enrollments (student_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 8.6 — Job Eligibility Override Requests (College)
-- ─────────────────────────────────────────────────────────────────────────────

-- Override requests: college + job + status (getJobOverrideRequests with status filter)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_override_college_job_status
  ON job_eligibility_override_requests (college_id, job_id, override_status);

-- Override requests: college + status + requested_at (getAllOverrideRequests dashboard sort)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_override_college_status_requested
  ON job_eligibility_override_requests (college_id, override_status, requested_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 8.7 — Job Eligibility Override Requests (Student)
-- ─────────────────────────────────────────────────────────────────────────────

-- Student + job lookup (checkJobEligibilityForOverride, requestOverride duplicate check)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_override_student_job
  ON job_eligibility_override_requests (student_id, job_id);

-- Student's own override list sorted by recency (getMyOverrideRequests)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_override_student_college
  ON job_eligibility_override_requests (student_id, college_id, requested_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 8.8 — Feedback & Interview Questions (College)
-- ─────────────────────────────────────────────────────────────────────────────

-- getAllFeedback default sort (college_id + created_at DESC covers WHERE + ORDER BY)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_college_created
  ON placement_feedback (college_id, created_at DESC);

-- getAllInterviewQuestions default sort
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_iq_college_created
  ON interview_questions (college_id, created_at DESC);

-- Topic filter at scale (functional index for case-insensitive ILIKE on topic)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_iq_college_topic
  ON interview_questions (college_id, LOWER(topic));


-- PHASE 8.9 — Feedback & Interview Questions (Student)
-- ─────────────────────────────────────────────────────────────────────────────

-- getMyFeedback WHERE (student_id, college_id) — not covered by existing idx_feedback_student_job
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_student_college
  ON placement_feedback (student_id, college_id);


-- ============================================================================
-- PHASE 9.1: College Notification indexes (sent history + bulk filters)
-- ============================================================================

-- getSentNotifications: filter by type + sort by date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_college_type_created
  ON notifications (college_id, notification_type, created_at DESC);

-- getSentNotifications: filter by recipient_type + sort by date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_college_recipient_created
  ON notifications (college_id, recipient_type, created_at DESC);

-- getFilteredStudentIds: bulk notification target query (dept + year filters)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_college_dept_passout
  ON students (college_id, dept_id, student_passout_year);

-- getFilteredUserIds: bulk notification user filter (role + active status)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_college_role_active
  ON users (college_id, user_role) WHERE user_status = 'active';


-- ============================================================================
-- PHASE 9.2 — Student Notifications (1 new index)
-- ============================================================================

-- getMyNotifications + getUnreadCount: student-side notification reads
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_recipient_read
  ON notifications (recipient_id, college_id, is_read, created_at DESC)
  WHERE recipient_type = 'student';


-- ============================================================================
-- PHASE 9.4 — Verification (Experience, Achievements, Certificates)
-- ============================================================================

-- getPendingProfiles + getPendingVerificationCounts: compound filter on
-- college_id + profile_approval_status + profile_complete for the college-admin
-- pending list and counts queries at 1M+ scale (base schema only has
-- college_id + profile_approval_status).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_college_approval_complete
  ON students (college_id, profile_approval_status, profile_complete);


-- ============================================================================
-- PHASE 10.1 — College Dashboard (4 new indexes)
-- ============================================================================

-- getDiversityStats: JOIN student_personal_information → students (spi.student_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personal_info_student
  ON student_personal_information (student_id);

-- getDepartmentWise: student aggregation by dept for passout year
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_college_passout_dept
  ON students (college_id, student_passout_year, dept_id)
  WHERE student_status != 'dropout';

-- getCompanyWise: placement stats per company per year
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_placement_results_college_company_year
  ON placement_results (college_id, company_id, passout_year);

-- getTrainingStats: feedback JOIN on job_postings
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_feedback_college_job
  ON placement_feedback (college_id, job_id);


-- ============================================================================
-- DONE — 67 indexes + 1 extension + 2 constraint changes
-- ============================================================================
