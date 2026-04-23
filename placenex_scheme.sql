-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.application_answers (
  answer_id uuid NOT NULL DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  question_id uuid NOT NULL,
  answer_text text,
  answer_options ARRAY,
  answer_boolean boolean,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT application_answers_pkey PRIMARY KEY (answer_id),
  CONSTRAINT application_answers_application_fkey FOREIGN KEY (application_id) REFERENCES public.student_applications(application_id),
  CONSTRAINT application_answers_question_fkey FOREIGN KEY (question_id) REFERENCES public.application_questions(question_id)
);
CREATE TABLE public.application_denials (
  denial_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  job_id uuid NOT NULL,
  college_id uuid NOT NULL,
  denial_reason text NOT NULL,
  additional_comments text,
  denied_at timestamp without time zone DEFAULT now(),
  CONSTRAINT application_denials_pkey PRIMARY KEY (denial_id),
  CONSTRAINT application_denials_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT application_denials_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT application_denials_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.application_questions (
  question_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type = ANY (ARRAY['mcq_single'::text, 'mcq_multiple'::text, 'text'::text, 'essay'::text, 'yes_no'::text])),
  question_options jsonb,
  is_required boolean DEFAULT true,
  question_order integer NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT application_questions_pkey PRIMARY KEY (question_id),
  CONSTRAINT application_questions_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id)
);
CREATE TABLE public.audit_log (
  audit_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  user_role text NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'status_change'::text, 'bulk_import'::text, 'bulk_update'::text])),
  resource_type text NOT NULL CHECK (resource_type = ANY (ARRAY['application'::text, 'placement'::text, 'restriction'::text, 'policy'::text, 'override'::text, 'job'::text, 'student'::text, 'user'::text, 'training'::text, 'company'::text, 'department'::text, 'skill'::text, 'company_tier'::text, 'placement_setting'::text, 'self_report'::text, 'job_criteria'::text, 'role_permission'::text, 'job_round'::text, 'subscription'::text])),
  resource_id uuid,
  summary text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  ip_address inet,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (audit_id),
  CONSTRAINT audit_log_college_id_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.audit_log_archive (
  audit_id uuid NOT NULL,
  college_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  user_role text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  summary text,
  old_value jsonb,
  new_value jsonb,
  metadata jsonb,
  ip_address inet,
  created_at timestamp with time zone,
  archived_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_log_archive_pkey PRIMARY KEY (audit_id)
);
CREATE TABLE public.colleges (
  college_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_name text NOT NULL,
  college_subdomain text NOT NULL UNIQUE,
  college_address text,
  college_city text,
  college_taluka text,
  college_district text,
  college_state text,
  college_pincode character varying,
  college_type text NOT NULL CHECK (college_type = ANY (ARRAY['engineering'::text, 'diploma'::text, 'mba'::text, 'polytechnic'::text, 'degree'::text, 'medical'::text])),
  college_status text NOT NULL DEFAULT 'active'::text CHECK (college_status = ANY (ARRAY['active'::text, 'inactive'::text])),
  enabled_features jsonb NOT NULL DEFAULT '["core"]'::jsonb,
  default_academic_year integer NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  college_logo_url text,
  college_website text,
  college_affiliation text,
  college_established_year integer,
  college_description text,
  verification_settings jsonb DEFAULT '{"bypass": {"profiles": false, "experience": false, "achievements": false, "certificates": false}, "re_verify_on_edit": {"experience": false, "achievements": false, "certificates": false, "academic_info": false, "personal_info": false, "semester_grades": false}, "auto_approve_profile_on_complete": false, "require_profile_approval_for_jobs": true}'::jsonb,
  subscription_status text NOT NULL DEFAULT 'none' CHECK (subscription_status IN ('none', 'trial', 'active', 'expired', 'suspended')),
  CONSTRAINT colleges_pkey PRIMARY KEY (college_id)
);
CREATE TABLE public.companies (
  company_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  company_name text NOT NULL,
  company_description text,
  company_website text,
  industry text,
  company_logo text,
  company_status text NOT NULL DEFAULT 'active'::text CHECK (company_status = ANY (ARRAY['active'::text, 'inactive'::text])),
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT companies_pkey PRIMARY KEY (company_id),
  CONSTRAINT companies_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.company_contacts (
  contact_id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  college_id uuid NOT NULL,
  contact_name text NOT NULL,
  contact_designation text,
  contact_email text,
  contact_phone character varying,
  is_primary boolean DEFAULT false,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT company_contacts_pkey PRIMARY KEY (contact_id),
  CONSTRAINT company_contacts_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id),
  CONSTRAINT company_contacts_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.company_tiers (
  tier_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  passout_year integer NOT NULL,
  tier_name text NOT NULL,
  tier_level integer NOT NULL,
  min_package numeric NOT NULL,
  max_package numeric,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT company_tiers_pkey PRIMARY KEY (tier_id),
  CONSTRAINT company_tiers_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT company_tiers_level_positive CHECK (tier_level >= 1),
  CONSTRAINT company_tiers_min_positive CHECK (min_package >= 0),
  CONSTRAINT company_tiers_max_gte_min CHECK (max_package IS NULL OR max_package >= min_package)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_tiers_name_unique ON public.company_tiers (college_id, passout_year, LOWER(tier_name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_tiers_level_unique ON public.company_tiers (college_id, passout_year, tier_level);
CREATE INDEX IF NOT EXISTS idx_company_tiers_college_year
  ON public.company_tiers (college_id, passout_year);
CREATE TABLE public.departments (
  dept_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  dept_name text NOT NULL,
  dept_code text,
  dept_type text,
  program_duration_years integer DEFAULT 4,
  total_semesters integer DEFAULT 8,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT departments_pkey PRIMARY KEY (dept_id),
  CONSTRAINT departments_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.eligible_not_applied (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  job_id uuid NOT NULL,
  college_id uuid NOT NULL,
  deadline_passed_at timestamp without time zone,
  notified boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT eligible_not_applied_pkey PRIMARY KEY (id),
  CONSTRAINT eligible_not_applied_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT eligible_not_applied_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT eligible_not_applied_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.interview_questions (
  question_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  company_id uuid NOT NULL,
  job_id uuid NOT NULL,
  student_id uuid NOT NULL,
  question_description text NOT NULL,
  topic text,
  sample_answer text,
  is_approved boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  round_type text CHECK (round_type IS NULL OR (round_type = ANY (ARRAY['aptitude'::text, 'technical_interview'::text, 'hr_interview'::text, 'group_discussion'::text, 'coding_test'::text, 'written_test'::text, 'case_study'::text, 'psychometric_test'::text, 'managerial_round'::text, 'other'::text]))),
  CONSTRAINT interview_questions_pkey PRIMARY KEY (question_id),
  CONSTRAINT interview_questions_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT interview_questions_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id),
  CONSTRAINT interview_questions_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT interview_questions_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id)
);
CREATE TABLE public.job_eligibility_criteria (
  criteria_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE,
  min_overall_cgpa numeric,
  max_live_kts integer DEFAULT 0,
  min_tenth_percentage numeric,
  min_twelfth_percentage numeric,
  min_diploma_percentage numeric,
  allowed_genders ARRAY,
  allowed_departments ARRAY,
  allowed_gap_statuses ARRAY,
  min_existing_package numeric,
  max_existing_package numeric,
  exclude_already_placed boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  passout_years ARRAY,
  min_skill_match_percentage integer DEFAULT NULL,
  CONSTRAINT job_eligibility_criteria_pkey PRIMARY KEY (criteria_id),
  CONSTRAINT job_criteria_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT job_eligibility_criteria_skill_match_pct_check CHECK (min_skill_match_percentage >= 0 AND min_skill_match_percentage <= 100)
);
CREATE TABLE public.job_eligibility_override_requests (
  override_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  job_id uuid NOT NULL,
  college_id uuid NOT NULL,
  request_reason text NOT NULL,
  ineligibility_reasons text,
  override_status text NOT NULL DEFAULT 'pending'::text CHECK (override_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  reviewed_by uuid,
  review_notes text,
  rejection_reason text,
  request_attempt integer NOT NULL DEFAULT 1,
  requested_at timestamp without time zone DEFAULT now(),
  reviewed_at timestamp without time zone,
  CONSTRAINT job_eligibility_override_requests_pkey PRIMARY KEY (override_id),
  CONSTRAINT job_override_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT job_override_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT job_override_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT job_override_reviewer_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.job_positions (
  position_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  position_name text NOT NULL,
  position_description text,
  vacancies integer,
  position_status text NOT NULL DEFAULT 'active'::text CHECK (position_status = ANY (ARRAY['active'::text, 'inactive'::text, 'filled'::text])),
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT job_positions_pkey PRIMARY KEY (position_id),
  CONSTRAINT job_positions_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id)
);
CREATE TABLE public.job_postings (
  job_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  company_id uuid NOT NULL,
  job_title text NOT NULL,
  job_description text,
  job_location text NOT NULL,
  salary_package text,
  salary_min numeric,
  salary_max numeric,
  bond_duration text,
  bond_details text,
  job_type text NOT NULL CHECK (job_type = ANY (ARRAY['full-time'::text, 'internship'::text, 'both'::text])),
  internship_duration text,
  internship_stipend text,
  application_deadline timestamp without time zone NOT NULL,
  job_status text NOT NULL DEFAULT 'draft'::text CHECK (job_status = ANY (ARRAY['draft'::text, 'published'::text, 'closed'::text, 'cancelled'::text])),
  allow_applications boolean DEFAULT true,
  created_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  passout_years ARRAY NOT NULL,
  drive_type text NOT NULL DEFAULT 'on_campus'::text CHECK (drive_type = ANY (ARRAY['on_campus'::text, 'off_campus'::text, 'pool_campus'::text])),
  tier_id uuid,
  CONSTRAINT job_postings_pkey PRIMARY KEY (job_id),
  CONSTRAINT job_postings_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT job_postings_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id),
  CONSTRAINT job_postings_creator_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT job_postings_tier_fkey FOREIGN KEY (tier_id) REFERENCES public.company_tiers(tier_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_job_deadline_enforcement
    ON public.job_postings (college_id, application_deadline)
    WHERE job_status = 'published' AND allow_applications = true;
CREATE INDEX IF NOT EXISTS idx_jobs_drive_type
  ON public.job_postings (college_id, drive_type);
CREATE INDEX IF NOT EXISTS idx_jobs_tier
  ON public.job_postings (tier_id)
  WHERE tier_id IS NOT NULL;
CREATE TABLE public.job_rounds (
  round_id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  round_number integer NOT NULL,
  round_name text NOT NULL,
  round_description text,
  round_type text,
  round_date timestamp without time zone,
  round_venue text,
  round_status text DEFAULT 'pending'::text CHECK (round_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])),
  is_processed boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT job_rounds_pkey PRIMARY KEY (round_id),
  CONSTRAINT job_rounds_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id)
);
CREATE TABLE public.notifications (
  notification_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  recipient_type text NOT NULL CHECK (recipient_type = ANY (ARRAY['student'::text, 'user'::text])),
  recipient_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  notification_type text NOT NULL CHECK (notification_type = ANY (ARRAY['new_job_posted'::text, 'application_received'::text, 'application_status_changed'::text, 'round_scheduled'::text, 'round_result'::text, 'offer_received'::text, 'deadline_reminder'::text, 'restriction_applied'::text, 'restriction_removed'::text, 'training_enrollment'::text, 'training_completed'::text, 'profile_incomplete'::text, 'profile_approved'::text, 'profile_rejected'::text, 'item_verified'::text, 'item_rejected'::text, 'eligibility_override_requested'::text, 'eligibility_override_approved'::text, 'eligibility_override_rejected'::text, 'general'::text, 'offer_expiring'::text, 'offer_expired'::text, 'offer_declined'::text, 'offer_revoked'::text, 'offer_accepted'::text, 'auto_withdrawn'::text, 'waitlist_promoted'::text, 'round_processing_complete'::text, 'self_report_submitted'::text, 'self_report_approved'::text, 'self_report_rejected'::text])),
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean DEFAULT false,
  read_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (notification_id),
  CONSTRAINT notifications_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_inbox
    ON notifications (college_id, recipient_type, recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_dedup
    ON notifications (college_id, recipient_type, recipient_id, notification_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_expiring_dedup
    ON notifications (college_id, related_entity_id, notification_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_college_timeline
    ON notifications (college_id, created_at DESC);
CREATE TABLE public.placement_feedback (
  feedback_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  job_id uuid NOT NULL,
  company_id uuid NOT NULL,
  student_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text text,
  is_anonymous boolean DEFAULT false,
  is_approved boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT placement_feedback_pkey PRIMARY KEY (feedback_id),
  CONSTRAINT placement_feedback_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT placement_feedback_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT placement_feedback_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id),
  CONSTRAINT placement_feedback_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id)
);
CREATE TABLE public.placement_policies (
  policy_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  passout_year integer NOT NULL,
  policy_title text NOT NULL,
  policy_description text NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT placement_policies_pkey PRIMARY KEY (policy_id),
  CONSTRAINT placement_policies_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT placement_policies_creator_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.placement_settings (
  setting_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  passout_year integer NOT NULL,
  max_active_offers integer NOT NULL DEFAULT 1,
  allow_dream_upgrade boolean NOT NULL DEFAULT true,
  auto_withdrawal_rule text NOT NULL DEFAULT 'same_or_lower_tier'::text CHECK (auto_withdrawal_rule = ANY (ARRAY['none'::text, 'same_tier'::text, 'same_or_lower_tier'::text, 'all'::text])),
  default_offer_days integer NOT NULL DEFAULT 7,
  exclude_placed_by_default boolean NOT NULL DEFAULT true,
  auto_reject_on_round_fail boolean NOT NULL DEFAULT true,
  allow_reapply_after_withdrawal boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  max_active_applications integer DEFAULT NULL,
  CONSTRAINT placement_settings_pkey PRIMARY KEY (setting_id),
  CONSTRAINT placement_settings_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT placement_settings_creator_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT placement_settings_max_offers_positive CHECK (max_active_offers >= 1),
  CONSTRAINT placement_settings_offer_days_positive CHECK (default_offer_days >= 1),
  CONSTRAINT placement_settings_max_apps_positive CHECK (max_active_applications IS NULL OR max_active_applications >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_placement_settings_college_year ON public.placement_settings (college_id, passout_year);
CREATE TABLE public.placement_results (
  placement_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  company_id uuid NOT NULL,
  job_id uuid NOT NULL,
  position_id uuid,
  application_id uuid NOT NULL,
  placement_type text NOT NULL CHECK (placement_type = ANY (ARRAY['full-time'::text, 'internship'::text, 'both'::text])),
  fulltime_package numeric,
  fulltime_designation text,
  fulltime_joining_date date,
  internship_stipend numeric,
  internship_duration text,
  internship_start_date date,
  offer_letter_url text,
  offer_letter_verified boolean DEFAULT false,
  offer_letter_rejection_reason text,
  offer_letter_rejected_at timestamp without time zone,
  offer_letter_uploaded_by text CHECK (offer_letter_uploaded_by IS NULL OR offer_letter_uploaded_by = ANY (ARRAY['student'::text, 'college'::text])),
  verified_by uuid,
  verified_at timestamp without time zone,
  joining_letter_url text,
  joining_letter_verified boolean DEFAULT false,
  joining_letter_verified_by uuid,
  joining_letter_verified_at timestamp without time zone,
  joining_letter_rejection_reason text,
  joining_letter_rejected_at timestamp without time zone,
  joining_letter_uploaded_by text CHECK (joining_letter_uploaded_by IS NULL OR joining_letter_uploaded_by = ANY (ARRAY['student'::text, 'college'::text])),
  placement_status text NOT NULL DEFAULT 'offered'::text CHECK (placement_status = ANY (ARRAY['offered'::text, 'accepted'::text, 'declined'::text, 'revoked'::text, 'expired'::text, 'joined'::text, 'cancelled'::text])),
  acceptance_status text CHECK (acceptance_status = ANY (ARRAY['accepted'::text, 'rejected'::text, 'pending'::text])),
  offer_expires_at timestamp without time zone,
  declined_reason text,
  revoked_reason text,
  passout_year integer NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT placement_results_pkey PRIMARY KEY (placement_id),
  CONSTRAINT placement_results_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT placement_results_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT placement_results_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id),
  CONSTRAINT placement_results_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT placement_results_position_fkey FOREIGN KEY (position_id) REFERENCES public.job_positions(position_id),
  CONSTRAINT placement_results_application_fkey FOREIGN KEY (application_id) REFERENCES public.student_applications(application_id),
  CONSTRAINT placement_results_verifier_fkey FOREIGN KEY (verified_by) REFERENCES public.users(user_id),
  CONSTRAINT placement_results_joining_verifier_fkey FOREIGN KEY (joining_letter_verified_by) REFERENCES public.users(user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_placement_results_app_unique
    ON placement_results (application_id)
    WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_placements_expiry
  ON public.placement_results (offer_expires_at)
  WHERE placement_status = 'offered' AND offer_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_placements_student_active
  ON public.placement_results (student_id, placement_status)
  WHERE placement_status IN ('accepted', 'joined');
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_placement_per_student
  ON public.placement_results (student_id, college_id)
  WHERE placement_status IN ('accepted', 'joined');
CREATE TABLE public.refresh_tokens (
  token_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_type text NOT NULL CHECK (user_type = ANY (ARRAY['college'::text, 'student'::text, 'sysadmin'::text])),
  token_hash text NOT NULL,
  family_id uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamp with time zone NOT NULL,
  is_revoked boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  revoked_at timestamp with time zone,
  CONSTRAINT refresh_tokens_pkey PRIMARY KEY (token_id)
);
CREATE TABLE public.skills (
  skill_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  skill_name text NOT NULL,
  skill_category text NOT NULL DEFAULT 'other' CHECK (skill_category IN ('programming_language','framework','database','devops','cloud','testing','design','cad_modeling','simulation','embedded_systems','manufacturing','electrical_systems','data_analytics','ai_ml','project_management','soft_skill','communication','domain_knowledge','tool','other')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT skills_pkey PRIMARY KEY (skill_id),
  CONSTRAINT skills_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS skills_college_name_unique ON public.skills (college_id, LOWER(skill_name));
CREATE TABLE public.student_academic_information (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  college_id uuid NOT NULL,
  roll_number text,
  enrollment_number text,
  admission_year integer,
  admission_based_on text CHECK (admission_based_on = ANY (ARRAY['JEE'::text, 'MHT-CET'::text, 'GATE'::text, 'Direct'::text, 'Management'::text, 'CAT'::text, 'Other'::text])),
  tenth_percentage numeric,
  tenth_board text,
  tenth_passing_year integer,
  twelfth_or_diploma text CHECK (twelfth_or_diploma = ANY (ARRAY['12th'::text, 'Diploma'::text])),
  twelfth_percentage numeric,
  twelfth_board text,
  diploma_percentage numeric,
  diploma_branch text,
  higher_education_passing_year integer,
  overall_cgpa numeric,
  total_live_kts integer DEFAULT 0,
  total_dead_kts integer DEFAULT 0,
  any_gap_during_education boolean DEFAULT false,
  gap_years integer DEFAULT 0,
  gap_reason text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_academic_information_pkey PRIMARY KEY (id),
  CONSTRAINT fk_academic_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_academic_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.student_achievements (
  achievement_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  achievement_title text NOT NULL,
  achievement_description text,
  achievement_type text CHECK (achievement_type = ANY (ARRAY['competition'::text, 'hackathon'::text, 'award'::text, 'certification'::text, 'publication'::text, 'research'::text, 'sports'::text, 'cultural'::text])),
  issuing_organization text,
  event_name text,
  achievement_level text CHECK (achievement_level = ANY (ARRAY['international'::text, 'national'::text, 'state'::text, 'university'::text, 'college'::text, 'departmental'::text])),
  position_rank text,
  participants_count integer,
  achievement_date date,
  certificate_url text,
  proof_url text,
  is_verified boolean DEFAULT false,
  is_featured boolean DEFAULT false,
  display_order integer,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  verification_status text DEFAULT 'pending'::text CHECK (verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  verified_by uuid,
  verified_at timestamp without time zone,
  rejection_reason text,
  rejected_at timestamp without time zone,
  CONSTRAINT student_achievements_pkey PRIMARY KEY (achievement_id),
  CONSTRAINT fk_achievements_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_achievements_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT student_achievements_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.student_activities (
  activity_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  activity_name text NOT NULL,
  activity_description text,
  activity_type text CHECK (activity_type = ANY (ARRAY['sports'::text, 'cultural'::text, 'technical'::text, 'social'::text, 'volunteer'::text, 'arts'::text, 'nss'::text, 'ncc'::text])),
  organizing_body text,
  role_position text,
  start_date date,
  end_date date,
  is_ongoing boolean DEFAULT false,
  hours_contributed integer,
  certificate_url text,
  proof_urls ARRAY,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_activities_pkey PRIMARY KEY (activity_id),
  CONSTRAINT fk_activities_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_activities_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.student_applications (
  application_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  job_id uuid NOT NULL,
  position_id uuid,
  college_id uuid NOT NULL,
  application_status text NOT NULL DEFAULT 'pending'::text CHECK (application_status = ANY (ARRAY['pending'::text, 'under_review'::text, 'shortlisted'::text, 'rejected'::text, 'selected'::text, 'offered'::text, 'withdrawn'::text, 'waitlisted'::text, 'auto_withdrawn'::text])),
  current_round_id uuid,
  is_eligible boolean NOT NULL,
  eligibility_remarks text,
  applied_at timestamp without time zone DEFAULT now(),
  last_updated_at timestamp without time zone DEFAULT now(),
  override_id uuid,
  waitlist_rank integer,
  auto_withdrawal_reason text,
  CONSTRAINT student_applications_pkey PRIMARY KEY (application_id),
  CONSTRAINT student_applications_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT student_applications_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id),
  CONSTRAINT student_applications_position_fkey FOREIGN KEY (position_id) REFERENCES public.job_positions(position_id),
  CONSTRAINT student_applications_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT student_applications_round_fkey FOREIGN KEY (current_round_id) REFERENCES public.job_rounds(round_id),
  CONSTRAINT student_app_override_fkey FOREIGN KEY (override_id) REFERENCES public.job_eligibility_override_requests(override_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_rank_unique
    ON student_applications (job_id, college_id, waitlist_rank)
    WHERE application_status = 'waitlisted' AND waitlist_rank IS NOT NULL;
CREATE TABLE public.student_certificates (
  certificate_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  certificate_name text NOT NULL,
  certificate_description text,
  certificate_type text CHECK (certificate_type = ANY (ARRAY['course'::text, 'training'::text, 'workshop'::text, 'seminar'::text, 'certification'::text, 'bootcamp'::text])),
  issuing_organization text NOT NULL,
  issuing_platform text,
  credential_id text,
  credential_url text,
  issue_date date,
  expiry_date date,
  does_not_expire boolean DEFAULT true,
  skills_covered ARRAY,
  certificate_url text,
  is_verified boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  verification_status text DEFAULT 'pending'::text CHECK (verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  verified_by uuid,
  verified_at timestamp without time zone,
  rejection_reason text,
  rejected_at timestamp without time zone,
  CONSTRAINT student_certificates_pkey PRIMARY KEY (certificate_id),
  CONSTRAINT fk_certificates_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_certificates_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT student_certificates_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.student_experience (
  experience_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  company_name text NOT NULL,
  company_website text,
  position_title text NOT NULL,
  employment_type text CHECK (employment_type = ANY (ARRAY['internship'::text, 'full-time'::text, 'part-time'::text, 'freelance'::text, 'contract'::text])),
  job_description text,
  responsibilities ARRAY,
  technologies_used ARRAY,
  work_location text,
  work_mode text CHECK (work_mode = ANY (ARRAY['on-site'::text, 'remote'::text, 'hybrid'::text])),
  start_date date NOT NULL,
  end_date date,
  is_current boolean DEFAULT false,
  duration_months integer,
  stipend_amount numeric,
  offer_letter_url text,
  completion_certificate_url text,
  is_verified boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  verification_status text DEFAULT 'pending'::text CHECK (verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  verified_by uuid,
  verified_at timestamp without time zone,
  rejection_reason text,
  rejected_at timestamp without time zone,
  CONSTRAINT student_experience_pkey PRIMARY KEY (experience_id),
  CONSTRAINT fk_experience_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_experience_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT student_experience_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.student_personal_information (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  college_id uuid NOT NULL,
  mobile_number character varying,
  alternate_mobile character varying,
  birth_date date,
  gender text CHECK (gender = ANY (ARRAY['Male'::text, 'Female'::text, 'Other'::text, 'Prefer not to say'::text])),
  blood_group text,
  aadhaar_number character varying,
  caste text,
  category text CHECK (category = ANY (ARRAY['General'::text, 'OBC'::text, 'OBC-NCL'::text, 'SC'::text, 'ST'::text, 'EWS'::text, 'NT'::text, 'NT-A'::text, 'NT-B'::text, 'NT-C'::text, 'NT-D'::text, 'VJ'::text, 'VJ-A'::text, 'SBC'::text, 'SEBC'::text, 'DT/DNT'::text, 'Open'::text])),
  nationality text DEFAULT 'Indian'::text,
  father_name text,
  father_mobile character varying,
  father_occupation text,
  father_annual_income numeric,
  mother_name text,
  mother_mobile character varying,
  mother_occupation text,
  mother_annual_income numeric,
  guardian_name text,
  guardian_mobile character varying,
  permanent_address text,
  permanent_city text,
  permanent_district text,
  permanent_state text,
  permanent_pincode character varying,
  current_address text,
  current_city text,
  current_district text,
  current_state text,
  current_pincode character varying,
  same_as_permanent boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_personal_information_pkey PRIMARY KEY (id),
  CONSTRAINT fk_personal_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_personal_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.student_profile_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE,
  college_id uuid NOT NULL,
  personal_portfolio_url text,
  resume_url text,
  profile_image_url text,
  github_url text,
  linkedin_url text,
  leetcode_url text,
  codechef_url text,
  codeforces_url text,
  hackerrank_url text,
  geeksforgeeks_url text,
  medium_url text,
  bio text,
  area_of_interest ARRAY,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_profile_links_pkey PRIMARY KEY (id),
  CONSTRAINT fk_profile_links_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_profile_links_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.student_projects (
  project_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  project_title text NOT NULL,
  project_description text,
  project_type text CHECK (project_type = ANY (ARRAY['academic'::text, 'personal'::text, 'internship'::text, 'freelance'::text, 'research'::text, 'open_source'::text])),
  project_url text,
  github_link text,
  demo_link text,
  technologies_used ARRAY,
  start_date date,
  end_date date,
  is_ongoing boolean DEFAULT false,
  team_size integer,
  role_in_project text,
  display_order integer,
  is_featured boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_projects_pkey PRIMARY KEY (project_id),
  CONSTRAINT fk_projects_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_projects_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE TABLE public.student_restrictions (
  restriction_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  restriction_type text NOT NULL CHECK (restriction_type = ANY (ARRAY['bar_from_placements'::text, 'bar_from_company'::text, 'probation'::text, 'warning'::text, 'temporary_suspension'::text])),
  reason text NOT NULL,
  details text,
  restricted_by uuid NOT NULL,
  applied_on date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  is_active boolean DEFAULT true,
  appeal_submitted boolean DEFAULT false,
  appeal_notes text,
  appeal_resolved_at timestamp without time zone,
  resolved_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_restrictions_pkey PRIMARY KEY (restriction_id),
  CONSTRAINT student_restrictions_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT student_restrictions_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  company_id uuid,
  CONSTRAINT student_restrictions_pkey PRIMARY KEY (restriction_id),
  CONSTRAINT student_restrictions_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT student_restrictions_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT student_restrictions_restricted_by_fkey FOREIGN KEY (restricted_by) REFERENCES public.users(user_id),
  CONSTRAINT student_restrictions_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(user_id),
  CONSTRAINT student_restrictions_company_fkey FOREIGN KEY (company_id) REFERENCES public.companies(company_id)
);
CREATE INDEX IF NOT EXISTS idx_restrictions_company
    ON public.student_restrictions (student_id, company_id)
    WHERE restriction_type = 'bar_from_company' AND is_active = true;
CREATE TABLE public.student_round_results (
  result_id uuid NOT NULL DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL,
  round_id uuid NOT NULL,
  student_id uuid NOT NULL,
  result_status text NOT NULL DEFAULT 'pending'::text CHECK (result_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'on_hold'::text, 'absent'::text])),
  score numeric,
  remarks text,
  attended boolean DEFAULT false,
  scheduled_at timestamp without time zone,
  completed_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_round_results_pkey PRIMARY KEY (result_id),
  CONSTRAINT student_round_results_application_fkey FOREIGN KEY (application_id) REFERENCES public.student_applications(application_id),
  CONSTRAINT student_round_results_round_fkey FOREIGN KEY (round_id) REFERENCES public.job_rounds(round_id),
  CONSTRAINT student_round_results_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_round_results_app_round
    ON public.student_round_results (application_id, round_id);
CREATE TABLE public.student_semester_grades (
  grade_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  dept_id uuid NOT NULL,
  semester_number integer NOT NULL CHECK (semester_number >= 1 AND semester_number <= 12),
  academic_year text,
  sgpa numeric,
  cgpa numeric,
  backlogs_in_semester integer DEFAULT 0,
  backlog_subjects ARRAY,
  semester_status text DEFAULT 'in_progress'::text CHECK (semester_status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'detained'::text, 'failed'::text])),
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT student_semester_grades_pkey PRIMARY KEY (grade_id),
  CONSTRAINT fk_semester_student FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT fk_semester_college FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT fk_semester_dept FOREIGN KEY (dept_id) REFERENCES public.departments(dept_id)
);
CREATE TABLE public.student_skills (
  student_skill_id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  proficiency_level text NOT NULL DEFAULT 'intermediate'::text CHECK (proficiency_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'expert'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT student_skills_pkey PRIMARY KEY (student_skill_id),
  CONSTRAINT student_skills_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT student_skills_skill_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id),
  CONSTRAINT student_skills_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id)
);
CREATE INDEX IF NOT EXISTS idx_student_skills_student ON public.student_skills (student_id, college_id);
CREATE INDEX IF NOT EXISTS idx_student_skills_skill ON public.student_skills (skill_id, college_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_skills_unique ON public.student_skills (student_id, skill_id);
CREATE TABLE public.students (
  student_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  student_email text NOT NULL,
  student_password text NOT NULL,
  dept_id uuid NOT NULL,
  student_passout_year integer NOT NULL,
  student_status text NOT NULL DEFAULT 'active'::text CHECK (student_status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'graduated'::text, 'dropout'::text])),
  profile_complete boolean DEFAULT false,
  profile_is_approved boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  profile_approval_status text DEFAULT 'pending'::text CHECK (profile_approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  approved_by uuid,
  approved_at timestamp without time zone,
  profile_rejection_reason text,
  rejected_at timestamp without time zone,
  CONSTRAINT students_pkey PRIMARY KEY (student_id),
  CONSTRAINT students_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT students_dept_fkey FOREIGN KEY (dept_id) REFERENCES public.departments(dept_id),
  CONSTRAINT students_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.training_enrollments (
  enrollment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  student_id uuid NOT NULL,
  college_id uuid NOT NULL,
  enrolled_at timestamp without time zone DEFAULT now(),
  sessions_attended integer DEFAULT 0,
  completion_status text NOT NULL DEFAULT 'enrolled'::text CHECK (completion_status = ANY (ARRAY['enrolled'::text, 'in_progress'::text, 'completed'::text, 'dropped'::text, 'failed'::text])),
  completion_percentage numeric DEFAULT 0,
  certificate_issued boolean DEFAULT false,
  certificate_url text,
  student_feedback text,
  student_rating integer CHECK (student_rating >= 1 AND student_rating <= 5),
  completed_at timestamp without time zone,
  payment_status text DEFAULT 'not_applicable'::text CHECK (payment_status = ANY (ARRAY['not_applicable'::text, 'pending'::text, 'paid'::text, 'waived'::text, 'refunded'::text])),
  amount_paid numeric DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT training_enrollments_pkey PRIMARY KEY (enrollment_id),
  CONSTRAINT training_enrollments_program_student_uq UNIQUE (program_id, student_id),
  CONSTRAINT training_enrollments_program_fkey FOREIGN KEY (program_id) REFERENCES public.training_programs(program_id),
  CONSTRAINT training_enrollments_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id),
  CONSTRAINT training_enrollments_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE INDEX idx_training_enrollments_program_status ON public.training_enrollments (program_id, completion_status);
CREATE TABLE public.training_programs (
  program_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  program_name text NOT NULL,
  program_description text,
  program_type text CHECK (program_type = ANY (ARRAY['aptitude'::text, 'coding'::text, 'soft_skills'::text, 'interview_prep'::text, 'resume_building'::text, 'technical'::text, 'group_discussion'::text, 'other'::text])),
  trainer_name text,
  trainer_organization text,
  start_date date,
  end_date date,
  total_sessions integer,
  session_duration_hours numeric,
  target_dept_ids ARRAY,
  target_passout_year integer,
  max_enrollment integer,
  enrollment_deadline date,
  program_status text NOT NULL DEFAULT 'draft'::text CHECK (program_status = ANY (ARRAY['draft'::text, 'upcoming'::text, 'in_progress'::text, 'on_hold'::text, 'completed'::text, 'cancelled'::text])),
  allow_enrollments boolean NOT NULL DEFAULT false,
  program_fee numeric DEFAULT 0,
  fee_currency text DEFAULT 'INR',
  min_attendance_pct numeric DEFAULT 0 CHECK (min_attendance_pct >= 0 AND min_attendance_pct <= 100),
  created_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT training_programs_pkey PRIMARY KEY (program_id),
  CONSTRAINT training_programs_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT training_programs_creator_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);
CREATE INDEX idx_training_programs_enrollment_access ON public.training_programs (college_id, allow_enrollments) WHERE allow_enrollments = true;
CREATE TABLE public.users (
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  dept_id uuid,
  user_name text NOT NULL,
  user_email text NOT NULL UNIQUE,
  user_password text NOT NULL,
  user_role text NOT NULL CHECK (user_role = ANY (ARRAY['sysadmin'::text, 'collegeadmin'::text, 'teacher'::text, 'hod'::text, 'tpo'::text, 'tpc'::text])),
  user_status text NOT NULL DEFAULT 'active'::text CHECK (user_status = ANY (ARRAY['active'::text, 'inactive'::text])),
  phone_number character varying,
  profile_picture_url text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT users_dept_fkey FOREIGN KEY (dept_id) REFERENCES public.departments(dept_id)
);
CREATE TABLE public.training_sessions (
  session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL,
  college_id uuid NOT NULL,
  session_number integer NOT NULL,
  session_date date,
  session_topic text,
  venue text,
  created_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT training_sessions_pkey PRIMARY KEY (session_id),
  CONSTRAINT training_sessions_program_fkey FOREIGN KEY (program_id) REFERENCES public.training_programs(program_id),
  CONSTRAINT training_sessions_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT training_sessions_creator_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT training_sessions_program_session_uq UNIQUE (program_id, session_number)
);
CREATE INDEX idx_training_sessions_program ON public.training_sessions (program_id, session_number);
CREATE TABLE public.training_session_attendance (
  attendance_id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  college_id uuid NOT NULL,
  present boolean NOT NULL,
  marked_at timestamp without time zone DEFAULT now(),
  marked_by uuid,
  CONSTRAINT training_session_attendance_pkey PRIMARY KEY (attendance_id),
  CONSTRAINT training_session_attendance_session_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT training_session_attendance_enrollment_fkey FOREIGN KEY (enrollment_id) REFERENCES public.training_enrollments(enrollment_id),
  CONSTRAINT training_session_attendance_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT training_session_attendance_marker_fkey FOREIGN KEY (marked_by) REFERENCES public.users(user_id),
  CONSTRAINT training_session_attendance_session_enrollment_uq UNIQUE (session_id, enrollment_id)
);
CREATE INDEX idx_training_session_attendance_session ON public.training_session_attendance (session_id);
CREATE INDEX idx_training_session_attendance_enrollment ON public.training_session_attendance (enrollment_id);

-- ============================================================================
-- E12: College Subscription & Student Quota Management
-- ============================================================================

-- ALTER: colleges table — denormalized subscription status for fast auth middleware check
-- ALTER TABLE public.colleges ADD COLUMN subscription_status text NOT NULL DEFAULT 'none'
--   CHECK (subscription_status IN ('none', 'trial', 'active', 'expired', 'suspended'));

CREATE TABLE public.college_subscriptions (
  subscription_id uuid NOT NULL DEFAULT gen_random_uuid(),
  college_id uuid NOT NULL,
  subscription_status text NOT NULL DEFAULT 'trial'::text CHECK (subscription_status IN ('trial', 'active', 'expired', 'suspended')),
  student_quota integer NOT NULL DEFAULT 50,
  price_per_student numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  trial_ends_at timestamp with time zone,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  grace_period_days integer NOT NULL DEFAULT 7,
  allowed_passout_years integer[],
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT college_subscriptions_pkey PRIMARY KEY (subscription_id),
  CONSTRAINT college_subscriptions_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id),
  CONSTRAINT college_subscriptions_college_valid_from_uq UNIQUE (college_id, valid_from)
);
CREATE TABLE public.subscription_payments (
  payment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL,
  college_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  payment_method text NOT NULL DEFAULT 'bank_transfer'::text CHECK (payment_method IN ('bank_transfer', 'cheque', 'upi', 'cash', 'other')),
  transaction_reference text,
  receipt_number text,
  notes text,
  recorded_by uuid,
  recorded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscription_payments_pkey PRIMARY KEY (payment_id),
  CONSTRAINT subscription_payments_subscription_fkey FOREIGN KEY (subscription_id) REFERENCES public.college_subscriptions(subscription_id),
  CONSTRAINT subscription_payments_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
);
CREATE INDEX idx_students_college_active ON public.students (college_id) WHERE student_status != 'dropout';
CREATE INDEX idx_subscriptions_college_status ON public.college_subscriptions (college_id, subscription_status);
CREATE INDEX idx_payments_subscription ON public.subscription_payments (subscription_id);

-- ============================================================================
-- Migration 016: Off-Campus Placement Self-Reporting
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.self_reported_placements (
    report_id           uuid            NOT NULL DEFAULT gen_random_uuid(),
    student_id          uuid            NOT NULL,
    college_id          uuid            NOT NULL,
    form_data           jsonb           NOT NULL DEFAULT '{}'::jsonb,
    offer_letter_url    text,
    passout_year        integer         NOT NULL,
    verification_status text            NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    rejection_reason    text,
    reviewed_by         uuid,
    reviewed_at         timestamp with time zone,
    resulting_placement_id uuid,
    created_at          timestamp with time zone NOT NULL DEFAULT now(),
    updated_at          timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT self_reported_placements_pkey PRIMARY KEY (report_id),
    CONSTRAINT self_reported_placements_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE,
    CONSTRAINT self_reported_placements_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id) ON DELETE CASCADE,
    CONSTRAINT self_reported_placements_reviewer_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
    CONSTRAINT self_reported_placements_placement_fkey FOREIGN KEY (resulting_placement_id) REFERENCES public.placement_results(placement_id) ON DELETE SET NULL,
    CONSTRAINT self_reported_reject_reason_check CHECK (verification_status != 'rejected' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) >= 5)),
    CONSTRAINT self_reported_review_fields_check CHECK ((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT self_reported_placement_link_check CHECK (resulting_placement_id IS NULL OR verification_status = 'approved'),
    CONSTRAINT self_reported_form_data_check CHECK (form_data ? 'company_name' AND form_data ? 'job_title' AND form_data ? 'placement_type' AND length(form_data->>'company_name') >= 2 AND length(form_data->>'job_title') >= 3)
);
CREATE INDEX IF NOT EXISTS idx_self_report_college_status ON public.self_reported_placements (college_id, verification_status) WHERE verification_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_self_report_college_status_all ON public.self_reported_placements (college_id, verification_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_self_report_student ON public.self_reported_placements (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_self_report_college_year ON public.self_reported_placements (college_id, passout_year);
CREATE INDEX IF NOT EXISTS idx_self_report_form_data ON public.self_reported_placements USING gin (form_data jsonb_path_ops);
CREATE UNIQUE INDEX IF NOT EXISTS idx_self_report_no_duplicate ON public.self_reported_placements (student_id, college_id, (form_data->>'company_name'), (form_data->>'job_title')) WHERE verification_status != 'rejected';

-- ============================================================================
-- Migration 017: Skill-Based Job Matching
-- ============================================================================

CREATE TABLE public.job_required_skills (
    job_skill_id    uuid            NOT NULL DEFAULT gen_random_uuid(),
    job_id          uuid            NOT NULL,
    skill_id        uuid            NOT NULL,
    created_at      timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT job_required_skills_pkey PRIMARY KEY (job_skill_id),
    CONSTRAINT job_required_skills_job_fkey FOREIGN KEY (job_id) REFERENCES public.job_postings(job_id) ON DELETE CASCADE,
    CONSTRAINT job_required_skills_skill_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id) ON DELETE CASCADE,
    CONSTRAINT job_required_skills_job_skill_unique UNIQUE (job_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_job_required_skills_job ON public.job_required_skills (job_id);

-- ============================================================================
-- Migration 018: Dynamic Role-Based Permissions + Multi-Department Users
-- ============================================================================

CREATE TABLE public.college_role_permissions (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    college_id      uuid            NOT NULL,
    role            text            NOT NULL,
    permissions     jsonb           NOT NULL DEFAULT '[]'::jsonb,
    dept_scoped     boolean         NOT NULL DEFAULT false,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT college_role_permissions_pkey PRIMARY KEY (id),
    CONSTRAINT college_role_permissions_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id) ON DELETE CASCADE,
    CONSTRAINT college_role_permissions_role_check CHECK (role IN ('tpo', 'tpc', 'hod', 'teacher')),
    CONSTRAINT college_role_permissions_college_role_uq UNIQUE (college_id, role)
);
CREATE INDEX IF NOT EXISTS idx_college_role_permissions_lookup ON public.college_role_permissions (college_id, role);

CREATE TABLE public.user_departments (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    user_id         uuid            NOT NULL,
    dept_id         uuid            NOT NULL,
    college_id      uuid            NOT NULL,
    assigned_at     timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT user_departments_pkey PRIMARY KEY (id),
    CONSTRAINT user_departments_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT user_departments_dept_fkey FOREIGN KEY (dept_id) REFERENCES public.departments(dept_id) ON DELETE CASCADE,
    CONSTRAINT user_departments_college_fkey FOREIGN KEY (college_id) REFERENCES public.colleges(college_id) ON DELETE CASCADE,
    CONSTRAINT user_departments_user_dept_uq UNIQUE (user_id, dept_id)
);
CREATE INDEX IF NOT EXISTS idx_user_departments_user ON public.user_departments (user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept ON public.user_departments (dept_id, college_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_college ON public.user_departments (college_id);