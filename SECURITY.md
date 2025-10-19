# Security Implementation

## Overview

The test viewer application uses **Clerk** for authentication and authorization, with organization-based access control for projects and test runs.

## Authentication

### Clerk Middleware

All API routes are protected by Clerk middleware defined in `middleware.ts`:

```typescript
// All API routes require authentication
const isProtectedRoute = createRouteMatcher([
  "/api/(.*)", // Protect all API routes
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect(); // Require authentication
  }
});
```

**What this means:**

- Any request to `/api/*` requires a valid Clerk session
- Unauthenticated users receive a 401 Unauthorized response
- The middleware runs before any API route handler

### Additional Route-Level Checks

Each API route also verifies authentication:

```typescript
const { userId } = await auth();

if (!userId) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

This provides defense-in-depth even if middleware is bypassed.

## Authorization (Organization-Based Access Control)

### How It Works

1. **Users belong to Clerk Organizations**
   - Managed through the Clerk dashboard or API
   - Users can be members of multiple organizations

2. **Organizations are linked to Projects** via the `organization_projects` table:

   ```sql
   CREATE TABLE organization_projects (
       id UUID PRIMARY KEY,
       organization_id TEXT NOT NULL, -- Clerk organization ID
       project_id UUID NOT NULL REFERENCES projects(id),
       UNIQUE(organization_id, project_id)
   );
   ```

3. **Access is determined by membership**:
   - Users can only see/access projects their organizations are linked to
   - Test runs are filtered by accessible projects
   - Uploads are restricted to accessible projects

### Protected Endpoints

#### `/api/projects` (GET)

- Returns only projects linked to user's organizations
- Empty array if user has no organization memberships

#### `/api/test-runs` (GET)

- Filters test runs to only show those from accessible projects
- Validates `project` query parameter against user's accessible projects

#### `/api/upload-zip` (POST)

- Verifies user is authenticated
- Checks user belongs to at least one organization
- Validates user's organization has access to the target project
- Returns 403 Forbidden if unauthorized

**Access validation flow:**

```typescript
// 1. Get user's organizations from Clerk
const orgMemberships = await clerkClient.users.getOrganizationMembershipList({
  userId,
});
const userOrgIds = orgMemberships.data.map((m) => m.organization.id);

// 2. Query accessible projects
const { data: orgProjects } = await supabase
  .from("organization_projects")
  .select("project_id")
  .in("organization_id", userOrgIds);

// 3. Verify project access
if (!accessibleProjectIds.includes(requestedProjectId)) {
  return NextResponse.json({ error: "Access denied" }, { status: 403 });
}
```

#### `/api/projects` (POST)

- Creates project and automatically links it to user's current organization
- Requires user to be in an organization

#### `/api/organization-projects` (GET/POST/DELETE)

- Manages organization-project relationships
- Users can only view relationships for their organizations

#### `/api/environments` & `/api/triggers` (GET)

- Require authentication
- Return configuration data (not sensitive, but still protected)

### Organization Setup

**To link an organization to a project:**

```sql
-- Get your organization ID from Clerk (visible in logs or dashboard)
-- Then link it to a project:

INSERT INTO public.organization_projects (organization_id, project_id)
SELECT 'org_YOUR_ORG_ID', id
FROM public.projects
WHERE name = 'project-name'
ON CONFLICT (organization_id, project_id) DO NOTHING;
```

**Via API:**

```bash
curl -X POST http://localhost:3000/api/organization-projects \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "org_YOUR_ORG_ID",
    "project_id": "project-uuid"
  }'
```

## Security Best Practices Implemented

### ✅ Authentication

- [x] All API routes protected by Clerk middleware
- [x] Double-check authentication in route handlers
- [x] Session-based authentication (handled by Clerk)

### ✅ Authorization

- [x] Organization-based access control
- [x] Project-level permissions
- [x] Upload restrictions based on organization membership
- [x] Test run filtering by accessible projects

### ✅ Data Validation

- [x] Validate user has access before querying sensitive data
- [x] Verify organization membership before operations
- [x] Check project accessibility before uploads

### ✅ Defense in Depth

- [x] Middleware + route-level auth checks
- [x] Database-level access control via organization links
- [x] Explicit validation at each authorization point

## Environment Variables

Required environment variables for security:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...

# Clerk URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

## Testing Authorization

### Test Scenario 1: Unauthenticated Access

```bash
# Should return 401 Unauthorized
curl http://localhost:3000/api/projects
```

### Test Scenario 2: Access to Unauthorized Project

1. Create a project linked to Organization A
2. Sign in as a user in Organization B
3. Try to access the project → Should return empty results

### Test Scenario 3: Upload to Unauthorized Project

```bash
# Should return 403 Forbidden
curl -X POST http://localhost:3000/api/upload-zip \
  -F "file=@test-results.zip" \
  -F "project=unauthorized-project" \
  -F "environment=staging" \
  -F "trigger=ci" \
  -F "branch=main"
```

## Troubleshooting

### "No projects found for user's organizations"

**Cause:** User's organization isn't linked to any projects

**Solution:** Link the organization to a project:

```sql
INSERT INTO public.organization_projects (organization_id, project_id)
VALUES ('org_YOUR_ORG_ID', 'project-uuid');
```

### "User must be a member of an organization"

**Cause:** User is authenticated but not in any Clerk organization

**Solution:**

1. Go to Clerk Dashboard → Organizations
2. Create an organization
3. Add the user to the organization

### Organization ID Mismatch

**Symptoms:** Database has organization links but API returns empty results

**Cause:** Organization ID in database doesn't match Clerk organization ID

**Solution:**

1. Check logs for actual organization ID: `[API] User organizations: [ 'org_...' ]`
2. Update database record with correct ID:
   ```sql
   UPDATE public.organization_projects
   SET organization_id = 'org_CORRECT_ID'
   WHERE organization_id = 'org_OLD_ID';
   ```

## Future Enhancements

Potential security improvements:

1. **Role-Based Access Control (RBAC)**
   - Add roles (admin, member, viewer) within organizations
   - Fine-grained permissions per project

2. **Audit Logging**
   - Log all access attempts
   - Track who uploaded which test results
   - Monitor authorization failures

3. **API Keys for CI/CD**
   - Allow test uploads via API keys (not just user sessions)
   - Link API keys to organizations

4. **Row-Level Security (RLS) in Supabase**
   - Enforce access control at database level
   - Reduce reliance on application-level checks

5. **Rate Limiting**
   - Prevent abuse of API endpoints
   - Protect against DoS attacks
