-- Migration 021: Fix duplicate Default Suite
-- Move test_runs from duplicate suite to original suite and delete duplicate

-- Move all test_runs from the duplicate suite to the original suite
UPDATE public.test_runs
SET suite_id = 'c2a4f93e-9c39-4c75-b8e1-42e4cbf361a8'
WHERE suite_id = 'f414843b-3b28-49e5-80b5-32f96cf7cbe8';

-- Delete the duplicate suite
DELETE FROM public.suites
WHERE id = 'f414843b-3b28-49e5-80b5-32f96cf7cbe8';

-- Log the change
DO $$
BEGIN
  RAISE NOTICE 'Migrated test_runs from duplicate Default Suite and deleted duplicate';
END $$;
