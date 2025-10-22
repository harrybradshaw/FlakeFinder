-- Update test_results table to store steps in Supabase Storage instead of JSONB
-- This reduces database size and allows lazy loading of large step hierarchies

-- Remove the old steps column
ALTER TABLE public.test_results 
DROP COLUMN IF EXISTS steps;

-- Add columns for storage-based steps
ALTER TABLE public.test_results 
ADD COLUMN IF NOT EXISTS steps_url TEXT,
ADD COLUMN IF NOT EXISTS last_failed_step JSONB;

-- Add index for efficient queries on failed steps
CREATE INDEX IF NOT EXISTS idx_test_results_last_failed_step 
ON public.test_results USING GIN (last_failed_step)
WHERE last_failed_step IS NOT NULL;

-- Comment explaining the schema
COMMENT ON COLUMN public.test_results.steps_url IS 'URL/path to the steps JSON file in Supabase Storage (lazy loaded)';
COMMENT ON COLUMN public.test_results.last_failed_step IS 'Summary of the last failed step for quick overview without loading full steps';

-- Example of last_failed_step structure:
-- {
--   "title": "expect(locator).toBeVisible",
--   "duration": 5000,
--   "error": "Timeout 5000ms exceeded"
-- }
