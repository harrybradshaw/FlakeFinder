-- Migration 003: Add suites table and link suite_tests to suites
-- A suite is a logical grouping of tests within a project

-- Create suites table
CREATE TABLE IF NOT EXISTS public.suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, name)
);

-- Add suite_id to suite_tests table
ALTER TABLE public.suite_tests 
ADD COLUMN IF NOT EXISTS suite_id UUID REFERENCES public.suites(id) ON DELETE CASCADE;

-- Create a default suite for each project and migrate existing suite_tests
DO $$
DECLARE
    project_record RECORD;
    default_suite_id UUID;
BEGIN
    -- For each project, create a default suite
    FOR project_record IN SELECT id, name FROM public.projects LOOP
        -- Insert default suite
        INSERT INTO public.suites (project_id, name, description)
        VALUES (
            project_record.id,
            'Default Suite',
            'Default test suite for ' || project_record.name
        )
        ON CONFLICT (project_id, name) DO NOTHING
        RETURNING id INTO default_suite_id;
        
        -- If suite already exists, get its ID
        IF default_suite_id IS NULL THEN
            SELECT id INTO default_suite_id 
            FROM public.suites 
            WHERE project_id = project_record.id AND name = 'Default Suite';
        END IF;
        
        -- Update all suite_tests for this project to belong to the default suite
        UPDATE public.suite_tests
        SET suite_id = default_suite_id
        WHERE project_id = project_record.id AND suite_id IS NULL;
        
        RAISE NOTICE 'Created/updated default suite for project: %', project_record.name;
    END LOOP;
END $$;

-- Make suite_id NOT NULL after migration
ALTER TABLE public.suite_tests 
ALTER COLUMN suite_id SET NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_suites_project_id ON public.suites(project_id);
CREATE INDEX IF NOT EXISTS idx_suite_tests_suite_id ON public.suite_tests(suite_id);

-- Add updated_at trigger for suites table
CREATE TRIGGER update_suites_updated_at BEFORE UPDATE ON public.suites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on suites
ALTER TABLE public.suites ENABLE ROW LEVEL SECURITY;

-- Create policy for suites (allow all for now, can be refined later)
CREATE POLICY "Allow all operations on suites" ON public.suites
    FOR ALL USING (true) WITH CHECK (true);

-- Add comments explaining the tables
COMMENT ON TABLE public.suites IS 'Logical groupings of tests within a project. Each project can have multiple suites.';
COMMENT ON COLUMN public.suites.id IS 'Primary key - unique identifier for this suite';
COMMENT ON COLUMN public.suites.project_id IS 'Foreign key to projects table';
COMMENT ON COLUMN public.suites.name IS 'Suite name (e.g., "Smoke Tests", "E2E Tests", "API Tests")';
COMMENT ON COLUMN public.suites.description IS 'Optional description of what this suite contains';

COMMENT ON COLUMN public.suite_tests.suite_id IS 'Foreign key to suites - which suite this test belongs to';
