-- Migration 020: Add suite_id to test_runs table
-- Test runs should belong to a suite, not just a project

-- Add suite_id column to test_runs
ALTER TABLE public.test_runs 
ADD COLUMN IF NOT EXISTS suite_id UUID REFERENCES public.suites(id) ON DELETE CASCADE;

-- For existing test_runs without a suite, assign them to a default suite for their project
DO $$
DECLARE
    run_record RECORD;
    default_suite_id UUID;
BEGIN
    -- For each test run without a suite
    FOR run_record IN 
        SELECT id, project_id 
        FROM public.test_runs 
        WHERE suite_id IS NULL
    LOOP
        -- Find or create a default suite for this project
        SELECT id INTO default_suite_id 
        FROM public.suites 
        WHERE project_id = run_record.project_id 
        AND name = 'Default Suite'
        LIMIT 1;
        
        -- If no default suite exists, create one
        IF default_suite_id IS NULL THEN
            INSERT INTO public.suites (project_id, name, description)
            VALUES (
                run_record.project_id,
                'Default Suite',
                'Default test suite for migrated test runs'
            )
            RETURNING id INTO default_suite_id;
            
            RAISE NOTICE 'Created default suite for project: %', run_record.project_id;
        END IF;
        
        -- Assign the test run to the default suite
        UPDATE public.test_runs
        SET suite_id = default_suite_id
        WHERE id = run_record.id;
    END LOOP;
END $$;

-- Make suite_id NOT NULL after migration
ALTER TABLE public.test_runs 
ALTER COLUMN suite_id SET NOT NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_test_runs_suite_id ON public.test_runs(suite_id);

-- Add comment
COMMENT ON COLUMN public.test_runs.suite_id IS 'Foreign key to suites - which suite this test run belongs to';
