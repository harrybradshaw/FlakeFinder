-- Add attempts column to tests table
-- This stores the count of test_results (retries) for each test
-- to avoid expensive joins when querying test history

-- Add the column with a default value of 1
ALTER TABLE tests ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 1;

-- Populate the attempts column with actual counts from test_results
UPDATE tests
SET attempts = (
  SELECT COUNT(*)
  FROM test_results
  WHERE test_results.test_id = tests.id
)
WHERE EXISTS (
  SELECT 1 FROM test_results WHERE test_results.test_id = tests.id
);

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_tests_attempts ON tests(attempts);

-- Add a comment to document the column
COMMENT ON COLUMN tests.attempts IS 'Number of test attempts/retries for this test run';
