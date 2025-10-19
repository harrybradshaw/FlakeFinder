-- Add uploaded_filename column to test_runs table
ALTER TABLE public.test_runs ADD COLUMN IF NOT EXISTS uploaded_filename TEXT;
