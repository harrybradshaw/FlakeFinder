-- Migration: Add suite_tests table for test definitions
-- This table contains the canonical definition of each test in the suite
-- The tests table will reference this for each execution instance

-- Create suite_tests table
CREATE TABLE IF NOT EXISTS public.suite_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure unique test per project (same test name+file can exist in different projects)
    UNIQUE(project_id, file, name)
);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_suite_tests_project_id ON public.suite_tests(project_id);
CREATE INDEX IF NOT EXISTS idx_suite_tests_file ON public.suite_tests(file);
CREATE INDEX IF NOT EXISTS idx_suite_tests_name ON public.suite_tests(name);

-- Add suite_test_id column to tests table
ALTER TABLE public.tests 
ADD COLUMN suite_test_id UUID REFERENCES public.suite_tests(id) ON DELETE SET NULL;

-- Create index on the new foreign key
CREATE INDEX IF NOT EXISTS idx_tests_suite_test_id ON public.tests(suite_test_id);

-- Migrate existing data: Create suite_tests entries from existing tests
-- This will create one suite_test entry for each unique (project_id, file, name) combination
INSERT INTO public.suite_tests (project_id, file, name)
SELECT DISTINCT 
    tr.project_id,
    t.file,
    t.name
FROM public.tests t
JOIN public.test_runs tr ON t.test_run_id = tr.id
ON CONFLICT (project_id, file, name) DO NOTHING;

-- Update existing tests to reference their suite_test
UPDATE public.tests t
SET suite_test_id = st.id
FROM public.test_runs tr
JOIN public.suite_tests st ON (
    st.project_id = tr.project_id 
    AND st.file = t.file 
    AND st.name = t.name
)
WHERE t.test_run_id = tr.id;

-- Add updated_at trigger for suite_tests table
CREATE TRIGGER update_suite_tests_updated_at BEFORE UPDATE ON public.suite_tests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on suite_tests
ALTER TABLE public.suite_tests ENABLE ROW LEVEL SECURITY;

-- Create policy for suite_tests
CREATE POLICY "Allow all operations on suite_tests" ON public.suite_tests
    FOR ALL USING (true) WITH CHECK (true);

-- Remove redundant name and file columns from tests table (now in suite_tests)
-- Note: Only do this after suite_test_id is populated for all existing tests
ALTER TABLE public.tests DROP COLUMN IF EXISTS name;
ALTER TABLE public.tests DROP COLUMN IF EXISTS file;

-- Add comment explaining the tables
COMMENT ON TABLE public.suite_tests IS 'Canonical definitions of tests in the suite. Each unique test (by project, file, and name) has one entry here.';
COMMENT ON COLUMN public.suite_tests.id IS 'Primary key - unique identifier for this test definition';
COMMENT ON COLUMN public.suite_tests.project_id IS 'Foreign key to projects table';
COMMENT ON COLUMN public.suite_tests.file IS 'Test file path';
COMMENT ON COLUMN public.suite_tests.name IS 'Test name';

COMMENT ON TABLE public.tests IS 'Individual test execution instances. Each row represents one execution of a test in a test run. Name and file are stored in suite_tests table.';
COMMENT ON COLUMN public.tests.suite_test_id IS 'Foreign key to suite_tests - links this execution to its test definition. Join with suite_tests to get name and file.';
