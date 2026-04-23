-- ============================================================================
-- Migration 016: Off-Campus Placement Self-Reporting
-- ============================================================================
-- Adds a staging table for student-submitted off-campus placement reports.
-- Students fill a form → row enters this table as 'pending' → college admin
-- reviews → on approval, recordExternalPlacement() creates the real placement
-- in placement_results. On rejection, the row stays for audit trail.
--
-- Also updates CHECK constraints on audit_log and notifications tables to
-- support the new resource type and notification types.
-- ============================================================================

-- ============================================================================
-- 1. SELF-REPORTED PLACEMENTS TABLE (staging / request queue)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.self_reported_placements (
    -- Primary key
    report_id           uuid            NOT NULL DEFAULT gen_random_uuid(),

    -- Who submitted
    student_id          uuid            NOT NULL,
    college_id          uuid            NOT NULL,

    -- Form data as JSONB (company_name, company_id, job_title, placement_type,
    -- drive_type, fulltime_package, fulltime_designation, fulltime_joining_date,
    -- internship_stipend, internship_duration, internship_start_date,
    -- job_location, offer_date, remarks)
    form_data           jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Offer letter stored separately for file cleanup on reject/cancel
    offer_letter_url    text,

    -- Denormalized for efficient filtering (avoids JSONB extraction in WHERE)
    passout_year        integer         NOT NULL,

    -- Verification workflow
    verification_status text            NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending', 'approved', 'rejected')),
    rejection_reason    text,
    reviewed_by         uuid,
    reviewed_at         timestamp with time zone,

    -- Link to real placement after approval
    resulting_placement_id uuid,

    -- Timestamps
    created_at          timestamp with time zone NOT NULL DEFAULT now(),
    updated_at          timestamp with time zone NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT self_reported_placements_pkey
        PRIMARY KEY (report_id),
    CONSTRAINT self_reported_placements_student_fkey
        FOREIGN KEY (student_id) REFERENCES public.students(student_id) ON DELETE CASCADE,
    CONSTRAINT self_reported_placements_college_fkey
        FOREIGN KEY (college_id) REFERENCES public.colleges(college_id) ON DELETE CASCADE,
    CONSTRAINT self_reported_placements_reviewer_fkey
        FOREIGN KEY (reviewed_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
    CONSTRAINT self_reported_placements_placement_fkey
        FOREIGN KEY (resulting_placement_id) REFERENCES public.placement_results(placement_id) ON DELETE SET NULL,

    -- Rejection reason required when rejected
    CONSTRAINT self_reported_reject_reason_check
        CHECK (
            verification_status != 'rejected'
            OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) >= 5)
        ),

    -- Reviewed fields must be set together
    CONSTRAINT self_reported_review_fields_check
        CHECK (
            (reviewed_by IS NULL AND reviewed_at IS NULL)
            OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
        ),

    -- Resulting placement only set when approved
    CONSTRAINT self_reported_placement_link_check
        CHECK (
            resulting_placement_id IS NULL
            OR verification_status = 'approved'
        ),

    -- form_data must have required fields
    CONSTRAINT self_reported_form_data_check
        CHECK (
            form_data ? 'company_name'
            AND form_data ? 'job_title'
            AND form_data ? 'placement_type'
            AND length(form_data->>'company_name') >= 2
            AND length(form_data->>'job_title') >= 3
        )
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Admin queue: filter by college + status (most queries filter on pending)
CREATE INDEX IF NOT EXISTS idx_self_report_college_status
    ON public.self_reported_placements (college_id, verification_status)
    WHERE verification_status = 'pending';

-- Also a general index for all statuses (admin views approved/rejected history)
CREATE INDEX IF NOT EXISTS idx_self_report_college_status_all
    ON public.self_reported_placements (college_id, verification_status, created_at DESC);

-- Student's own reports
CREATE INDEX IF NOT EXISTS idx_self_report_student
    ON public.self_reported_placements (student_id, created_at DESC);

-- Stats/dashboard queries by college + year
CREATE INDEX IF NOT EXISTS idx_self_report_college_year
    ON public.self_reported_placements (college_id, passout_year);

-- GIN index on form_data for JSONB field extraction in search queries
CREATE INDEX IF NOT EXISTS idx_self_report_form_data
    ON public.self_reported_placements USING gin (form_data jsonb_path_ops);

-- ============================================================================
-- 3. PARTIAL UNIQUE CONSTRAINT — prevent duplicate pending/approved reports
-- ============================================================================
-- A student cannot have two pending or approved reports for the same
-- company_name + job_title combo. Rejected reports are excluded so the
-- student can re-submit after a rejection.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_report_no_duplicate
    ON public.self_reported_placements (
        student_id,
        college_id,
        (form_data->>'company_name'),
        (form_data->>'job_title')
    )
    WHERE verification_status != 'rejected';

-- ============================================================================
-- 4. UPDATED_AT TRIGGER — auto-update on row modification
-- ============================================================================

-- Create the trigger function if it doesn't exist (reusable across tables)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_self_reported_placements_updated_at
    BEFORE UPDATE ON public.self_reported_placements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5. ALTER audit_log — add 'self_report' to resource_type CHECK
-- ============================================================================
-- Drop and recreate the CHECK constraint to include the new value.
-- This is safe because no existing data uses the new value.
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
        'self_report'::text
    ]));

-- ============================================================================
-- 6. ALTER notifications — add self-report notification types
-- ============================================================================

ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_notification_type_check;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_notification_type_check
    CHECK (notification_type = ANY (ARRAY[
        -- Existing types
        'new_job_posted'::text, 'application_received'::text,
        'application_status_changed'::text, 'round_scheduled'::text,
        'round_result'::text, 'offer_received'::text,
        'deadline_reminder'::text, 'restriction_applied'::text,
        'restriction_removed'::text, 'training_enrollment'::text,
        'training_completed'::text, 'profile_incomplete'::text,
        'profile_approved'::text, 'profile_rejected'::text,
        'item_verified'::text, 'item_rejected'::text,
        'eligibility_override_requested'::text,
        'eligibility_override_approved'::text,
        'eligibility_override_rejected'::text,
        'general'::text, 'offer_expiring'::text, 'offer_expired'::text,
        'offer_declined'::text, 'offer_revoked'::text,
        'offer_accepted'::text, 'auto_withdrawn'::text,
        'waitlist_promoted'::text, 'round_processing_complete'::text,
        -- New self-report types
        'self_report_submitted'::text,
        'self_report_approved'::text,
        'self_report_rejected'::text
    ]));

-- ============================================================================
-- 7. COMMENTS — document the table and key columns
-- ============================================================================

COMMENT ON TABLE public.self_reported_placements IS
    'Staging table for student-submitted off-campus placement reports. '
    'Pending reports are reviewed by college admins. Approved reports trigger '
    'recordExternalPlacement() which creates real placement_results rows.';

COMMENT ON COLUMN public.self_reported_placements.form_data IS
    'JSONB containing all form fields: company_name (required), company_id (nullable UUID), '
    'job_title (required), placement_type (required), drive_type, fulltime_package, '
    'fulltime_designation, fulltime_joining_date, internship_stipend, internship_duration, '
    'internship_start_date, job_location, offer_date, remarks';

COMMENT ON COLUMN public.self_reported_placements.offer_letter_url IS
    'Stored outside form_data for file cleanup. Contains Supabase storage path '
    '(e.g. c_1/placement-docs/pl_xxx.pdf) that needs deletion on reject/cancel.';

COMMENT ON COLUMN public.self_reported_placements.resulting_placement_id IS
    'Set on approval. Links to the real placement_results row created by '
    'recordExternalPlacement(). NULL for pending/rejected reports.';
