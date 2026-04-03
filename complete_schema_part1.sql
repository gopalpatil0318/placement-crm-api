-- =====================================================
-- COMPLETE PLACEMENT CRM SCHEMA - PART 1
-- Student & College Tables
-- =====================================================
-- Run this file FIRST before Part 2
-- =====================================================

-- 1. COLLEGES
CREATE TABLE public.colleges (
  college_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_name TEXT NOT NULL,
  college_subdomain TEXT NOT NULL,
  college_address TEXT,
  college_city TEXT,
  college_taluka TEXT,
  college_district TEXT,
  college_state TEXT,
  college_pincode VARCHAR(6),
  college_type TEXT NOT NULL,
  college_status TEXT NOT NULL DEFAULT 'active',
  enabled_features JSONB NOT NULL DEFAULT '["core"]'::jsonb,
  default_academic_year INTEGER NOT NULL,
  college_logo_url TEXT,
  college_website TEXT,
  college_affiliation TEXT,
  college_established_year INTEGER,
  college_description TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT colleges_pkey PRIMARY KEY (college_id),
  CONSTRAINT colleges_subdomain_key UNIQUE (college_subdomain),
  CONSTRAINT colleges_status_check CHECK (college_status IN ('active', 'inactive')),
  CONSTRAINT colleges_type_check CHECK (college_type IN ('engineering', 'diploma', 'mba', 'polytechnic', 'degree', 'medical'))
) TABLESPACE pg_default;

CREATE INDEX idx_colleges_subdomain ON public.colleges USING btree (college_subdomain);
CREATE INDEX idx_colleges_enabled_features ON public.colleges USING gin (enabled_features);
CREATE INDEX idx_colleges_type ON public.colleges USING btree (college_type);
CREATE INDEX idx_colleges_status ON public.colleges USING btree (college_status);

-- 2. DEPARTMENTS
CREATE TABLE public.departments (
  dept_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  dept_name TEXT NOT NULL,
  dept_code TEXT,
  dept_type TEXT,
  program_duration_years INTEGER DEFAULT 4,
  total_semesters INTEGER DEFAULT 8,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT departments_pkey PRIMARY KEY (dept_id),
  CONSTRAINT departments_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT unique_dept_per_college UNIQUE (college_id, dept_name)
) TABLESPACE pg_default;

CREATE INDEX idx_departments_college ON public.departments(college_id);
CREATE INDEX idx_departments_college_active ON public.departments(college_id, is_active) WHERE is_active = true;



-- 3. STUDENTS (Consolidated - name, email, department, passout_year here)
CREATE TABLE public.students (
  student_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  student_email TEXT NOT NULL,
  student_password TEXT NOT NULL,
  dept_id UUID NOT NULL,
  student_passout_year INTEGER NOT NULL,
  student_status TEXT NOT NULL DEFAULT 'active',
  profile_complete BOOLEAN DEFAULT FALSE,
  profile_is_approved BOOLEAN DEFAULT FALSE,
  profile_approval_status TEXT DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMP WITHOUT TIME ZONE,
  profile_rejection_reason TEXT,
  rejected_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT students_pkey PRIMARY KEY (student_id),
  CONSTRAINT students_email_unique UNIQUE (college_id, student_email),
  CONSTRAINT students_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT students_dept_fkey FOREIGN KEY (dept_id) REFERENCES departments(dept_id) ON DELETE RESTRICT,
  CONSTRAINT students_status_check CHECK (student_status IN ('active', 'inactive', 'suspended', 'graduated', 'dropout')),
  CONSTRAINT profile_approval_status_check CHECK (profile_approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT students_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(user_id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX idx_students_college ON public.students(college_id);
CREATE INDEX idx_students_email ON public.students(student_email);
CREATE INDEX idx_students_email_college_lower ON public.students(college_id, LOWER(student_email));
CREATE INDEX idx_students_dept ON public.students(dept_id);
CREATE INDEX idx_students_passout_year ON public.students(student_passout_year);
CREATE INDEX idx_students_status ON public.students(student_status);
CREATE INDEX idx_students_approval_status ON public.students(college_id, profile_approval_status)
  WHERE profile_complete = true;
CREATE INDEX idx_students_college_dept_passout ON public.students(college_id, dept_id, student_passout_year);

-- 5. STUDENT PERSONAL INFORMATION (No first/middle/last name, no email, no religion)
CREATE TABLE public.student_personal_information (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  mobile_number VARCHAR(10),
  alternate_mobile VARCHAR(10),
  birth_date DATE,
  gender TEXT,
  blood_group TEXT,
  aadhaar_number VARCHAR(12),
  caste TEXT,
  category TEXT,
  nationality TEXT DEFAULT 'Indian',
  father_name TEXT,
  father_mobile VARCHAR(10),
  father_occupation TEXT,
  father_annual_income NUMERIC(10,2),
  mother_name TEXT,
  mother_mobile VARCHAR(10),
  mother_occupation TEXT,
  mother_annual_income NUMERIC(10,2),
  guardian_name TEXT,
  guardian_mobile VARCHAR(10),
  permanent_address TEXT,
  permanent_city TEXT,
  permanent_district TEXT,
  permanent_state TEXT,
  permanent_pincode VARCHAR(6),
  current_address TEXT,
  current_city TEXT,
  current_district TEXT,
  current_state TEXT,
  current_pincode VARCHAR(6),
  same_as_permanent BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_personal_information_pkey PRIMARY KEY (id),
  CONSTRAINT student_personal_information_student_unique UNIQUE (student_id),
  CONSTRAINT fk_personal_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_personal_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT gender_check CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  CONSTRAINT category_check CHECK (category IN ('General', 'OBC', 'OBC-NCL', 'SC', 'ST', 'EWS', 'NT', 'NT-A', 'NT-B', 'NT-C', 'NT-D', 'VJ', 'VJ-A', 'SBC', 'SEBC', 'DT/DNT', 'Open'))
) TABLESPACE pg_default;

CREATE INDEX idx_personal_student ON public.student_personal_information(student_id);
CREATE INDEX idx_personal_info_student_college ON public.student_personal_information(student_id, college_id);

-- 6. STUDENT ACADEMIC INFORMATION
CREATE TABLE public.student_academic_information (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  roll_number TEXT,
  enrollment_number TEXT,
  admission_year INTEGER,
  admission_based_on TEXT,
  tenth_percentage NUMERIC(5,2),
  tenth_board TEXT,
  tenth_passing_year INTEGER,
  twelfth_or_diploma TEXT,
  twelfth_percentage NUMERIC(5,2),
  twelfth_board TEXT,
  diploma_percentage NUMERIC(5,2),
  diploma_branch TEXT,
  higher_education_passing_year INTEGER,
  overall_cgpa NUMERIC(4,2),
  total_live_kts INTEGER DEFAULT 0,
  total_dead_kts INTEGER DEFAULT 0,
  any_gap_during_education BOOLEAN DEFAULT FALSE,
  gap_years INTEGER DEFAULT 0,
  gap_reason TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_academic_information_pkey PRIMARY KEY (id),
  CONSTRAINT student_academic_student_unique UNIQUE (student_id),
  CONSTRAINT roll_number_college_unique UNIQUE (roll_number, college_id),
  CONSTRAINT fk_academic_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_academic_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT twelfth_diploma_check CHECK (twelfth_or_diploma IN ('12th', 'Diploma')),
  CONSTRAINT admission_check CHECK (admission_based_on IN ('JEE', 'MHT-CET', 'GATE', 'Direct', 'Management', 'CAT', 'Other'))
) TABLESPACE pg_default;

CREATE INDEX idx_academic_student ON public.student_academic_information(student_id);
CREATE INDEX idx_academic_info_student_college ON public.student_academic_information(student_id, college_id);
CREATE INDEX idx_academic_roll ON public.student_academic_information(roll_number);

-- 7. SEMESTER GRADES (Flexible - works for diploma/engineering/MBA/5-year)
CREATE TABLE public.student_semester_grades (
  grade_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  dept_id UUID NOT NULL,
  semester_number INTEGER NOT NULL,
  academic_year TEXT,
  sgpa NUMERIC(4,2),
  cgpa NUMERIC(4,2),
  backlogs_in_semester INTEGER DEFAULT 0,
  backlog_subjects TEXT[],
  semester_status TEXT DEFAULT 'in_progress',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_semester_grades_pkey PRIMARY KEY (grade_id),
  CONSTRAINT unique_student_semester UNIQUE (student_id, semester_number),
  CONSTRAINT fk_semester_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_semester_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT fk_semester_dept FOREIGN KEY (dept_id) REFERENCES departments(dept_id) ON DELETE RESTRICT,
  CONSTRAINT semester_status_check CHECK (semester_status IN ('in_progress', 'completed', 'detained', 'failed')),
  CONSTRAINT semester_number_check CHECK (semester_number >= 1 AND semester_number <= 12)
) TABLESPACE pg_default;

CREATE INDEX idx_semester_grades_student ON public.student_semester_grades(student_id);
CREATE INDEX idx_semester_grades_student_college_sem ON public.student_semester_grades(student_id, college_id, semester_number);
CREATE INDEX idx_semester_grades_semester ON public.student_semester_grades(semester_number);

-- 7. SKILLS
CREATE TABLE public.skills (
  skill_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  skill_name TEXT NOT NULL,
  skill_category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT skills_pkey PRIMARY KEY (skill_id),
  CONSTRAINT skills_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE UNIQUE INDEX skills_name_college_unique ON public.skills USING btree (college_id, lower(skill_name));
CREATE INDEX idx_skills_college ON public.skills(college_id);

-- 9. STUDENT SKILLS
CREATE TABLE public.student_skills (
  student_skill_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  skill_id UUID NOT NULL,
  proficiency_level TEXT NOT NULL DEFAULT 'intermediate',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_skills_pkey PRIMARY KEY (student_skill_id),
  CONSTRAINT student_skill_unique UNIQUE (student_id, skill_id),
  CONSTRAINT student_skills_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT student_skills_skill_fkey FOREIGN KEY (skill_id) REFERENCES skills(skill_id) ON DELETE CASCADE,
  CONSTRAINT student_skills_student_fkey FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT proficiency_check CHECK (proficiency_level IN ('beginner', 'intermediate', 'advanced', 'expert'))
) TABLESPACE pg_default;

CREATE INDEX idx_student_skills_student ON public.student_skills(student_id);
CREATE INDEX idx_student_skills_student_college ON public.student_skills(student_id, college_id);
CREATE INDEX idx_student_skills_skill ON public.student_skills(skill_id);

-- 10. STUDENT PROJECTS (Unlimited)
CREATE TABLE public.student_projects (
  project_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  project_title TEXT NOT NULL,
  project_description TEXT,
  project_type TEXT,
  project_url TEXT,
  github_link TEXT,
  demo_link TEXT,
  technologies_used TEXT[],
  start_date DATE,
  end_date DATE,
  is_ongoing BOOLEAN DEFAULT FALSE,
  team_size INTEGER,
  role_in_project TEXT,
  display_order INTEGER,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_projects_pkey PRIMARY KEY (project_id),
  CONSTRAINT fk_projects_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT project_type_check CHECK (project_type IN ('academic', 'personal', 'internship', 'freelance', 'research', 'open_source'))
) TABLESPACE pg_default;

CREATE INDEX idx_projects_student ON public.student_projects(student_id);
CREATE INDEX idx_projects_student_college ON public.student_projects(student_id, college_id);

-- 11. STUDENT EXPERIENCE
CREATE TABLE public.student_experience (
  experience_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  company_website TEXT,
  position_title TEXT NOT NULL,
  employment_type TEXT,
  job_description TEXT,
  responsibilities TEXT[],
  technologies_used TEXT[],
  work_location TEXT,
  work_mode TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  is_current BOOLEAN DEFAULT FALSE,
  duration_months INTEGER,
  stipend_amount NUMERIC(10,2), -- Optional, private
  offer_letter_url TEXT,
  completion_certificate_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT 'pending',
  verified_by UUID,
  verified_at TIMESTAMP WITHOUT TIME ZONE,
  rejection_reason TEXT,
  rejected_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_experience_pkey PRIMARY KEY (experience_id),
  CONSTRAINT fk_experience_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_experience_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT employment_type_check CHECK (employment_type IN ('internship', 'full-time', 'part-time', 'freelance', 'contract')),
  CONSTRAINT work_mode_check CHECK (work_mode IN ('on-site', 'remote', 'hybrid')),
  CONSTRAINT exp_verification_status_check CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT fk_experience_verified_by FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX idx_experience_student ON public.student_experience(student_id);
CREATE INDEX idx_experience_student_college_status ON public.student_experience(student_id, college_id, verification_status);
CREATE INDEX idx_experience_verification ON public.student_experience(college_id, verification_status);

-- 12. ACHIEVEMENTS
CREATE TABLE public.student_achievements (
  achievement_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  achievement_title TEXT NOT NULL,
  achievement_description TEXT,
  achievement_type TEXT,
  issuing_organization TEXT,
  event_name TEXT,
  achievement_level TEXT,
  position_rank TEXT,
  participants_count INTEGER,
  achievement_date DATE,
  certificate_url TEXT,
  proof_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT 'pending',
  verified_by UUID,
  verified_at TIMESTAMP WITHOUT TIME ZONE,
  rejection_reason TEXT,
  rejected_at TIMESTAMP WITHOUT TIME ZONE,
  is_featured BOOLEAN DEFAULT FALSE,
  display_order INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_achievements_pkey PRIMARY KEY (achievement_id),
  CONSTRAINT fk_achievements_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_achievements_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT achievement_type_check CHECK (achievement_type IN ('competition', 'hackathon', 'award', 'certification', 'publication', 'research', 'sports', 'cultural')),
  CONSTRAINT achievement_level_check CHECK (achievement_level IN ('international', 'national', 'state', 'university', 'college', 'departmental')),
  CONSTRAINT ach_verification_status_check CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT fk_achievements_verified_by FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX idx_achievements_student ON public.student_achievements(student_id);
CREATE INDEX idx_achievements_student_college_status ON public.student_achievements(student_id, college_id, verification_status);
CREATE INDEX idx_achievements_verification ON public.student_achievements(college_id, verification_status);

-- 13. CERTIFICATES
CREATE TABLE public.student_certificates (
  certificate_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  certificate_name TEXT NOT NULL,
  certificate_description TEXT,
  certificate_type TEXT,
  issuing_organization TEXT NOT NULL,
  issuing_platform TEXT,
  credential_id TEXT,
  credential_url TEXT,
  issue_date DATE,
  expiry_date DATE,
  does_not_expire BOOLEAN DEFAULT TRUE,
  skills_covered TEXT[],
  certificate_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT 'pending',
  verified_by UUID,
  verified_at TIMESTAMP WITHOUT TIME ZONE,
  rejection_reason TEXT,
  rejected_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_certificates_pkey PRIMARY KEY (certificate_id),
  CONSTRAINT fk_certificates_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_certificates_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT certificate_type_check CHECK (certificate_type IN ('course', 'training', 'workshop', 'seminar', 'certification', 'bootcamp')),
  CONSTRAINT cert_verification_status_check CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT fk_certificates_verified_by FOREIGN KEY (verified_by) REFERENCES users(user_id) ON DELETE SET NULL
) TABLESPACE pg_default;

CREATE INDEX idx_certificates_student ON public.student_certificates(student_id);
CREATE INDEX idx_certificates_student_college_status ON public.student_certificates(student_id, college_id, verification_status);
CREATE INDEX idx_certificates_verification ON public.student_certificates(college_id, verification_status);

-- 14. EXTRA-CURRICULAR ACTIVITIES
CREATE TABLE public.student_activities (
  activity_id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  activity_name TEXT NOT NULL,
  activity_description TEXT,
  activity_type TEXT,
  organizing_body TEXT,
  role_position TEXT,
  start_date DATE,
  end_date DATE,
  is_ongoing BOOLEAN DEFAULT FALSE,
  hours_contributed INTEGER,
  certificate_url TEXT,
  proof_urls TEXT[],
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_activities_pkey PRIMARY KEY (activity_id),
  CONSTRAINT fk_activities_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_activities_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT activity_type_check CHECK (activity_type IN ('sports', 'cultural', 'technical', 'social', 'volunteer', 'arts', 'nss', 'ncc'))
) TABLESPACE pg_default;

CREATE INDEX idx_activities_student ON public.student_activities(student_id);
CREATE INDEX idx_activities_student_college ON public.student_activities(student_id, college_id);

-- 15. STUDENT PROFILE LINKS (Professional only - no Instagram/Twitter)
CREATE TABLE public.student_profile_links (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  college_id UUID NOT NULL,
  personal_portfolio_url TEXT,
  resume_url TEXT,
  profile_image_url TEXT,
  github_url TEXT,
  linkedin_url TEXT,
  leetcode_url TEXT,
  codechef_url TEXT,
  codeforces_url TEXT,
  hackerrank_url TEXT,
  geeksforgeeks_url TEXT,
  medium_url TEXT,
  bio TEXT,
  area_of_interest TEXT[],
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT student_profile_links_pkey PRIMARY KEY (id),
  CONSTRAINT student_profile_links_student_unique UNIQUE (student_id),
  CONSTRAINT fk_profile_links_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_links_college FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX idx_profile_links_student ON public.student_profile_links(student_id);
CREATE INDEX idx_profile_links_student_college ON public.student_profile_links(student_id, college_id);

-- 16. USERS
CREATE TABLE public.users (
  user_id UUID NOT NULL DEFAULT gen_random_uuid(),
  college_id UUID NOT NULL,
  dept_id UUID,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_password TEXT NOT NULL,
  user_role TEXT NOT NULL,
  user_status TEXT NOT NULL DEFAULT 'active',
  phone_number VARCHAR(10),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_email_key UNIQUE (user_email),
  CONSTRAINT users_college_fkey FOREIGN KEY (college_id) REFERENCES colleges(college_id) ON DELETE CASCADE,
  CONSTRAINT users_dept_fkey FOREIGN KEY (dept_id) REFERENCES departments(dept_id) ON DELETE SET NULL,
  CONSTRAINT users_role_check CHECK (user_role IN ('sysadmin', 'collegeadmin', 'teacher', 'hod', 'tpo', 'tpc')),
  CONSTRAINT users_status_check CHECK (user_status IN ('active', 'inactive'))
) TABLESPACE pg_default;

CREATE INDEX idx_users_college ON public.users(college_id);
CREATE INDEX idx_users_email ON public.users(user_email);
CREATE INDEX idx_users_role ON public.users(user_role);
CREATE INDEX idx_users_college_role_active ON public.users(college_id, user_role) WHERE user_status = 'active';
