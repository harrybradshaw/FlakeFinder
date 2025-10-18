-- Create test_runs table
CREATE TABLE IF NOT EXISTS public.test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment TEXT NOT NULL,
    trigger TEXT NOT NULL,
    branch TEXT NOT NULL,
    commit TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    flaky INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    duration BIGINT NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
CREATE INDEX IF NOT EXISTS idx_test_runs_timestamp ON public.test_runs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_branch ON public.test_runs(branch);
CREATE INDEX IF NOT EXISTS idx_test_runs_environment ON public.test_runs(environment);
CREATE INDEX IF NOT EXISTS idx_tests_test_run_id ON public.tests(test_run_id);
CREATE INDEX IF NOT EXISTS idx_tests_status ON public.tests(status);
CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON public.test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_test_results_retry_index ON public.test_results(retry_index);

-- Enable Row Level Security (RLS) - recommended for Supabase
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (adjust based on your security requirements)
CREATE POLICY "Allow all operations on test_runs" ON public.test_runs
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on tests" ON public.tests
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on test_results" ON public.test_results
    FOR ALL USING (true) WITH CHECK (true);
