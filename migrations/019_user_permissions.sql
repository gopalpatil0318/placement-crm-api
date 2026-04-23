-- ============================================================================
-- Migration 019: Per-User Permissions
-- ============================================================================
-- Moves permission storage from per-role (college_role_permissions) to per-user
-- (user_permissions). Each configurable-role user (TPO/TPC/HOD/Teacher) gets
-- their own permission set, enabling Gopal (TPC) and Ganesh (TPC) to have
-- completely different permissions and department assignments.
--
-- Changes:
--   1. New `user_permissions` table — stores permissions per user
--   2. Seed existing configurable-role users by copying from their role's
--      current college_role_permissions row (LEFT JOIN handles missing rows)
--   3. Add 'user_permission' to audit_log resource_type CHECK constraint
--
-- Design decisions:
--   - college_role_permissions is KEPT as "role templates" (for Reset to Default
--     and auto-assign on new user creation)
--   - user_departments is KEPT as-is (already per-user)
--   - dept_scoped is NO LONGER stored — derived from user_departments count
--     (has departments assigned = scoped; no departments = all-department access)
--   - Fallback: if user_permissions row is missing, auth middleware loads from
--     college_role_permissions template and auto-creates the row (lazy migration)
--   - ON CONFLICT makes this migration re-runnable
-- ============================================================================


-- ============================================================================
-- 1. USER PERMISSIONS TABLE
-- ============================================================================
-- Stores the permission configuration for each individual user.
-- One row per user. Only created for configurable roles (TPO/TPC/HOD/Teacher).
-- College admin and sysadmin bypass this table (hardcoded full access).
--
-- permissions JSONB example:
--   ["dashboard.view", "students.view", "jobs.view", "jobs.create"]
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_permissions (
    user_id         uuid            NOT NULL,
    college_id      uuid            NOT NULL,
    permissions     jsonb           NOT NULL DEFAULT '[]'::jsonb,
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT user_permissions_pkey
        PRIMARY KEY (user_id),

    CONSTRAINT user_permissions_user_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT user_permissions_college_fkey
        FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
        ON DELETE CASCADE
);

-- Fast lookup by college (for admin listing users with permissions)
CREATE INDEX IF NOT EXISTS idx_user_permissions_college
    ON public.user_permissions (college_id);


-- ============================================================================
-- 2. SEED EXISTING USERS FROM ROLE TEMPLATES
-- ============================================================================
-- For each configurable-role user, copy permissions from their role's
-- college_role_permissions row. LEFT JOIN ensures users at colleges without
-- configured role templates get an empty permissions array.
-- ON CONFLICT makes this idempotent (safe to re-run).
-- ============================================================================

INSERT INTO public.user_permissions (user_id, college_id, permissions)
SELECT
    u.user_id,
    u.college_id,
    COALESCE(crp.permissions, '[]'::jsonb) AS permissions
FROM public.users u
LEFT JOIN public.college_role_permissions crp
    ON u.college_id = crp.college_id
    AND u.user_role = crp.role
WHERE u.user_role IN ('tpo', 'tpc', 'hod', 'teacher')
  AND u.user_status = 'active'
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================================
-- 3. ADD 'user_permission' TO AUDIT LOG RESOURCE TYPE
-- ============================================================================
-- Extend the CHECK constraint to allow auditing per-user permission changes.
-- Drop the old constraint and create a new one with the additional value.
-- ============================================================================

DO $$
BEGIN
    -- Only alter if the constraint exists (idempotent)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'audit_log_resource_type_check'
          AND table_name = 'audit_log'
    ) THEN
        ALTER TABLE public.audit_log DROP CONSTRAINT audit_log_resource_type_check;

        ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_resource_type_check
            CHECK (resource_type = ANY (ARRAY[
                'application', 'placement', 'restriction', 'policy', 'override',
                'job', 'student', 'user', 'training', 'company', 'department',
                'skill', 'company_tier', 'placement_setting', 'job_round',
                'subscription', 'self_report', 'job_criteria', 'role_permission',
                'user_permission'
            ]));
    END IF;
END
$$;
