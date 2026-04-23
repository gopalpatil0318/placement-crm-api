-- ============================================================================
-- Migration 018: Dynamic Role-Based Permissions + Multi-Department Users
-- ============================================================================
-- Introduces a fully dynamic, per-college, per-role permission system that
-- replaces hardcoded requireRole() checks. College admins configure which
-- modules each role (TPO, TPC, HOD, Teacher) can access via a UI matrix.
--
-- Also adds multi-department support: a TPC/HOD/Teacher can be assigned to
-- 1, 2, or 3+ departments (e.g., HOD overseeing both CS and IT).
--
-- Changes:
--   1. New `college_role_permissions` table — permissions per college-role
--   2. New `user_departments` junction table — multi-dept assignments
--   3. Migrate existing `users.dept_id` data into `user_departments`
--   4. ALTER `users` — add `profile_picture_url` column for avatars
--   5. Seed default permission rows for ALL existing colleges
--   6. Add 'role_permission' to audit_log resource_type CHECK constraint
--   7. Indexes for fast lookups
--
-- Design decisions:
--   - College admin is NOT stored in permissions table — always has full access
--   - Permissions are a flat JSONB array of "module.action" strings
--   - dept_scoped flag controls whether the role sees only their assigned depts
--   - users.dept_id is KEPT for backward compatibility (will be deprecated later)
--   - user_departments is the source of truth for dept-scoped access
--   - When dept_scoped=true, middleware loads user's dept_ids from user_departments
--   - TPO/TPC can also be dept-scoped if admin chooses (1+ depts)
-- ============================================================================


-- ============================================================================
-- 1. COLLEGE ROLE PERMISSIONS TABLE
-- ============================================================================
-- Stores the permission configuration for each non-admin role at each college.
-- College admin always bypasses this table (hardcoded full access).
--
-- permissions JSONB example:
--   ["dashboard.view", "students.view", "jobs.view", "jobs.create"]
--
-- dept_scoped:
--   false = role sees all departments (typical for TPO, TPC)
--   true  = role only sees departments assigned via user_departments
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.college_role_permissions (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    college_id      uuid            NOT NULL,
    role            text            NOT NULL,
    permissions     jsonb           NOT NULL DEFAULT '[]'::jsonb,
    dept_scoped     boolean         NOT NULL DEFAULT false,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT college_role_permissions_pkey
        PRIMARY KEY (id),

    CONSTRAINT college_role_permissions_college_fkey
        FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
        ON DELETE CASCADE,

    -- Only configurable roles are stored — collegeadmin has hardcoded full access
    CONSTRAINT college_role_permissions_role_check
        CHECK (role IN ('tpo', 'tpc', 'hod', 'teacher')),

    -- Exactly one permission config per role per college
    CONSTRAINT college_role_permissions_college_role_uq
        UNIQUE (college_id, role)
);

-- Primary lookup path: authenticate middleware queries by (college_id, role)
CREATE INDEX IF NOT EXISTS idx_college_role_permissions_lookup
    ON public.college_role_permissions (college_id, role);


-- ============================================================================
-- 2. USER DEPARTMENTS JUNCTION TABLE (multi-dept assignments)
-- ============================================================================
-- Allows a college user (TPC, HOD, Teacher, or even TPO) to be assigned to
-- one or more departments. Replaces the single users.dept_id for access control.
--
-- Examples:
--   - HOD of CS + IT → 2 rows (user_id, cs_dept_id), (user_id, it_dept_id)
--   - TPC coordinating 3 depts → 3 rows
--   - Teacher in 1 dept → 1 row
--
-- When dept_scoped=true for a role, the middleware loads all dept_ids from
-- this table and filters queries with: WHERE dept_id = ANY($dept_ids)
--
-- college_id is denormalized here for fast lookups and RLS-style filtering.
-- ON DELETE CASCADE: removing a user or department auto-cleans assignments.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_departments (
    id              uuid            NOT NULL DEFAULT gen_random_uuid(),
    user_id         uuid            NOT NULL,
    dept_id         uuid            NOT NULL,
    college_id      uuid            NOT NULL,
    assigned_at     timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT user_departments_pkey
        PRIMARY KEY (id),

    CONSTRAINT user_departments_user_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT user_departments_dept_fkey
        FOREIGN KEY (dept_id) REFERENCES public.departments(dept_id)
        ON DELETE CASCADE,

    CONSTRAINT user_departments_college_fkey
        FOREIGN KEY (college_id) REFERENCES public.colleges(college_id)
        ON DELETE CASCADE,

    -- A user can be assigned to a department only once
    CONSTRAINT user_departments_user_dept_uq
        UNIQUE (user_id, dept_id)
);

-- Fast lookup: get all departments for a user (used in authenticate middleware)
CREATE INDEX IF NOT EXISTS idx_user_departments_user
    ON public.user_departments (user_id);

-- Fast lookup: get all users in a department (used in admin user listing)
CREATE INDEX IF NOT EXISTS idx_user_departments_dept
    ON public.user_departments (dept_id, college_id);

-- Fast lookup: all department assignments within a college
CREATE INDEX IF NOT EXISTS idx_user_departments_college
    ON public.user_departments (college_id);


-- ============================================================================
-- 3. MIGRATE EXISTING users.dept_id INTO user_departments
-- ============================================================================
-- Seeds the junction table from the legacy single dept_id column.
-- Only migrates non-null dept_id values. Idempotent via ON CONFLICT.
-- After this migration, user_departments becomes the source of truth.
-- The users.dept_id column is kept for backward compat (deprecated).
-- ============================================================================

INSERT INTO public.user_departments (user_id, dept_id, college_id)
SELECT u.user_id, u.dept_id, u.college_id
FROM public.users u
WHERE u.dept_id IS NOT NULL
  AND u.user_role IN ('tpo', 'tpc', 'hod', 'teacher')
ON CONFLICT (user_id, dept_id) DO NOTHING;


-- ============================================================================
-- 4. ALTER users — add profile_picture_url
-- ============================================================================
-- phone_number already exists on the users table (added in schema).
-- profile_picture_url stores the path/key in the storage system for avatars.
-- users.dept_id is KEPT — it remains as a legacy/primary dept reference.
-- New code should use user_departments for multi-dept lookups.
-- ============================================================================

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS profile_picture_url text;


-- ============================================================================
-- 5. SEED DEFAULT PERMISSIONS FOR ALL EXISTING COLLEGES
-- ============================================================================
-- Inserts 4 rows per college (TPO, TPC, HOD, Teacher) with sensible defaults.
-- ON CONFLICT DO NOTHING ensures idempotency if re-run.
--
-- Permission key reference (20 modules, ~45 actions):
--   dashboard.view
--   students.view, students.create, students.update, students.approve
--   companies.view, companies.create, companies.update
--   jobs.view, jobs.create, jobs.update, jobs.manage_status
--   applications.view, applications.manage
--   round_results.view, round_results.manage, round_results.process
--   placements.view, placements.create, placements.manage
--   self_reports.view, self_reports.review
--   overrides.view, overrides.review
--   training.view, training.manage, training.sessions, training.attendance
--   verification.view, verification.verify
--   restrictions.view, restrictions.create, restrictions.update
--   notifications.view, notifications.send
--   feedback.view, feedback.approve
--   skills.view, skills.manage
--   departments.view, departments.manage
--   users.view, users.manage
--   audit.view
--   policies.view, policies.manage
--   settings.view, settings.manage
-- ============================================================================

-- TPO: Near-full access, minus system administration
-- dept_scoped = false (sees all departments)
INSERT INTO public.college_role_permissions (college_id, role, permissions, dept_scoped)
SELECT
    c.college_id,
    'tpo',
    '[
        "dashboard.view",
        "students.view", "students.create", "students.update", "students.approve",
        "companies.view", "companies.create", "companies.update",
        "jobs.view", "jobs.create", "jobs.update", "jobs.manage_status",
        "applications.view", "applications.manage",
        "round_results.view", "round_results.manage", "round_results.process",
        "placements.view", "placements.create", "placements.manage",
        "self_reports.view", "self_reports.review",
        "overrides.view", "overrides.review",
        "training.view", "training.manage", "training.sessions", "training.attendance",
        "verification.view", "verification.verify",
        "restrictions.view", "restrictions.create", "restrictions.update",
        "notifications.view", "notifications.send",
        "feedback.view", "feedback.approve",
        "skills.view", "skills.manage",
        "departments.view",
        "users.view",
        "audit.view",
        "policies.view", "policies.manage",
        "settings.view"
    ]'::jsonb,
    false
FROM public.colleges c
ON CONFLICT (college_id, role) DO NOTHING;

-- TPC: Day-to-day coordinator, assists TPO
-- dept_scoped = false (cross-department coordination)
INSERT INTO public.college_role_permissions (college_id, role, permissions, dept_scoped)
SELECT
    c.college_id,
    'tpc',
    '[
        "dashboard.view",
        "students.view",
        "companies.view",
        "jobs.view", "jobs.create", "jobs.update",
        "applications.view",
        "round_results.view", "round_results.manage",
        "placements.view",
        "self_reports.view", "self_reports.review",
        "overrides.view", "overrides.review",
        "training.view", "training.manage", "training.sessions", "training.attendance",
        "verification.view", "verification.verify",
        "feedback.view",
        "skills.view",
        "notifications.view", "notifications.send",
        "policies.view"
    ]'::jsonb,
    false
FROM public.colleges c
ON CONFLICT (college_id, role) DO NOTHING;

-- HOD: Department oversight — monitors own department's students
-- dept_scoped = true (sees only their department)
INSERT INTO public.college_role_permissions (college_id, role, permissions, dept_scoped)
SELECT
    c.college_id,
    'hod',
    '[
        "dashboard.view",
        "students.view", "students.approve",
        "companies.view",
        "jobs.view",
        "applications.view",
        "placements.view",
        "training.view",
        "verification.view", "verification.verify",
        "restrictions.view",
        "feedback.view",
        "skills.view",
        "notifications.view", "notifications.send"
    ]'::jsonb,
    true
FROM public.colleges c
ON CONFLICT (college_id, role) DO NOTHING;

-- Teacher: Minimal operational role — verification + training sessions
-- dept_scoped = true (sees only their department)
INSERT INTO public.college_role_permissions (college_id, role, permissions, dept_scoped)
SELECT
    c.college_id,
    'teacher',
    '[
        "dashboard.view",
        "students.view",
        "jobs.view",
        "training.view", "training.sessions", "training.attendance",
        "verification.view", "verification.verify",
        "feedback.view",
        "skills.view"
    ]'::jsonb,
    true
FROM public.colleges c
ON CONFLICT (college_id, role) DO NOTHING;


-- ============================================================================
-- 6. ADD 'role_permission' TO audit_log resource_type CHECK
-- ============================================================================
-- Enables audit logging when college admin changes role permissions.
-- Drop-and-recreate pattern consistent with migrations 016 and 017.
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
        'self_report'::text, 'job_criteria'::text, 'role_permission'::text,
        'job_round'::text, 'subscription'::text
    ]));
