-- Teardown script for test-viewer database
-- WARNING: This will delete ALL test data!
-- Use this to reset the database before running schema.sql

-- Drop tables in reverse order of dependencies (child tables first)
-- CASCADE will automatically drop all policies, indexes, and constraints
DROP TABLE IF EXISTS public.test_results CASCADE;
DROP TABLE IF EXISTS public.tests CASCADE;
DROP TABLE IF EXISTS public.test_runs CASCADE;
