-- Migration: Add projects table and update test_runs to include project_id
-- This enables multi-project support and future user-based access control

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert a default project for existing data
INSERT INTO public.projects (name, display_name, description, color) VALUES
    ('default', 'Default Project', 'Default project for test runs', '#3b82f6')
ON CONFLICT (name) DO NOTHING;

-- Add project_id column to test_runs table
ALTER TABLE public.test_runs 
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id);

-- Set default project for existing test runs
UPDATE public.test_runs 
SET project_id = (SELECT id FROM public.projects WHERE name = 'default')
WHERE project_id IS NULL;

-- Make project_id NOT NULL after setting defaults
ALTER TABLE public.test_runs 
ALTER COLUMN project_id SET NOT NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_test_runs_project_id ON public.test_runs(project_id);

-- Enable Row Level Security on projects table
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations on projects (adjust based on security requirements)
CREATE POLICY "Allow all operations on projects" ON public.projects
    FOR ALL USING (true) WITH CHECK (true);

-- Add updated_at trigger for projects table
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
