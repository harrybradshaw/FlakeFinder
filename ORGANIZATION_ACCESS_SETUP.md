# Organization-Based Access Control Setup Guide

## Overview

The test viewer now implements complete organization-based access control, where:

- Users must be authenticated to access the application
- Users must belong to a Clerk organization
- Organizations are linked to specific projects
- Users can only view/upload data for projects their organization has access to

## Complete Implementation Summary

### 1. Database Schema

**New Tables:**

```sql
-- Projects table
CREATE TABLE public.projects (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization-Project junction table
CREATE TABLE public.organization_projects (
    id UUID PRIMARY KEY,
    organization_id TEXT NOT NULL, -- Clerk organization ID
    project_id UUID NOT NULL REFERENCES public.projects(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, project_id)
);
```

**Updated Tables:**

```sql
-- test_runs now includes project_id
ALTER TABLE public.test_runs
ADD COLUMN project_id UUID NOT NULL REFERENCES public.projects(id);
```

### 2. Authentication & Authorization

**Middleware Protection:**

- All `/api/*` routes require authentication
- Enforced by Clerk middleware in `middleware.ts`
- Unauthenticated requests receive 401 Unauthorized

**Organization-Based Access:**

- Projects API returns only projects the user's organizations have access to
- Test runs API filters by accessible projects
- Upload API validates organization access before accepting uploads

**Frontend Protection:**

- Landing page shown to unauthenticated users
- Test dashboard only loads for authenticated users
- No API calls made until user is signed in

### 3. User Flow

#### For Unauthenticated Users:

1. Visit homepage → See landing page with sign up/sign in options
2. No API calls are made
3. No test data is attempted to load

#### For Authenticated Users:

1. Sign in → Redirected to dashboard
2. System fetches user's organization memberships from Clerk
3. Query database for projects linked to user's organizations
4. Display only accessible projects and their test runs
5. Filter all data by organization access

### 4. Setup Instructions

#### Step 1: Apply Database Migrations

```bash
# Apply the main migration
psql $DATABASE_URL -f migrations/add_organization_projects.sql

# Or use the updated schema for fresh installations
psql $DATABASE_URL -f schema.sql
```

#### Step 2: Create Organizations in Clerk

1. Go to Clerk Dashboard → Organizations
2. Create an organization for your team
3. Add users to the organization
4. Note the organization ID (format: `org_XXXXX`)

#### Step 3: Link Organizations to Projects

**Option A: Via SQL**

```sql
-- Link your organization to the default project
INSERT INTO public.organization_projects (organization_id, project_id)
SELECT 'org_YOUR_ORG_ID', id
FROM public.projects
WHERE name = 'default'
ON CONFLICT (organization_id, project_id) DO NOTHING;
```

**Option B: Via API**

```bash
curl -X POST http://localhost:3000/api/organization-projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "organization_id": "org_YOUR_ORG_ID",
    "project_id": "project-uuid"
  }'
```

#### Step 4: Create Projects (Optional)

**Via SQL:**

```sql
-- Create a new project
INSERT INTO public.projects (name, display_name, description, color)
VALUES ('my-project', 'My Project', 'Description', '#10b981')
RETURNING id;

-- Link it to your organization
INSERT INTO public.organization_projects (organization_id, project_id)
VALUES ('org_YOUR_ORG_ID', 'project-uuid-from-above');
```

**Via API:**

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "my-project",
    "display_name": "My Project",
    "description": "Project description",
    "color": "#10b981",
    "organization_id": "org_YOUR_ORG_ID"
  }'
```

### 5. Uploading Test Results

When uploading, specify the project (defaults to 'default'):

```bash
curl -X POST http://localhost:3000/api/upload-zip \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@playwright-report.zip" \
  -F "project=my-project" \
  -F "environment=staging" \
  -F "trigger=ci" \
  -F "branch=main" \
  -F "commit=abc123"
```

The API will:

1. Verify you're authenticated
2. Check you belong to an organization
3. Validate your organization has access to the specified project
4. Accept or reject the upload accordingly

### 6. Common Issues & Solutions

#### Issue: "No projects found for user's organizations"

**Cause:** User's organization isn't linked to any projects

**Solution:**

```sql
-- Check what organizations you belong to (check logs)
-- Then link to a project
INSERT INTO public.organization_projects (organization_id, project_id)
SELECT 'org_YOUR_ACTUAL_ORG_ID', id
FROM public.projects
WHERE name = 'default';
```

#### Issue: Organization ID mismatch

**Symptoms:** Database has links but API returns empty results

**Solution:**

1. Check logs for actual org ID: `[API] User organizations: [ 'org_...' ]`
2. Update database:

```sql
UPDATE public.organization_projects
SET organization_id = 'org_CORRECT_ID_FROM_LOGS'
WHERE organization_id = 'org_OLD_ID';
```

#### Issue: 404 errors on API routes when signed out

**Expected Behavior:** This is now resolved! Unauthenticated users see the landing page and no API calls are made.

### 7. Testing the Implementation

**Test 1: Unauthenticated Access**

1. Sign out
2. Visit homepage
3. ✅ Should see landing page (no API calls)

**Test 2: Authenticated Without Organization**

1. Sign in with account not in any organization
2. ✅ Should see empty state / message about needing organization

**Test 3: Authenticated With Organization Access**

1. Sign in with account in organization
2. Organization must be linked to at least one project
3. ✅ Should see projects and test runs

**Test 4: Upload to Unauthorized Project**

1. Try uploading to a project your organization doesn't have access to
2. ✅ Should receive 403 Forbidden error

### 8. Project Selector

The header now includes a project selector dropdown (visible only when multiple projects exist):

- Shows all projects the user's organizations have access to
- Filters test runs by selected project
- Persists selection in URL query parameters

### 9. Security Features

✅ **Authentication:**

- Clerk middleware protects all API routes
- No API access without valid session

✅ **Authorization:**

- Organization-based project access
- Test runs filtered by accessible projects
- Upload validation

✅ **Frontend Protection:**

- Landing page for unauthenticated users
- No unnecessary API calls
- Dashboard only loads for authenticated users

✅ **Defense in Depth:**

- Middleware-level protection
- Route-level auth checks
- Database-level access validation

## Next Steps

1. **Apply Migrations:** Run the SQL migrations on your database
2. **Setup Organizations:** Create organizations in Clerk
3. **Link Organizations:** Connect organizations to projects
4. **Test:** Verify access control is working correctly
5. **Document:** Share organization setup process with your team

## Support

For issues or questions:

1. Check logs for organization IDs and error messages
2. Verify database links in `organization_projects` table
3. Confirm users are added to organizations in Clerk
4. Review `SECURITY.md` for detailed security documentation
