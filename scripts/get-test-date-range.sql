-- Query to find the date range of existing test data
-- Run this in your Supabase SQL editor to determine backfill range

SELECT 
  MIN(DATE(tr.timestamp)) as earliest_test,
  MAX(DATE(tr.timestamp)) as latest_test,
  COUNT(DISTINCT DATE(tr.timestamp)) as total_days,
  COUNT(*) as total_tests
FROM tests t
JOIN test_runs tr ON t.test_run_id = tr.id
WHERE t.suite_test_id IS NOT NULL;
