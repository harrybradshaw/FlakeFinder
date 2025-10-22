-- Add steps column to test_results table to store hierarchical test step information
-- Stores as JSONB for flexibility and querying capabilities

ALTER TABLE public.test_results 
ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]'::jsonb;

-- Create GIN index for efficient querying of steps
CREATE INDEX IF NOT EXISTS idx_test_results_steps ON public.test_results USING GIN (steps);

-- Example queries enabled by this index:
-- Find tests with specific step titles:
--   SELECT * FROM test_results WHERE steps @> '[{"title": "page.goto"}]';
-- Find tests with errors in steps:
--   SELECT * FROM test_results WHERE steps @? '$.steps[*] ? (@.error exists)';
-- Find slow steps (> 5 seconds):
--   SELECT * FROM test_results WHERE steps @? '$[*] ? (@.duration > 5000)';
