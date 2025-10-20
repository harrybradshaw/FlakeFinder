-- Custom Organizations Migration
-- This replaces Clerk's built-in organizations with a custom table

-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create user_organizations junction table (maps Clerk user IDs to custom organizations)
CREATE TABLE IF NOT EXISTS public.user_organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Clerk user ID
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member', -- member, admin, owner
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- Update organization_projects to reference the new organizations table
-- First, we need to handle existing data if any
-- Since we're changing from TEXT to UUID, we'll need to migrate data

-- Create a temporary column
ALTER TABLE public.organization_projects 
    ADD COLUMN IF NOT EXISTS new_organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id ON public.user_organizations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_organizations_org_id ON public.user_organizations(organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON public.organizations(name);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on organizations" ON public.organizations
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on user_organizations" ON public.user_organizations
    FOR ALL USING (true) WITH CHECK (true);

-- Add updated_at trigger for organizations
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert a default organization
INSERT INTO public.organizations (name, display_name, description) VALUES
    ('default', 'Default Organization', 'Default organization for all users')
ON CONFLICT (name) DO NOTHING;

-- Get the default organization ID and update organization_projects
DO $$
DECLARE
    default_org_id UUID;
BEGIN
    SELECT id INTO default_org_id FROM public.organizations WHERE name = 'default';
    
    -- Update existing rows to use the default organization
    UPDATE public.organization_projects 
    SET new_organization_id = default_org_id
    WHERE new_organization_id IS NULL;
END $$;

-- Drop the old column and rename the new one
ALTER TABLE public.organization_projects DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.organization_projects RENAME COLUMN new_organization_id TO organization_id;
ALTER TABLE public.organization_projects ALTER COLUMN organization_id SET NOT NULL;

-- Recreate the index
DROP INDEX IF EXISTS idx_organization_projects_org_id;
CREATE INDEX idx_organization_projects_org_id ON public.organization_projects(organization_id);
