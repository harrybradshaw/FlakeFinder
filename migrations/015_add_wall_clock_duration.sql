-- Add wall_clock_duration column to test_runs table
-- This stores the actual elapsed time from first test start to last test end
-- accounting for parallel execution, unlike duration which is the sum of all test durations
ALTER TABLE public.test_runs
ADD COLUMN IF NOT EXISTS wall_clock_duration BIGINT;

-- Add comment to clarify the difference
COMMENT ON COLUMN public.test_runs.duration IS 'Sum of all test durations (does not account for parallel execution)';
COMMENT ON COLUMN public.test_runs.wall_clock_duration IS 'Actual elapsed time from first test start to last test end (accounts for parallel execution)';

-- Backfill existing test runs by calculating wall_clock_duration from tests
-- This calculates: max(started_at + duration) - min(started_at) for each test run
UPDATE public.test_runs tr
SET wall_clock_duration = (
    SELECT EXTRACT(EPOCH FROM (
        MAX(t.started_at + (t.duration || ' milliseconds')::INTERVAL) - 
        MIN(t.started_at)
    ))::BIGINT * 1000
    FROM public.tests t
    WHERE t.test_run_id = tr.id
    AND t.started_at IS NOT NULL
)
WHERE EXISTS (
    SELECT 1 FROM public.tests t 
    WHERE t.test_run_id = tr.id 
    AND t.started_at IS NOT NULL
);
