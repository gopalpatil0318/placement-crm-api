-- ============================================================================
-- Migration 017: Skill-Based Job Matching
-- ============================================================================
-- Adds infrastructure for matching student skills against job requirements.
--
-- 1. New `job_required_skills` table linking jobs → skills from the catalog
-- 2. New `min_skill_match_percentage` column on `job_eligibility_criteria`
-- 3. Missing indexes + unique constraint on `student_skills`
-- 4. Adds 'job_criteria' to audit_log resource_type CHECK constraint
-- ============================================================================


-- ============================================================================
-- 1. JOB REQUIRED SKILLS TABLE
-- ============================================================================
-- Stores which skills from the college's skill catalog are required for a job.
-- Used for skill-based eligibility matching against `student_skills`.
-- ON DELETE CASCADE: removing a job or a skill auto-cleans this junction table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_required_skills (
    job_skill_id    uuid            NOT NULL DEFAULT gen_random_uuid(),
    job_id          uuid            NOT NULL,
    skill_id        uuid            NOT NULL,
    created_at      timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT job_required_skills_pkey PRIMARY KEY (job_skill_id),

    CONSTRAINT job_required_skills_job_fkey
        FOREIGN KEY (job_id) REFERENCES public.job_postings (job_id)
        ON DELETE CASCADE,

    CONSTRAINT job_required_skills_skill_fkey
        FOREIGN KEY (skill_id) REFERENCES public.skills (skill_id)
        ON DELETE CASCADE,

    CONSTRAINT job_required_skills_job_skill_unique
        UNIQUE (job_id, skill_id)
);

-- Fast lookup of all required skills for a given job
CREATE INDEX IF NOT EXISTS idx_job_required_skills_job
    ON public.job_required_skills (job_id);


-- ============================================================================
-- 2. ADD min_skill_match_percentage TO job_eligibility_criteria
-- ============================================================================
-- NULL = skill matching disabled (no filtering by skills).
-- 0   = any student passes regardless of skills.
-- 100 = student must have ALL required skills.
-- ============================================================================

ALTER TABLE public.job_eligibility_criteria
    ADD COLUMN IF NOT EXISTS min_skill_match_percentage integer DEFAULT NULL;

-- Add CHECK constraint separately so IF NOT EXISTS on ALTER doesn't conflict
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'job_eligibility_criteria_skill_match_pct_check'
    ) THEN
        ALTER TABLE public.job_eligibility_criteria
            ADD CONSTRAINT job_eligibility_criteria_skill_match_pct_check
            CHECK (min_skill_match_percentage >= 0 AND min_skill_match_percentage <= 100);
    END IF;
END $$;


-- ============================================================================
-- 3. MISSING INDEXES ON student_skills
-- ============================================================================
-- The student_skills table had NO secondary indexes beyond the PK.
-- These are essential for performant skill matching at scale.
-- ============================================================================

-- Fetch all skills for a student (used in profile view + eligibility check)
CREATE INDEX IF NOT EXISTS idx_student_skills_student
    ON public.student_skills (student_id, college_id);

-- Find all students who have a specific skill (used in eligible-students preview)
CREATE INDEX IF NOT EXISTS idx_student_skills_skill
    ON public.student_skills (skill_id, college_id);

-- Prevent duplicate (student_id, skill_id) rows — the syncMySkills service
-- assumes uniqueness but the DB never enforced it
-- Clean up any existing duplicates before creating unique index
DELETE FROM public.student_skills
WHERE student_skill_id NOT IN (
    SELECT DISTINCT ON (student_id, skill_id) student_skill_id
    FROM public.student_skills
    ORDER BY student_id, skill_id, created_at ASC
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_skills_unique
    ON public.student_skills (student_id, skill_id);


-- ============================================================================
-- 4. ADD 'job_criteria' TO audit_log resource_type CHECK
-- ============================================================================
-- Enables audit logging for eligibility criteria changes with old/new diffs.
-- Drop-and-recreate pattern consistent with migration 016.
-- ============================================================================

ALTER TABLE public.audit_log
    DROP CONSTRAINT IF EXISTS audit_log_resource_type_check;

ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_resource_type_check
    CHECK (resource_type = ANY (ARRAY[
        'application'::text, 'placement'::text, 'restriction'::text,
        'policy'::text, 'override'::text, 'job'::text, 'student'::text,
        'user'::text, 'training'::text, 'company'::text, 'department'::text,
        'skill'::text, 'company_tier'::text, 'placement_setting'::text,
        'self_report'::text, 'job_criteria'::text
    ]));
