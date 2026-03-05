-- Storage bucket for profile and background images (used in Settings).
-- Run this in Supabase SQL Editor when deploying to production / live so uploads work.
-- You can also create the bucket from Dashboard: Storage → New bucket → name "profiles", set Public.
--
-- If you get "policy already exists", run the DROP statements below first.
-- If you get "new row violates row-level security policy" on upload, run the full script including DROPs.

-- Drop existing policies (run first if you get "policy already exists")
DROP POLICY IF EXISTS "profiles_public_read" ON storage.objects;
DROP POLICY IF EXISTS "profiles_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "profiles_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "profiles_authenticated_delete" ON storage.objects;

-- 1. Create the "profiles" bucket (public so image URLs work without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profiles',
  'profiles',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Policy: anyone can read (public bucket)
CREATE POLICY "profiles_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profiles');

-- 3. Policy: authenticated users can upload only to their own folder (path = auth_id/avatar.* or auth_id/bg.*)
-- Uses split_part in case storage.foldername format differs by Supabase version
CREATE POLICY "profiles_authenticated_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profiles'
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- 4. Policy: authenticated users can update/delete only their own files
CREATE POLICY "profiles_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profiles'
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profiles'
  AND split_part(name, '/', 1) = auth.uid()::text
);

CREATE POLICY "profiles_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profiles'
  AND split_part(name, '/', 1) = auth.uid()::text
);
