-- Fix organization ID to match the actual Clerk organization ID
-- Based on your logs, the correct org ID is: org_34HAuRKHxt3n9uPO1i4XZmgwyCC

-- Update the existing record with the correct organization ID
UPDATE public.organization_projects
SET organization_id = 'org_34HAuRKHxt3n9uPO1i4XZmgwyCC'
WHERE organization_id = 'org_34HARWMIoMUYmBGIGTN7ePNBy';

-- Verify the update
SELECT 
    op.id,
    op.organization_id,
    p.name as project_name,
    p.display_name as project_display_name,
    op.created_at
FROM public.organization_projects op
JOIN public.projects p ON op.project_id = p.id
WHERE op.organization_id = 'org_34HAuRKHxt3n9uPO1i4XZmgwyCC';
