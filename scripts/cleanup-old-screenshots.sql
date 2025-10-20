-- Cleanup script to delete screenshots older than 30 days
-- This can be run manually or set up as a scheduled job

-- Step 1: Find tests older than 30 days with screenshots
WITH old_tests AS (
  SELECT 
    t.id,
    t.screenshots,
    tr.timestamp,
    tr.id as test_run_id
  FROM tests t
  JOIN test_runs tr ON t.test_run_id = tr.id
  WHERE tr.timestamp < NOW() - INTERVAL '30 days'
    AND t.screenshots IS NOT NULL
    AND array_length(t.screenshots, 1) > 0
)
SELECT 
  COUNT(*) as total_old_tests,
  SUM(array_length(screenshots, 1)) as total_screenshots
FROM old_tests;

-- Step 2: Extract screenshot URLs from old tests
-- This shows what will be deleted (run this first to verify)
WITH old_tests AS (
  SELECT 
    t.id,
    t.screenshots,
    tr.timestamp
  FROM tests t
  JOIN test_runs tr ON t.test_run_id = tr.id
  WHERE tr.timestamp < NOW() - INTERVAL '30 days'
    AND t.screenshots IS NOT NULL
    AND array_length(t.screenshots, 1) > 0
  LIMIT 10
)
SELECT 
  id,
  timestamp,
  unnest(screenshots) as screenshot_url
FROM old_tests;

-- Step 3: Delete the actual storage files
-- Note: This needs to be done via the Supabase Storage API, not SQL
-- See the Edge Function approach below for automated deletion

-- Step 4: Clean up database references (optional - only if you want to remove old test data)
-- Uncomment to actually delete:
/*
DELETE FROM tests
WHERE test_run_id IN (
  SELECT id FROM test_runs
  WHERE timestamp < NOW() - INTERVAL '30 days'
);
*/

-- Alternative: Just clear the screenshot URLs but keep test records
/*
UPDATE tests
SET screenshots = NULL
WHERE test_run_id IN (
  SELECT id FROM test_runs
  WHERE timestamp < NOW() - INTERVAL '30 days'
);
*/
