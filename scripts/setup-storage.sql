-- Setup script for Supabase Storage bucket for test screenshots
-- Run this in your Supabase SQL Editor

-- IMPORTANT: 
-- 1. Create the bucket 'test-screenshots' via Supabase UI first
-- 2. Set it as a PRIVATE bucket (not public)
-- 3. Then run this script to set up policies

-- This setup uses PRIVATE bucket with SIGNED URLs for security
-- Only the service role (your API) can upload and generate access URLs
-- Users cannot directly access the bucket

-- 1. Allow service role to upload screenshots
CREATE POLICY IF NOT EXISTS "Service role upload to screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'test-screenshots' 
  AND auth.role() = 'service_role'
);

-- 2. Allow service role to read (needed for generating signed URLs)
CREATE POLICY IF NOT EXISTS "Service role read from screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'test-screenshots'
  AND auth.role() = 'service_role'
);

-- 3. Allow service role to delete (for cleanup operations)
CREATE POLICY IF NOT EXISTS "Service role delete from screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'test-screenshots'
  AND auth.role() = 'service_role'
);

-- Verify policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'objects'
AND policyname LIKE '%screenshots%';
