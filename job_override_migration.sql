-- ============================================================================
-- MIGRATION: Job Eligibility Override System + Multi-Year Passout Support
-- ============================================================================
-- Run this migration on your existing database.
-- Safe to run on production — all steps use ALTER TABLE / ADD COLUMN patterns.
-- Total steps: 7
-- ============================================================================

-- ============================================================================
-- STEP 1: Add passout_years array to job_postings (replaces passout_year)
-- ============================================================================

-- 1a. Add new array column
ALTER TABLE job_postings ADD COLUMN passout_years INTEGER[];

-- 1b. Populate from existing single-year value
UPDATE job_postings SET passout_years = ARRAY[passout_year];

-- 1c. Make it NOT NULL after backfill
ALTER TABLE job_postings ALTER COLUMN passout_years SET NOT NULL;

-- 1d. Drop old column
ALTER TABLE job_postings DROP COLUMN passout_year;

-- 1e. Drop the old B-Tree index and create a GIN index for array containment queries
DROP INDEX IF EXISTS idx_job_postings_year;
CREATE INDEX idx_job_postings_year ON public.job_postings USING GIN(passout_years);

-- ============================================================================
-- STEP 2: Update passout_year in job_eligibility_criteria
-- ============================================================================

-- 2a. Add new array column
ALTER TABLE job_eligibility_criteria ADD COLUMN passout_years INTEGER[];

-- 2b. Copy values from the matching job's new passout_years
UPDATE job_eligibility_criteria jec
  SET passout_years = jp.passout_years
  FROM job_postings jp
  WHERE jec.job_id = jp.job_id;

-- 2c. Drop old column (was NOT NULL but now nullable array covers it)
ALTER TABLE job_eligibility_criteria DROP COLUMN passout_year;

-- ============================================================================
-- STEP 3: Create job_eligibility_override_requests table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_eligibility_override_requests (
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

CREATE INDEX IF NOT EXISTS idx_job_override_student ON public.job_eligibility_override_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_job_override_job ON public.job_eligibility_override_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_job_override_college ON public.job_eligibility_override_requests(college_id);
CREATE INDEX IF NOT EXISTS idx_job_override_status ON public.job_eligibility_override_requests(override_status);

-- ============================================================================
-- STEP 4: Add override_id to student_applications (audit trail)
-- ============================================================================

ALTER TABLE student_applications ADD COLUMN IF NOT EXISTS override_id UUID;

ALTER TABLE student_applications
  ADD CONSTRAINT student_app_override_fkey
  FOREIGN KEY (override_id)
  REFERENCES job_eligibility_override_requests(override_id)
  ON DELETE SET NULL;

-- ============================================================================
-- STEP 5: Add new notification types to check constraint
-- ============================================================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notification_type_check;

ALTER TABLE notifications ADD CONSTRAINT notification_type_check CHECK (
  notification_type IN (
    'new_job_posted', 'application_received', 'application_status_changed',
    'round_scheduled', 'round_result', 'offer_received', 'deadline_reminder',
    'restriction_applied', 'restriction_removed', 'training_enrollment',
    'training_completed', 'profile_incomplete',
    'eligibility_override_requested', 'eligibility_override_approved', 'eligibility_override_rejected',
    'general'
  )
);

-- ============================================================================
-- STEP 6: Update views that reference jp.passout_year
-- ============================================================================

CREATE OR REPLACE VIEW v_company_application_stats AS
SELECT
  jp.job_id, co.company_name, jp.job_title, jp.passout_years,
  COUNT(DISTINCT sa.student_id) AS total_applications,
  COUNT(DISTINCT CASE WHEN sa.application_status = 'selected' THEN sa.student_id END) AS selected,
  COUNT(DISTINCT CASE WHEN sa.application_status = 'rejected' THEN sa.student_id END) AS rejected
FROM job_postings jp
JOIN companies co ON jp.company_id = co.company_id
LEFT JOIN student_applications sa ON jp.job_id = sa.job_id
GROUP BY jp.job_id, co.company_name, jp.job_title, jp.passout_years;

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

-- ============================================================================
-- STEP 7: Add trigger for updated_at on override requests (optional but consistent)
-- ============================================================================

-- No updated_at column in override_requests — status changes tracked via reviewed_at.
-- Migration complete.

-- ============================================================================
-- VERIFICATION QUERIES (run these after migration to confirm)
-- ============================================================================

-- Check job_postings columns:
-- SELECT job_id, passout_years FROM job_postings LIMIT 5;

-- Check job_eligibility_criteria columns:
-- SELECT criteria_id, passout_years FROM job_eligibility_criteria LIMIT 5;

-- Check override table created:
-- SELECT COUNT(*) FROM job_eligibility_override_requests;

-- Check student_applications override_id column:
-- SELECT override_id FROM student_applications LIMIT 1;

-- Check notification constraint updated:
-- INSERT INTO notifications (..., notification_type) VALUES (..., 'eligibility_override_approved') -- should work
