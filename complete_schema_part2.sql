-- =====================================================
-- COMPLETE PLACEMENT CRM SCHEMA - PART 2
-- Placement, Company & New Feature Tables
-- =====================================================
-- Run this file AFTER Part 1
-- =====================================================

-- 17. COMPANIES
CREATE TABLE public.companies (
  company_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  company_description TEXT,
  company_website TEXT,
  industry TEXT,
  company_logo TEXT,
  company_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT companies_pkey PRIMARY KEY (company_id),
  CONSTRAINT companies_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT companies_status_check CHECK (company_status IN ('active', 'inactive'))
) TABLESPACE pg_default;

CREATE INDEX idx_companies_college ON public.companies(college_id);
CREATE INDEX idx_companies_status ON public.companies(company_status);
CREATE INDEX idx_companies_college_status ON public.companies(college_id, company_status);

-- 18. COMPANY CONTACTS (NEW)
CREATE TABLE public.company_contacts (
  contact_id UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  college_id UUID NOT NULL,
  contact_name TEXT NOT NULL,
  contact_designation TEXT,
  contact_email TEXT,
  contact_phone VARCHAR(15),
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT company_contacts_pkey PRIMARY KEY (contact_id),
  CONSTRAINT company_contacts_company_fkey FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT company_contacts_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX idx_company_contacts_company ON public.company_contacts(company_id);
CREATE INDEX idx_company_contacts_company_college ON public.company_contacts(company_id, college_id);
CREATE INDEX idx_company_contacts_email_lower ON public.company_contacts(company_id, LOWER(contact_email)) WHERE is_active = true;

-- 19. JOB POSTINGS
CREATE TABLE public.job_postings (
  job_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  company_id UUID NOT NULL,
  job_title TEXT NOT NULL,
  job_description TEXT,
  job_location TEXT NOT NULL,
  salary_package TEXT,
  salary_min NUMERIC(10,2),
  salary_max NUMERIC(10,2),
  bond_duration TEXT,
  bond_details TEXT,
  job_type TEXT NOT NULL,
  internship_duration TEXT,
  internship_stipend TEXT,
  passout_years INTEGER[] NOT NULL,
  application_deadline TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  job_status TEXT NOT NULL DEFAULT 'draft',
  allow_applications BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT job_postings_pkey PRIMARY KEY (job_id),
  CONSTRAINT job_postings_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT job_postings_company_fkey FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT job_postings_creator_fkey FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT job_type_check CHECK (job_type IN ('full-time', 'internship', 'both')),
  CONSTRAINT job_status_check CHECK (job_status IN ('draft', 'published', 'closed', 'cancelled'))
) TABLESPACE pg_default;

CREATE INDEX idx_job_postings_college ON public.job_postings(college_id);
CREATE INDEX idx_job_postings_company ON public.job_postings(company_id);
CREATE INDEX idx_job_postings_year ON public.job_postings USING GIN(passout_years);
CREATE INDEX idx_job_postings_status ON public.job_postings(job_status);
CREATE INDEX idx_job_postings_deadline ON public.job_postings(application_deadline);
CREATE INDEX idx_job_postings_college_status ON public.job_postings(college_id, job_status);
CREATE INDEX idx_job_postings_college_company ON public.job_postings(college_id, company_id);

-- 20. JOB POSITIONS
CREATE TABLE public.job_positions (
  position_id UUID NOT NULL DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  position_name TEXT NOT NULL,
  position_description TEXT,
  vacancies INTEGER,
  position_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT job_positions_pkey PRIMARY KEY (position_id),
  CONSTRAINT job_positions_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT position_status_check CHECK (position_status IN ('active', 'inactive', 'filled'))
) TABLESPACE pg_default;

CREATE INDEX idx_job_positions_job ON public.job_positions(job_id);
CREATE INDEX idx_job_positions_job_status ON public.job_positions(job_id, position_status);
CREATE INDEX idx_job_positions_job_lower_name ON public.job_positions(job_id, LOWER(position_name));

-- 21. JOB ELIGIBILITY CRITERIA
CREATE TABLE public.job_eligibility_criteria (
  criteria_id UUID NOT NULL DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  min_overall_cgpa NUMERIC(4,2),
  max_live_kts INTEGER DEFAULT 0,
  min_tenth_percentage NUMERIC(5,2),
  min_twelfth_percentage NUMERIC(5,2),
  min_diploma_percentage NUMERIC(5,2),
  allowed_genders TEXT[],
  allowed_departments TEXT[],
  allowed_gap_statuses TEXT[],
  passout_years INTEGER[],
  min_existing_package NUMERIC(10,2),
  max_existing_package NUMERIC(10,2),
  exclude_already_placed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT job_criteria_pkey PRIMARY KEY (criteria_id),
  CONSTRAINT job_criteria_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT unique_criteria_per_job UNIQUE (job_id)
) TABLESPACE pg_default;

CREATE INDEX idx_job_criteria_job ON public.job_eligibility_criteria(job_id);

-- 22. JOB ROUNDS
CREATE TABLE public.job_rounds (
  round_id UUID NOT NULL DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  round_number INTEGER NOT NULL,
  round_name TEXT NOT NULL,
  round_description TEXT,
  round_type TEXT,
  round_date TIMESTAMP WITHOUT TIME ZONE,
  round_venue TEXT,
  round_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT job_rounds_pkey PRIMARY KEY (round_id),
  CONSTRAINT job_rounds_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT unique_round_per_job UNIQUE (job_id, round_number),
  CONSTRAINT round_status_check CHECK (round_status IN ('pending', 'in_progress', 'completed', 'cancelled'))
) TABLESPACE pg_default;

CREATE INDEX idx_job_rounds_job ON public.job_rounds(job_id);
CREATE INDEX idx_job_rounds_job_status ON public.job_rounds(job_id, round_status);
CREATE INDEX idx_job_rounds_job_lower_name ON public.job_rounds(job_id, LOWER(round_name));

-- 23. APPLICATION QUESTIONS
CREATE TABLE public.application_questions (
  question_id UUID NOT NULL DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  question_options JSONB,
  is_required BOOLEAN DEFAULT TRUE,
  question_order INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT application_questions_pkey PRIMARY KEY (question_id),
  CONSTRAINT application_questions_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT question_type_check CHECK (question_type IN ('mcq_single', 'mcq_multiple', 'text', 'essay', 'yes_no'))
) TABLESPACE pg_default;

CREATE INDEX idx_application_questions_job ON public.application_questions(job_id);
CREATE INDEX idx_application_questions_job_order ON public.application_questions(job_id, question_order, created_at);
CREATE INDEX idx_application_questions_job_lower_text ON public.application_questions(job_id, LOWER(TRIM(question_text)));

-- 24. JOB ELIGIBILITY OVERRIDE REQUESTS
CREATE TABLE public.job_eligibility_override_requests (
  override_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  job_id UUID NOT NULL,
  college_id UUID NOT NULL,
  request_reason TEXT NOT NULL,
  ineligibility_reasons TEXT,
  override_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  review_notes TEXT,
  rejection_reason TEXT,
  requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITHOUT TIME ZONE,
  CONSTRAINT job_override_requests_pkey PRIMARY KEY (override_id),
  CONSTRAINT job_override_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT job_override_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT job_override_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT job_override_reviewer_fkey FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT unique_override_per_student_job UNIQUE (student_id, job_id),
  CONSTRAINT override_status_check CHECK (override_status IN ('pending', 'approved', 'rejected'))
) TABLESPACE pg_default;

CREATE INDEX idx_job_override_student ON public.job_eligibility_override_requests(student_id);
CREATE INDEX idx_job_override_job ON public.job_eligibility_override_requests(job_id);
CREATE INDEX idx_job_override_college ON public.job_eligibility_override_requests(college_id);
CREATE INDEX idx_job_override_status ON public.job_eligibility_override_requests(override_status);
CREATE INDEX idx_override_college_job_status ON public.job_eligibility_override_requests(college_id, job_id, override_status);
CREATE INDEX idx_override_college_status_requested ON public.job_eligibility_override_requests(college_id, override_status, requested_at DESC);
CREATE INDEX idx_override_student_job ON public.job_eligibility_override_requests(student_id, job_id);
CREATE INDEX idx_override_student_college ON public.job_eligibility_override_requests(student_id, college_id, requested_at DESC);

-- 25. STUDENT APPLICATIONS
CREATE TABLE public.student_applications (
  application_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  job_id UUID NOT NULL,
  position_id UUID,
  college_id UUID NOT NULL,
  application_status TEXT NOT NULL DEFAULT 'pending',
  current_round_id UUID,
  is_eligible BOOLEAN NOT NULL,
  eligibility_remarks TEXT,
  override_id UUID,
  applied_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  last_updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_applications_pkey PRIMARY KEY (application_id),
  CONSTRAINT student_applications_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT student_applications_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT student_applications_position_fkey FOREIGN KEY (position_id) REFERENCES job_positions(position_id) ON DELETE SET NULL,
  CONSTRAINT student_applications_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT student_applications_round_fkey FOREIGN KEY (current_round_id) REFERENCES job_rounds(round_id) ON DELETE SET NULL,
  CONSTRAINT student_app_override_fkey FOREIGN KEY (override_id) REFERENCES job_eligibility_override_requests(override_id) ON DELETE SET NULL,
  CONSTRAINT unique_student_job_application UNIQUE (student_id, job_id),
  CONSTRAINT application_status_check CHECK (application_status IN ('pending', 'under_review', 'shortlisted', 'rejected', 'selected', 'offered', 'withdrawn'))
) TABLESPACE pg_default;

CREATE INDEX idx_student_applications_student ON public.student_applications(student_id);
CREATE INDEX idx_student_applications_job ON public.student_applications(job_id);
CREATE INDEX idx_student_applications_status ON public.student_applications(application_status);
CREATE INDEX idx_student_applications_college ON public.student_applications(college_id);
CREATE INDEX idx_student_apps_student_college_status ON public.student_applications(student_id, college_id, application_status);

-- 25. APPLICATION ANSWERS
CREATE TABLE public.application_answers (
  answer_id UUID NOT NULL DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  question_id UUID NOT NULL,
  answer_text TEXT,
  answer_options TEXT[],
  answer_boolean BOOLEAN,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT application_answers_pkey PRIMARY KEY (answer_id),
  CONSTRAINT application_answers_application_fkey FOREIGN KEY (application_id) REFERENCES student_applications(application_id) ON DELETE CASCADE,
  CONSTRAINT application_answers_question_fkey FOREIGN KEY (question_id) REFERENCES application_questions(question_id) ON DELETE CASCADE,
  CONSTRAINT unique_answer_per_question UNIQUE (application_id, question_id)
) TABLESPACE pg_default;

CREATE INDEX idx_application_answers_application ON public.application_answers(application_id);

-- 26. APPLICATION DENIALS
CREATE TABLE public.application_denials (
  denial_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  job_id UUID NOT NULL,
  college_id UUID NOT NULL,
  denial_reason TEXT NOT NULL,
  additional_comments TEXT,
  denied_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT application_denials_pkey PRIMARY KEY (denial_id),
  CONSTRAINT application_denials_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT application_denials_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT application_denials_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT unique_student_job_denial UNIQUE (student_id, job_id)
) TABLESPACE pg_default;

CREATE INDEX idx_application_denials_student ON public.application_denials(student_id);
CREATE INDEX idx_application_denials_job ON public.application_denials(job_id);
CREATE INDEX idx_application_denials_job_college ON public.application_denials(job_id, college_id);

-- 27. STUDENT ROUND RESULTS
CREATE TABLE public.student_round_results (
  result_id UUID NOT NULL DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL,
  round_id UUID NOT NULL,
  student_id UUID NOT NULL,
  result_status TEXT NOT NULL DEFAULT 'pending',
  score NUMERIC(10,2),
  remarks TEXT,
  attended BOOLEAN DEFAULT FALSE,
  scheduled_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_round_results_pkey PRIMARY KEY (result_id),
  CONSTRAINT student_round_results_application_fkey FOREIGN KEY (application_id) REFERENCES student_applications(application_id) ON DELETE CASCADE,
  CONSTRAINT student_round_results_round_fkey FOREIGN KEY (round_id) REFERENCES job_rounds(round_id) ON DELETE CASCADE,
  CONSTRAINT student_round_results_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT unique_student_round UNIQUE (application_id, round_id),
  CONSTRAINT result_status_check CHECK (result_status IN ('pending', 'passed', 'failed', 'on_hold', 'absent'))
) TABLESPACE pg_default;

CREATE INDEX idx_student_round_results_application ON public.student_round_results(application_id);
CREATE INDEX idx_student_round_results_round ON public.student_round_results(round_id);
CREATE INDEX idx_student_round_results_status ON public.student_round_results(result_status);
CREATE INDEX idx_round_results_round_status ON public.student_round_results(round_id, result_status);
CREATE INDEX idx_round_results_round_created ON public.student_round_results(round_id, created_at);
CREATE INDEX idx_round_results_student ON public.student_round_results(student_id);
CREATE INDEX idx_student_round_results_app_student ON public.student_round_results(application_id, student_id);

-- 28. PLACEMENT RESULTS
CREATE TABLE public.placement_results (
  placement_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  position_id UUID,
  application_id UUID NOT NULL,
  placement_type TEXT NOT NULL,
  fulltime_package NUMERIC(10,2),
  fulltime_designation TEXT,
  fulltime_joining_date DATE,
  internship_stipend NUMERIC(10,2),
  internship_duration TEXT,
  internship_start_date DATE,
  offer_letter_url TEXT,
  offer_letter_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID,
  verified_at TIMESTAMP WITHOUT TIME ZONE,
  placement_status TEXT NOT NULL DEFAULT 'offered',
  acceptance_status TEXT,
  passout_year INTEGER NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT placement_results_pkey PRIMARY KEY (placement_id),
  CONSTRAINT placement_results_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT placement_results_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT placement_results_company_fkey FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT placement_results_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT placement_results_position_fkey FOREIGN KEY (position_id) REFERENCES job_positions(position_id) ON DELETE SET NULL,
  CONSTRAINT placement_results_application_fkey FOREIGN KEY (application_id) REFERENCES student_applications(application_id) ON DELETE CASCADE,
  CONSTRAINT placement_results_verifier_fkey FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT placement_type_check CHECK (placement_type IN ('full-time', 'internship', 'both')),
  CONSTRAINT placement_status_check CHECK (placement_status IN ('offered', 'accepted', 'rejected', 'joined', 'cancelled')),
  CONSTRAINT acceptance_status_check CHECK (acceptance_status IN ('accepted', 'rejected', 'pending'))
) TABLESPACE pg_default;

CREATE INDEX idx_placement_results_student ON public.placement_results(student_id);
CREATE INDEX idx_placement_results_college ON public.placement_results(college_id);
CREATE INDEX idx_placement_results_company ON public.placement_results(company_id);
CREATE INDEX idx_placement_results_year ON public.placement_results(passout_year);
CREATE INDEX idx_placement_results_status ON public.placement_results(placement_status);
CREATE INDEX idx_placement_results_app_student ON public.placement_results(application_id, student_id);
CREATE INDEX idx_placement_results_college_year_status ON public.placement_results(college_id, passout_year, placement_status);
CREATE INDEX idx_placement_results_student_college ON public.placement_results(student_id, college_id);

-- 29. ELIGIBLE BUT NOT APPLIED
CREATE TABLE public.eligible_not_applied (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  job_id UUID NOT NULL,
  college_id UUID NOT NULL,
  deadline_passed_at TIMESTAMP WITHOUT TIME ZONE,
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT eligible_not_applied_pkey PRIMARY KEY (id),
  CONSTRAINT eligible_not_applied_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT eligible_not_applied_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT eligible_not_applied_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT unique_student_job_eligible UNIQUE (student_id, job_id)
) TABLESPACE pg_default;

CREATE INDEX idx_eligible_not_applied_student ON public.eligible_not_applied(student_id);
CREATE INDEX idx_eligible_not_applied_job ON public.eligible_not_applied(job_id);

-- 30. PLACEMENT POLICIES (Flexible - multiple rules per passout year)
CREATE TABLE public.placement_policies (
  policy_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  passout_year INTEGER NOT NULL,
  policy_title TEXT NOT NULL,
  policy_description TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT placement_policies_pkey PRIMARY KEY (policy_id),
  CONSTRAINT placement_policies_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT placement_policies_creator_fkey FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX idx_placement_policies_college ON public.placement_policies(college_id);
CREATE INDEX idx_placement_policies_year ON public.placement_policies(passout_year);
CREATE INDEX idx_placement_policies_college_year_lower_title ON public.placement_policies(college_id, passout_year, LOWER(TRIM(policy_title)));
CREATE INDEX idx_placement_policies_college_active ON public.placement_policies(college_id, is_active);

-- =====================================================
-- NEW TABLES
-- =====================================================

-- 31. STUDENT RESTRICTIONS (NEW)
CREATE TABLE public.student_restrictions (
  restriction_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  restriction_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  restricted_by UUID NOT NULL,
  applied_on DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  is_active BOOLEAN DEFAULT TRUE,
  appeal_submitted BOOLEAN DEFAULT FALSE,
  appeal_notes TEXT,
  appeal_resolved_at TIMESTAMP WITHOUT TIME ZONE,
  resolved_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_restrictions_pkey PRIMARY KEY (restriction_id),
  CONSTRAINT student_restrictions_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT student_restrictions_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT student_restrictions_restricted_by_fkey FOREIGN KEY (restricted_by) REFERENCES users(user_id) ON DELETE RESTRICT,
  CONSTRAINT student_restrictions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT restriction_type_check CHECK (
    restriction_type IN ('bar_from_placements', 'bar_from_company', 'probation', 'warning', 'temporary_suspension')
  )
) TABLESPACE pg_default;

CREATE INDEX idx_restrictions_student ON public.student_restrictions(student_id);
CREATE INDEX idx_restrictions_active ON public.student_restrictions(is_active);
CREATE INDEX idx_restrictions_type ON public.student_restrictions(restriction_type);

-- 32. TRAINING PROGRAMS (NEW)
CREATE TABLE public.training_programs (
  program_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  program_name TEXT NOT NULL,
  program_description TEXT,
  program_type TEXT,
  trainer_name TEXT,
  trainer_organization TEXT,
  start_date DATE,
  end_date DATE,
  total_sessions INTEGER,
  session_duration_hours NUMERIC(4,1),
  target_dept_ids UUID[],
  target_passout_year INTEGER,
  max_enrollment INTEGER,
  enrollment_deadline DATE,
  program_status TEXT NOT NULL DEFAULT 'upcoming',
  created_by UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT training_programs_pkey PRIMARY KEY (program_id),
  CONSTRAINT training_programs_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT training_programs_creator_fkey FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT program_type_check CHECK (
    program_type IN ('aptitude', 'coding', 'soft_skills', 'interview_prep', 'resume_building', 'technical', 'group_discussion', 'other')
  ),
  CONSTRAINT program_status_check CHECK (
    program_status IN ('upcoming', 'enrollment_open', 'in_progress', 'completed', 'cancelled')
  )
) TABLESPACE pg_default;

CREATE INDEX idx_training_programs_college ON public.training_programs(college_id);
CREATE INDEX idx_training_programs_status ON public.training_programs(program_status);

-- 33. TRAINING ENROLLMENTS (NEW)
CREATE TABLE public.training_enrollments (
  enrollment_id UUID NOT NULL DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL,
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  enrolled_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  sessions_attended INTEGER DEFAULT 0,
  completion_status TEXT NOT NULL DEFAULT 'enrolled',
  completion_percentage NUMERIC(5,2) DEFAULT 0,
  certificate_issued BOOLEAN DEFAULT FALSE,
  certificate_url TEXT,
  student_feedback TEXT,
  student_rating INTEGER,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT training_enrollments_pkey PRIMARY KEY (enrollment_id),
  CONSTRAINT training_enrollments_program_fkey FOREIGN KEY (program_id) REFERENCES training_programs(program_id) ON DELETE CASCADE,
  CONSTRAINT training_enrollments_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT training_enrollments_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT unique_student_program UNIQUE (student_id, program_id),
  CONSTRAINT completion_status_check CHECK (
    completion_status IN ('enrolled', 'in_progress', 'completed', 'dropped', 'failed')
  ),
  CONSTRAINT student_rating_check CHECK (student_rating >= 1 AND student_rating <= 5)
) TABLESPACE pg_default;

CREATE INDEX idx_training_enrollments_program ON public.training_enrollments(program_id);
CREATE INDEX idx_training_enrollments_student ON public.training_enrollments(student_id);
CREATE INDEX idx_training_enrollments_status ON public.training_enrollments(completion_status);

-- 34. NOTIFICATIONS (NEW)
CREATE TABLE public.notifications (
  notification_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  recipient_type TEXT NOT NULL,
  recipient_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  notification_type TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT notifications_pkey PRIMARY KEY (notification_id),
  CONSTRAINT notifications_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT recipient_type_check CHECK (recipient_type IN ('student', 'user')),
  CONSTRAINT notification_type_check CHECK (
    notification_type IN (
      'new_job_posted', 'application_received', 'application_status_changed',
      'round_scheduled', 'round_result', 'offer_received', 'deadline_reminder',
      'restriction_applied', 'restriction_removed', 'training_enrollment',
      'training_completed', 'profile_incomplete',
      'eligibility_override_requested', 'eligibility_override_approved', 'eligibility_override_rejected',
      'general'
    )
  )
) TABLESPACE pg_default;

CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_type, recipient_id);
CREATE INDEX idx_notifications_college ON public.notifications(college_id);
CREATE INDEX idx_notifications_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_type ON public.notifications(notification_type);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_dedup_check ON public.notifications(college_id, recipient_id, related_entity_type, related_entity_id, notification_type);
CREATE INDEX idx_notifications_college_type_created ON public.notifications(college_id, notification_type, created_at DESC);
CREATE INDEX idx_notifications_college_recipient_created ON public.notifications(college_id, recipient_type, created_at DESC);
CREATE INDEX idx_notifications_recipient_read ON public.notifications(recipient_id, college_id, is_read, created_at DESC) WHERE recipient_type = 'student';

-- 35. PLACEMENT FEEDBACK (NEW - Simple)
CREATE TABLE public.placement_feedback (
  feedback_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  job_id UUID NOT NULL,
  company_id UUID NOT NULL,
  student_id UUID NOT NULL,
  rating INTEGER NOT NULL,
  feedback_text TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT placement_feedback_pkey PRIMARY KEY (feedback_id),
  CONSTRAINT placement_feedback_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT placement_feedback_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT placement_feedback_company_fkey FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT placement_feedback_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT unique_feedback_per_student_job UNIQUE (student_id, job_id),
  CONSTRAINT rating_check CHECK (rating >= 1 AND rating <= 5)
) TABLESPACE pg_default;

CREATE INDEX idx_feedback_job ON public.placement_feedback(job_id);
CREATE INDEX idx_feedback_company ON public.placement_feedback(company_id);
CREATE INDEX idx_feedback_college_approved ON public.placement_feedback(college_id, is_approved);
CREATE INDEX idx_feedback_student_job ON public.placement_feedback(student_id, job_id);

-- 36. INTERVIEW QUESTIONS (NEW - Students share questions for next batch)
CREATE TABLE public.interview_questions (
  question_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  company_id UUID NOT NULL,
  job_id UUID NOT NULL,
  student_id UUID NOT NULL,
  question_description TEXT NOT NULL,
  topic TEXT,
  sample_answer TEXT,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT interview_questions_pkey PRIMARY KEY (question_id),
  CONSTRAINT interview_questions_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT interview_questions_company_fkey FOREIGN KEY (company_id) REFERENCES companies(company_id) ON DELETE CASCADE,
  CONSTRAINT interview_questions_job_fkey FOREIGN KEY (job_id) REFERENCES job_postings(job_id) ON DELETE CASCADE,
  CONSTRAINT interview_questions_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX idx_interview_questions_company ON public.interview_questions(company_id);
CREATE INDEX idx_interview_questions_job ON public.interview_questions(job_id);
CREATE INDEX idx_interview_questions_approved ON public.interview_questions(is_approved);
CREATE INDEX idx_interview_questions_college_approved ON public.interview_questions(college_id, is_approved);
CREATE INDEX idx_feedback_college_created ON public.placement_feedback(college_id, created_at DESC);
CREATE INDEX idx_iq_college_created ON public.interview_questions(college_id, created_at DESC);
CREATE INDEX idx_iq_college_topic ON public.interview_questions(college_id, LOWER(topic));\nCREATE INDEX idx_feedback_student_college ON public.placement_feedback(student_id, college_id);

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Placement Statistics per College by Passout Year
CREATE OR REPLACE VIEW v_placement_statistics AS
SELECT 
  c.college_id, c.college_name, pr.passout_year,
  COUNT(DISTINCT pr.student_id) as total_placed,
  COUNT(DISTINCT CASE WHEN pr.placement_type = 'full-time' THEN pr.student_id END) as fulltime_count,
  COUNT(DISTINCT CASE WHEN pr.placement_type = 'internship' THEN pr.student_id END) as internship_count,
  COUNT(DISTINCT pr.company_id) as total_companies,
  AVG(pr.fulltime_package) as avg_package,
  MAX(pr.fulltime_package) as highest_package,
  MIN(pr.fulltime_package) as lowest_package
FROM colleges c
LEFT JOIN placement_results pr ON c.college_id = pr.college_id
WHERE pr.placement_status IN ('offered', 'accepted', 'joined')
GROUP BY c.college_id, c.college_name, pr.passout_year;

-- View: Department-wise Placement Stats
CREATE OR REPLACE VIEW v_department_placement_stats AS
SELECT 
  c.college_id, d.dept_name, pr.passout_year,
  COUNT(DISTINCT pr.student_id) as placed_students,
  AVG(pr.fulltime_package) as avg_package,
  MAX(pr.fulltime_package) as highest_package
FROM placement_results pr
JOIN students s ON pr.student_id = s.student_id
JOIN departments d ON s.dept_id = d.dept_id
JOIN colleges c ON pr.college_id = c.college_id
WHERE pr.placement_status IN ('offered', 'accepted', 'joined')
GROUP BY c.college_id, d.dept_name, pr.passout_year;

-- View: Company Application Stats
CREATE OR REPLACE VIEW v_company_application_stats AS
SELECT 
  jp.job_id, co.company_name, jp.job_title, jp.passout_years,
  COUNT(DISTINCT sa.student_id) as total_applications,
  COUNT(DISTINCT CASE WHEN sa.application_status = 'selected' THEN sa.student_id END) as selected,
  COUNT(DISTINCT CASE WHEN sa.application_status = 'rejected' THEN sa.student_id END) as rejected
FROM job_postings jp
JOIN companies co ON jp.company_id = co.company_id
LEFT JOIN student_applications sa ON jp.job_id = sa.job_id
GROUP BY jp.job_id, co.company_name, jp.job_title, jp.passout_years;

-- View: Students with Active Restrictions
CREATE OR REPLACE VIEW v_restricted_students AS
SELECT 
  sr.restriction_id, s.student_id,
  s.first_name || ' ' || s.last_name as student_name,
  s.student_email, d.dept_name,
  sr.restriction_type, sr.reason, sr.applied_on, sr.valid_until,
  u.user_name as restricted_by_name
FROM student_restrictions sr
JOIN students s ON sr.student_id = s.student_id
JOIN departments d ON s.dept_id = d.dept_id
JOIN users u ON sr.restricted_by = u.user_id
WHERE sr.is_active = TRUE
  AND (sr.valid_until IS NULL OR sr.valid_until >= CURRENT_DATE);

-- View: Training Program Summary
CREATE OR REPLACE VIEW v_training_program_summary AS
SELECT 
  tp.program_id, tp.program_name, tp.program_type, tp.program_status,
  tp.start_date, tp.end_date, tp.total_sessions,
  COUNT(te.enrollment_id) as total_enrolled,
  COUNT(CASE WHEN te.completion_status = 'completed' THEN 1 END) as completed_count,
  COUNT(CASE WHEN te.completion_status = 'dropped' THEN 1 END) as dropped_count,
  AVG(te.student_rating) as avg_rating
FROM training_programs tp
LEFT JOIN training_enrollments te ON tp.program_id = te.program_id
GROUP BY tp.program_id, tp.program_name, tp.program_type, tp.program_status,
  tp.start_date, tp.end_date, tp.total_sessions;

-- View: Interview Questions by Company (for next year students)
CREATE OR REPLACE VIEW v_company_interview_questions AS
SELECT 
  co.company_name, jp.job_title,
  iq.question_description, iq.topic, iq.sample_answer,
  jp.passout_years
FROM interview_questions iq
JOIN companies co ON iq.company_id = co.company_id
JOIN job_postings jp ON iq.job_id = jp.job_id
WHERE iq.is_approved = TRUE
ORDER BY co.company_name;

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_job_postings_updated_at BEFORE UPDATE ON job_postings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_applications_updated_at BEFORE UPDATE ON student_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_placement_results_updated_at BEFORE UPDATE ON placement_results FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_placement_policies_updated_at BEFORE UPDATE ON placement_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_student_restrictions_updated_at BEFORE UPDATE ON student_restrictions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_training_programs_updated_at BEFORE UPDATE ON training_programs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_training_enrollments_updated_at BEFORE UPDATE ON training_enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_company_contacts_updated_at BEFORE UPDATE ON company_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_placement_feedback_updated_at BEFORE UPDATE ON placement_feedback FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_interview_questions_updated_at BEFORE UPDATE ON interview_questions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TABLE COMMENTS
-- =====================================================
COMMENT ON TABLE companies IS 'Company information for placement drives';
COMMENT ON TABLE company_contacts IS 'HR/Recruiter contacts for each company';
COMMENT ON TABLE job_postings IS 'Job postings created by college admins';
COMMENT ON TABLE job_positions IS 'Multiple positions per job posting';
COMMENT ON TABLE job_eligibility_criteria IS 'Eligibility criteria for each job';
COMMENT ON TABLE job_rounds IS 'Selection rounds per job posting';
COMMENT ON TABLE application_questions IS 'Custom questions asked during application';
COMMENT ON TABLE student_applications IS 'Student applications to jobs';
COMMENT ON TABLE application_answers IS 'Student answers to application questions';
COMMENT ON TABLE application_denials IS 'When students opt-out with reasons';
COMMENT ON TABLE student_round_results IS 'Student progress through selection rounds';
COMMENT ON TABLE placement_results IS 'Final placement outcomes';
COMMENT ON TABLE eligible_not_applied IS 'Eligible students who missed deadline';
COMMENT ON TABLE placement_policies IS 'College placement policies per year';
COMMENT ON TABLE student_restrictions IS 'Barred/warned students for rule violations';
COMMENT ON TABLE training_programs IS 'Pre-placement training programs';
COMMENT ON TABLE training_enrollments IS 'Student enrollment and progress in training';
COMMENT ON TABLE notifications IS 'In-app notifications for students and users';
COMMENT ON TABLE placement_feedback IS 'Student feedback and ratings after placement drives';
COMMENT ON TABLE interview_questions IS 'Interview questions shared by students for future batches';

-- =====================================================
-- Phase 14: Student Job Browsing Indexes (1M+ scale)
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_job_postings_title_trgm ON job_postings USING GIN (job_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_job_postings_desc_trgm ON job_postings USING GIN (job_description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_job_postings_college_published_deadline ON job_postings (college_id, job_status, application_deadline DESC) WHERE job_status = 'published';
CREATE INDEX IF NOT EXISTS idx_job_postings_passout_years_gin ON job_postings USING GIN (passout_years);
CREATE INDEX IF NOT EXISTS idx_student_apps_student_job ON student_applications (student_id, job_id);
CREATE INDEX IF NOT EXISTS idx_app_denials_student_job ON application_denials (student_id, job_id);
CREATE INDEX IF NOT EXISTS idx_student_apps_student_college ON student_applications (student_id, college_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_restrictions_active ON student_restrictions (student_id, restriction_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_student_restrictions_college ON student_restrictions (college_id);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING GIN (company_name gin_trgm_ops);

-- =====================================================
-- Phase 15: College Application Review Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_student_apps_job_college_status ON student_applications (job_id, college_id, application_status);
CREATE INDEX IF NOT EXISTS idx_application_answers_application ON application_answers (application_id);

-- =====================================================
-- Phase 8.2: Training Programs Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_training_programs_college_status ON training_programs (college_id, program_status);
CREATE INDEX IF NOT EXISTS idx_training_programs_college_lower_name ON training_programs (college_id, LOWER(program_name));
CREATE INDEX IF NOT EXISTS idx_training_enrollments_program_college ON training_enrollments (program_id, college_id);
CREATE INDEX IF NOT EXISTS idx_training_enrollments_student ON training_enrollments (student_id);

-- =====================================================
-- Phase 10.1: College Dashboard Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_personal_info_student ON student_personal_information (student_id);
CREATE INDEX IF NOT EXISTS idx_students_college_passout_dept ON students (college_id, student_passout_year, dept_id) WHERE student_status != 'dropout';
CREATE INDEX IF NOT EXISTS idx_placement_results_college_company_year ON placement_results (college_id, company_id, passout_year);
CREATE INDEX IF NOT EXISTS idx_feedback_college_job ON placement_feedback (college_id, job_id);
