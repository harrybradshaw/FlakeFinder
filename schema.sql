-- Playwright Test Viewer Database Schema

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

-- Insert default project
INSERT INTO public.projects (name, display_name, description, color) VALUES
    ('default', 'Default Project', 'Default project for test runs', '#3b82f6')
ON CONFLICT (name) DO NOTHING;

-- Create organization_projects junction table (links Clerk organizations to projects)
CREATE TABLE IF NOT EXISTS public.organization_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL, -- Clerk organization ID
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, project_id)
);

-- Create environments table
CREATE TABLE IF NOT EXISTS public.environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create triggers table (test run triggers, not database triggers)
CREATE TABLE IF NOT EXISTS public.test_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '▶️',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default environments
INSERT INTO public.environments (name, display_name, description, color) VALUES
    ('production', 'Production', 'Production environment', '#ef4444'),
    ('staging', 'Staging', 'Staging environment', '#f59e0b'),
    ('testing', 'Testing', 'Testing environment', '#8c32e6'),
    ('development', 'Development', 'Development environment', '#3b82f6')
ON CONFLICT (name) DO NOTHING;

-- Insert default triggers
INSERT INTO public.test_triggers (name, display_name, description, icon) VALUES
    ('ci', 'CI', 'Continuous Integration', '🔄'),
    ('pull_request', 'Pull Request', 'Pull request validation', '🔀'),
    ('merge_queue', 'Merge Queue', 'Merge queue validation', '📦'),
    ('post_deploy', 'Post Deploy', 'Post-deployment verification', '🚀')
ON CONFLICT (name) DO NOTHING;

-- Create test_runs table
CREATE TABLE IF NOT EXISTS public.test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id),
    environment_id UUID NOT NULL REFERENCES public.environments(id),
    trigger_id UUID NOT NULL REFERENCES public.test_triggers(id),
    branch TEXT NOT NULL,
    commit TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    flaky INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    duration BIGINT NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ci_metadata JSONB DEFAULT '{}'::jsonb,
    content_hash TEXT,
    uploaded_filename TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create tests table
CREATE TABLE IF NOT EXISTS public.tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES public.test_runs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'flaky', 'skipped', 'timedOut')),
    duration INTEGER NOT NULL DEFAULT 0,
    file TEXT NOT NULL,
    worker_index INTEGER,
    started_at TIMESTAMPTZ,
    error TEXT,
    screenshots JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create test_results table to store individual retry attempts
CREATE TABLE IF NOT EXISTS public.test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
    retry_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'timedOut', 'skipped')),
    duration INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    error_stack TEXT,
    screenshots JSONB DEFAULT '[]'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,
    started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_test_runs_project_id ON public.test_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_timestamp ON public.test_runs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_branch ON public.test_runs(branch);
CREATE INDEX IF NOT EXISTS idx_test_runs_environment_id ON public.test_runs(environment_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_trigger_id ON public.test_runs(trigger_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_content_hash ON public.test_runs(content_hash);
CREATE INDEX IF NOT EXISTS idx_tests_test_run_id ON public.tests(test_run_id);
CREATE INDEX IF NOT EXISTS idx_tests_status ON public.tests(status);
CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON public.test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_test_results_retry_index ON public.test_results(retry_index);
CREATE INDEX IF NOT EXISTS idx_organization_projects_org_id ON public.organization_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_projects_project_id ON public.organization_projects(project_id);

-- Enable Row Level Security (RLS) - recommended for Supabase
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust based on your security requirements)
CREATE POLICY "Allow all operations on projects" ON public.projects
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on organization_projects" ON public.organization_projects
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on environments" ON public.environments
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on test_triggers" ON public.test_triggers
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on test_runs" ON public.test_runs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on tests" ON public.tests
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on test_results" ON public.test_results
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
