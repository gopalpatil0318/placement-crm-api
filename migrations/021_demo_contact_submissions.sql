-- ============================================================================
-- Migration 021: Demo Requests & Contact Inquiries (Lead Management)
-- ============================================================================
-- Creates tables for storing website form submissions from the Placenex
-- marketing site. Sysadmin can view, manage status, and add notes.
--
-- Tables:
--   1. demo_requests       — "Book a Demo" form submissions
--   2. contact_inquiries   — "Contact Us" form submissions
--   3. submission_notes    — Internal notes for both types (polymorphic)
--
-- Indexes:
--   Optimised for sysadmin list views (status filter, date sort, search)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. demo_requests — "Book a Demo" form submissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS demo_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Form fields
  college_name          VARCHAR(255) NOT NULL,
  contact_person        VARCHAR(255) NOT NULL,
  designation           VARCHAR(50)  NOT NULL
    CHECK (designation IN ('TPO', 'HOD', 'Principal', 'Director', 'Other')),
  college_type          VARCHAR(50)  NOT NULL
    CHECK (college_type IN ('Engineering', 'Diploma', 'MBA', 'Polytechnic', 'Pharmacy', 'Medical', 'Degree', 'Other')),
  email                 VARCHAR(255) NOT NULL,
  phone                 VARCHAR(15)  NOT NULL,
  number_of_students    INTEGER,

  -- Additional fields
  city                  VARCHAR(100),
  state                 VARCHAR(100),
  preferred_demo_date   DATE,
  preferred_demo_time   VARCHAR(20)
    CHECK (preferred_demo_time IS NULL OR preferred_demo_time IN ('morning', 'afternoon', 'evening')),
  referral_source       VARCHAR(100),

  -- Lead management
  status                VARCHAR(30)  NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'demo_scheduled', 'demo_completed', 'converted', 'lost', 'rejected')),
  assigned_to           VARCHAR(255),
  converted_college_id  UUID REFERENCES colleges(college_id),

  -- Anti-spam metadata
  ip_address            INET,
  user_agent            TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. contact_inquiries — "Contact Us" form submissions
-- ============================================================================
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Form fields
  name                  VARCHAR(255) NOT NULL,
  email                 VARCHAR(255) NOT NULL,
  phone                 VARCHAR(15)  NOT NULL,
  subject               VARCHAR(50)
    CHECK (subject IS NULL OR subject IN ('Pricing', 'Partnership', 'Technical', 'General', 'Other')),
  message               TEXT         NOT NULL,

  -- Lead management
  status                VARCHAR(30)  NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),

  -- Anti-spam metadata
  ip_address            INET,
  user_agent            TEXT,

  -- Timestamps
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. submission_notes — Internal notes (polymorphic for both tables)
-- ============================================================================
CREATE TABLE IF NOT EXISTS submission_notes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_type       VARCHAR(20)  NOT NULL
    CHECK (submission_type IN ('demo_request', 'contact_inquiry')),
  submission_id         UUID         NOT NULL,
  note                  TEXT         NOT NULL,
  created_by            VARCHAR(255) NOT NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

-- Demo requests: sysadmin list views sort/filter
CREATE INDEX IF NOT EXISTS idx_demo_requests_status
  ON demo_requests(status);

CREATE INDEX IF NOT EXISTS idx_demo_requests_email
  ON demo_requests(email);

CREATE INDEX IF NOT EXISTS idx_demo_requests_created_at
  ON demo_requests(created_at DESC);

-- Contact inquiries: sysadmin list views sort/filter
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status
  ON contact_inquiries(status);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email
  ON contact_inquiries(email);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created_at
  ON contact_inquiries(created_at DESC);

-- Submission notes: lookup by parent
CREATE INDEX IF NOT EXISTS idx_submission_notes_ref
  ON submission_notes(submission_type, submission_id);

COMMIT;
