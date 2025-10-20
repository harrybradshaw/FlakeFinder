-- Clear all test data but keep configuration (environments, triggers)
-- WARNING: This will delete ALL test runs, tests, and test results!

-- Delete test results first (child table)
DELETE FROM public.test_results;

-- Delete tests (child table)
DELETE FROM public.tests;

-- Delete test runs
DELETE FROM public.test_runs;

-- Optionally reset sequences if you want IDs to start from 1 again
-- ALTER SEQUENCE IF EXISTS test_results_id_seq RESTART WITH 1;
-- ALTER SEQUENCE IF EXISTS tests_id_seq RESTART WITH 1;
-- ALTER SEQUENCE IF EXISTS test_runs_id_seq RESTART WITH 1;
