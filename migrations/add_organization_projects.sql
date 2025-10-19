-- Migration: Add organization-project relationship
-- This enables organization-based access control for projects

-- Create organization_projects junction table
CREATE TABLE IF NOT EXISTS public.organization_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id TEXT NOT NULL, -- Clerk organization ID
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, project_id)
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_organization_projects_org_id ON public.organization_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_projects_project_id ON public.organization_projects(project_id);

-- Enable Row Level Security
ALTER TABLE public.organization_projects ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (will be refined based on Clerk auth)
CREATE POLICY "Allow all operations on organization_projects" ON public.organization_projects
    FOR ALL USING (true) WITH CHECK (true);

-- Optional: Link default project to all organizations (for backward compatibility)
-- You can run this separately or comment it out if not needed
-- INSERT INTO public.organization_projects (organization_id, project_id)
-- SELECT 'default-org-id', id FROM public.projects WHERE name = 'default'
-- ON CONFLICT (organization_id, project_id) DO NOTHING;
