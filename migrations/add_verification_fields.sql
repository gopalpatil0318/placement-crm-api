-- ============================================================================
-- MIGRATION: Add Verification/Approval Fields
-- ============================================================================
-- Adds 3-state verification (pending/approved/rejected) with audit trail
-- to: students, student_experience, student_achievements, student_certificates
-- ============================================================================

-- 1. STUDENTS TABLE — Profile approval fields
ALTER TABLE students ADD COLUMN profile_approval_status TEXT DEFAULT 'pending';
ALTER TABLE students ADD COLUMN approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE students ADD COLUMN approved_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE students ADD COLUMN profile_rejection_reason TEXT;
ALTER TABLE students ADD COLUMN rejected_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE students ADD CONSTRAINT profile_approval_status_check
  CHECK (profile_approval_status IN ('pending', 'approved', 'rejected'));

-- Migrate existing data
UPDATE students SET profile_approval_status = CASE
  WHEN profile_is_approved = true THEN 'approved' ELSE 'pending' END;

CREATE INDEX idx_students_approval_status ON public.students(college_id, profile_approval_status)
  WHERE profile_complete = true;

-- 2. STUDENT EXPERIENCE TABLE
ALTER TABLE student_experience ADD COLUMN verification_status TEXT DEFAULT 'pending';
ALTER TABLE student_experience ADD COLUMN verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE student_experience ADD COLUMN verified_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE student_experience ADD COLUMN rejection_reason TEXT;
ALTER TABLE student_experience ADD COLUMN rejected_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE student_experience ADD CONSTRAINT exp_verification_status_check
  CHECK (verification_status IN ('pending', 'approved', 'rejected'));

UPDATE student_experience SET verification_status = CASE
  WHEN is_verified = true THEN 'approved' ELSE 'pending' END;

CREATE INDEX idx_experience_verification ON public.student_experience(college_id, verification_status);

-- 3. STUDENT ACHIEVEMENTS TABLE
ALTER TABLE student_achievements ADD COLUMN verification_status TEXT DEFAULT 'pending';
ALTER TABLE student_achievements ADD COLUMN verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE student_achievements ADD COLUMN verified_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE student_achievements ADD COLUMN rejection_reason TEXT;
ALTER TABLE student_achievements ADD COLUMN rejected_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE student_achievements ADD CONSTRAINT ach_verification_status_check
  CHECK (verification_status IN ('pending', 'approved', 'rejected'));

UPDATE student_achievements SET verification_status = CASE
  WHEN is_verified = true THEN 'approved' ELSE 'pending' END;

CREATE INDEX idx_achievements_verification ON public.student_achievements(college_id, verification_status);

-- 4. STUDENT CERTIFICATES TABLE
ALTER TABLE student_certificates ADD COLUMN verification_status TEXT DEFAULT 'pending';
ALTER TABLE student_certificates ADD COLUMN verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE student_certificates ADD COLUMN verified_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE student_certificates ADD COLUMN rejection_reason TEXT;
ALTER TABLE student_certificates ADD COLUMN rejected_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE student_certificates ADD CONSTRAINT cert_verification_status_check
  CHECK (verification_status IN ('pending', 'approved', 'rejected'));

UPDATE student_certificates SET verification_status = CASE
  WHEN is_verified = true THEN 'approved' ELSE 'pending' END;

CREATE INDEX idx_certificates_verification ON public.student_certificates(college_id, verification_status);
