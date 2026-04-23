-- ============================================================================
-- Migration 014: College Subscription & Student Quota Management (E12)
-- ============================================================================
-- Creates subscription infrastructure for revenue tracking and quota enforcement.
--
-- Tables:
--   1. college_subscriptions — one row per college per subscription period
--   2. subscription_payments — payment history (manual bank transfer records)
--
-- ALTER:
--   colleges.subscription_status — denormalized for fast auth middleware check
--
-- Indexes:
--   1. idx_students_college_active        — CRITICAL perf: makes quota COUNT ~1ms
--   2. idx_subscriptions_college_status   — fast subscription lookup per college
--   3. idx_payments_subscription          — payment lookup by subscription
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ALTER colleges — add denormalized subscription_status
-- ============================================================================
-- DEFAULT 'none' ensures all existing colleges keep unlimited access.
-- PostgreSQL 11+ ADD COLUMN with DEFAULT is non-locking.
ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none', 'trial', 'active', 'expired', 'suspended'));

-- ============================================================================
-- 2. college_subscriptions — one per college per subscription period
-- ============================================================================
CREATE TABLE IF NOT EXISTS college_subscriptions (
  subscription_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_id            UUID NOT NULL REFERENCES colleges(college_id),

  -- Subscription lifecycle status
  subscription_status   TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'expired', 'suspended')),

  -- Quota & pricing
  student_quota         INTEGER NOT NULL DEFAULT 50,
  price_per_student     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Trial-specific: NULL for paid subscriptions
  trial_ends_at         TIMESTAMPTZ,

  -- Validity window
  valid_from            DATE NOT NULL,
  valid_to              DATE NOT NULL,
  grace_period_days     INTEGER NOT NULL DEFAULT 7,

  -- Passout year restriction: NULL = any year allowed
  -- For trials: ARRAY[default_academic_year] restricts to default year only
  allowed_passout_years INTEGER[],

  -- Metadata
  notes                 TEXT,
  created_by            UUID,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- One subscription per college per start date (prevents overlapping entries)
  UNIQUE(college_id, valid_from)
);

-- ============================================================================
-- 3. subscription_payments — manual payment records
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_payments (
  payment_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id         UUID NOT NULL REFERENCES college_subscriptions(subscription_id),
  college_id              UUID NOT NULL REFERENCES colleges(college_id),

  -- Payment details
  amount                  NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date            DATE NOT NULL,
  payment_method          TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer', 'cheque', 'upi', 'cash', 'other')),
  transaction_reference   TEXT,
  receipt_number          TEXT,
  notes                   TEXT,

  -- Audit
  recorded_by             UUID,
  recorded_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- CRITICAL PERFORMANCE: Makes quota COUNT query ~1ms instead of full table scan.
-- Without this, COUNT(*) FROM students WHERE college_id = X AND status != 'dropout'
-- does a sequential scan — disastrous at 10K+ students per college.
CREATE INDEX IF NOT EXISTS idx_students_college_active
  ON students(college_id)
  WHERE student_status != 'dropout';

-- Fast subscription lookup per college (used by quotaHelper + billing dashboard)
CREATE INDEX IF NOT EXISTS idx_subscriptions_college_status
  ON college_subscriptions(college_id, subscription_status);

-- Payment history lookup by subscription
CREATE INDEX IF NOT EXISTS idx_payments_subscription
  ON subscription_payments(subscription_id);

COMMIT;
