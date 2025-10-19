# Custom Organizations Setup

This application uses a custom organization system instead of Clerk's built-in organizations to support larger team sizes.

## Database Schema

### Tables

1. **organizations** - Stores organization details
   - `id` (UUID) - Primary key
   - `name` (TEXT) - Unique identifier
   - `display_name` (TEXT) - Human-readable name
   - `description` (TEXT) - Optional description
   - `active` (BOOLEAN) - Whether organization is active
   - `created_at`, `updated_at` (TIMESTAMPTZ)

2. **user_organizations** - Maps Clerk users to organizations
   - `id` (UUID) - Primary key
   - `user_id` (TEXT) - Clerk user ID
   - `organization_id` (UUID) - References organizations table
   - `role` (TEXT) - User role: 'member', 'admin', or 'owner'
   - `created_at` (TIMESTAMPTZ)

3. **organization_projects** - Maps organizations to projects
   - `id` (UUID) - Primary key
   - `organization_id` (UUID) - References organizations table
   - `project_id` (UUID) - References projects table
   - `created_at` (TIMESTAMPTZ)

## Migration

Run the migration to set up the custom organization tables:

```sql
-- Run migrations/custom_organizations.sql in your Supabase SQL editor
```

This migration:

- Creates the `organizations` and `user_organizations` tables
- Updates `organization_projects` to reference the new organizations table
- Migrates existing Clerk org IDs to the new system (using default org)
- Sets up appropriate indexes and RLS policies

## Setting Up Users

### 1. Create an Organization

Using the API:

```bash
curl -X POST https://your-domain.com/api/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-company",
    "display_name": "My Company",
    "description": "My company organization"
  }'
```

### 2. Add Users to Organization

```bash
curl -X POST https://your-domain.com/api/user-organizations \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_xxx",
    "organization_id": "uuid-here",
    "role": "member"
  }'
```

**Roles:**

- `member` - Can view and upload test results
- `admin` - Can manage users and projects
- `owner` - Full access, can delete organization

### 3. Link Projects to Organization

```bash
curl -X POST https://your-domain.com/api/organization-projects \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "uuid-here",
    "project_id": "uuid-here"
  }'
```

## Manual Setup via SQL

You can also set up organizations directly in Supabase:

```sql
-- 1. Create an organization
INSERT INTO organizations (name, display_name, description)
VALUES ('acme-corp', 'Acme Corporation', 'Main organization');

-- 2. Get the organization ID
SELECT id FROM organizations WHERE name = 'acme-corp';

-- 3. Add users to the organization (replace with actual Clerk user IDs)
INSERT INTO user_organizations (user_id, organization_id, role)
VALUES
  ('user_2xxx', 'org-uuid-from-step-2', 'owner'),
  ('user_3xxx', 'org-uuid-from-step-2', 'member');

-- 4. Get the default project ID
SELECT id FROM projects WHERE name = 'default';

-- 5. Link the organization to the project
INSERT INTO organization_projects (organization_id, project_id)
VALUES ('org-uuid-from-step-2', 'project-uuid-from-step-4');
```

## Finding Clerk User IDs

To get a user's Clerk ID, you can:

1. **From the Clerk Dashboard:**
   - Go to Users section
   - Click on a user
   - Copy their User ID (starts with `user_`)

2. **From the application logs:**
   - User IDs are logged when they make authenticated requests
   - Check your Next.js server logs for `[API] User:` messages

3. **Using Clerk API:**
   ```bash
   curl -X GET https://api.clerk.dev/v1/users \
     -H "Authorization: Bearer YOUR_CLERK_SECRET_KEY"
   ```

## API Endpoints

### Organizations

- `GET /api/organizations` - List user's organizations
- `POST /api/organizations` - Create new organization

### User Memberships

- `GET /api/user-organizations` - List organization memberships (admin only)
- `POST /api/user-organizations` - Add user to organization
- `DELETE /api/user-organizations?id=xxx` - Remove user from organization

### Organization-Project Links

- `GET /api/organization-projects` - List project links
- `POST /api/organization-projects` - Link project to organization
- `DELETE /api/organization-projects?id=xxx` - Unlink project

## Default Organization

A default organization is created automatically during migration. You can add all users to this organization initially:

```sql
-- Add all Clerk users to default organization
-- (Replace user IDs with actual Clerk user IDs)
INSERT INTO user_organizations (user_id, organization_id, role)
SELECT
  'user_xxx' as user_id,
  (SELECT id FROM organizations WHERE name = 'default') as organization_id,
  'member' as role;
```

## Authorization Flow

1. User authenticates with Clerk
2. API fetches user's organizations from `user_organizations` table
3. API fetches accessible projects from `organization_projects` table
4. User can only see/upload test runs for projects their organization has access to

This replaces the previous Clerk organization lookup with custom database queries.
