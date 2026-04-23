-- ============================================================================
-- Migration 015: Supabase Storage Buckets Setup
-- ============================================================================
-- Creates two storage buckets via Supabase's storage schema:
--   placenex-public  — Public bucket for logos & profile photos (CDN-cached)
--   placenex-private — Private bucket for resumes, certificates, offer letters
--
-- NOTE: If running against Supabase hosted, you may need to create buckets
-- via the Supabase Dashboard instead. This migration works for self-hosted
-- or when the service_role has storage admin privileges.
--
-- Manual steps if SQL fails:
--   1. Go to Supabase Dashboard → Storage
--   2. Create bucket "placenex-public"  → Public: ON,  File size limit: 2 MB
--   3. Create bucket "placenex-private" → Public: OFF, File size limit: 5 MB
--   4. Add RLS policies below via SQL Editor
-- ============================================================================

-- Create public bucket (logos, profile photos — CDN accessible)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'placenex-public',
  'placenex-public',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create private bucket (resumes, certificates, offer letters — signed URLs only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'placenex-private',
  'placenex-private',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================================
-- RLS POLICIES — Service role bypasses RLS, but these protect against
-- direct Supabase client access if anon key is ever exposed.
-- ============================================================================

-- Public bucket: anyone can READ, only service_role can INSERT/UPDATE/DELETE
-- (our backend uses service_role key, so uploads always work)

-- Allow public read on public bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'public_read_placenex_public'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY public_read_placenex_public ON storage.objects
      FOR SELECT
      USING (bucket_id = 'placenex-public');
  END IF;
END $$;

-- Service role can do everything (INSERT/UPDATE/DELETE) on both buckets.
-- Since we use service_role key, this is automatic (bypasses RLS).
-- No additional policies needed for service_role operations.

-- Private bucket: NO public read — only signed URLs via service_role
-- Default RLS on storage.objects denies all, which is what we want.
-- Service role bypasses RLS, so our backend can still generate signed URLs.
