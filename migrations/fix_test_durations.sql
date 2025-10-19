-- Migration to fix test durations to be sum of all retry attempts
-- This updates existing tests in the database that were uploaded before the duration fix

-- Update tests table to sum all retry durations from test_results table
UPDATE tests
SET duration = (
  SELECT COALESCE(SUM(test_results.duration), tests.duration)
  FROM test_results
  WHERE test_results.test_id = tests.id
)
WHERE EXISTS (
  SELECT 1 
  FROM test_results 
  WHERE test_results.test_id = tests.id
);

-- Verify the update
SELECT 
  t.id,
  t.suite_test_id,
  t.status,
  t.duration as current_duration,
  COALESCE(SUM(tr.duration), 0) as sum_of_retries,
  COUNT(tr.id) as retry_count
FROM tests t
LEFT JOIN test_results tr ON tr.test_id = t.id
GROUP BY t.id, t.suite_test_id, t.status, t.duration
HAVING COUNT(tr.id) > 0
ORDER BY t.id DESC
LIMIT 20;
