-- ============================================================================
-- CF1: Policy Enforcement Gaps
-- 1. Add company_id to student_restrictions for bar_from_company
-- 2. Add max_active_applications to placement_settings
-- ============================================================================

-- 1. Add company_id to student_restrictions (nullable — only used for bar_from_company)
ALTER TABLE public.student_restrictions
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(company_id);

-- Index for fast lookup during application blocker check
CREATE INDEX IF NOT EXISTS idx_restrictions_company
    ON public.student_restrictions (student_id, company_id)
    WHERE restriction_type = 'bar_from_company' AND is_active = true;

-- 2. Add max_active_applications to placement_settings (NULL = unlimited)
ALTER TABLE public.placement_settings
    ADD COLUMN IF NOT EXISTS max_active_applications integer DEFAULT NULL;

-- Constraint: if set, must be >= 1
ALTER TABLE public.placement_settings
    ADD CONSTRAINT placement_settings_max_apps_positive
    CHECK (max_active_applications IS NULL OR max_active_applications >= 1);
