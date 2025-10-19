# Project Feature

## Overview

The test viewer now supports organizing test runs by **projects**. This enables:
- Multi-project test result tracking in a single instance
- Future user-based access control (limiting which projects a user can see)
- Better organization of test runs across different codebases or teams

## Database Schema Changes

### New `projects` Table

```sql
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#3b82f6',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Updated `test_runs` Table

The `test_runs` table now includes a `project_id` foreign key:

```sql
ALTER TABLE public.test_runs 
ADD COLUMN project_id UUID NOT NULL REFERENCES public.projects(id);
```

## Migration

To apply the changes to an existing database:

1. Run the migration script:
   ```bash
   psql $DATABASE_URL -f migrations/add_projects.sql
   ```

2. Or for new installations, use the updated `schema.sql` which includes the projects table.

## API Changes

### Upload API (`/api/upload-zip`)

The upload endpoint now accepts an optional `project` parameter:

```typescript
const formData = new FormData()
formData.append('file', zipFile)
formData.append('project', 'my-project')  // Optional, defaults to 'default'
formData.append('environment', 'staging')
formData.append('trigger', 'ci')
formData.append('branch', 'main')
formData.append('commit', 'abc123')
```

If no project is specified, test runs are assigned to the `default` project.

### Test Runs API (`/api/test-runs`)

The test runs endpoint now supports filtering by project:

```
GET /api/test-runs?project=my-project&environment=staging&timeRange=7d
```

### Projects API (`/api/projects`)

New endpoint to manage projects:

**GET** `/api/projects` - List all active projects
```json
{
  "projects": [
    {
      "id": "uuid",
      "name": "default",
      "display_name": "Default Project",
      "description": "Default project for test runs",
      "color": "#3b82f6",
      "active": true
    }
  ]
}
```

**POST** `/api/projects` - Create a new project
```json
{
  "name": "my-project",
  "display_name": "My Project",
  "description": "Test runs for my project",
  "color": "#10b981"
}
```

## Frontend Changes

### Test Run Display

Test runs now display project information:
- Project badge with custom color (only shown if not the default project)
- Environment badge
- Trigger badge with icon

### TypeScript Interface

The `TestRun` interface has been updated:

```typescript
export interface TestRun {
  id: string
  timestamp: string
  project?: string
  project_display?: string
  project_color?: string
  environment: string
  environment_display?: string
  environment_color?: string
  trigger: string
  trigger_display?: string
  trigger_icon?: string
  // ... other fields
}
```

## Default Project

A default project is automatically created during schema initialization:
- **Name**: `default`
- **Display Name**: `Default Project`
- **Color**: `#3b82f6` (blue)

All existing test runs are automatically assigned to this project during migration.

## Future Enhancements

With projects in place, you can now implement:

1. **User-based access control**: Create a `user_projects` junction table to limit which projects each user can access
2. **Project-level settings**: Store project-specific configuration (e.g., notification settings, retention policies)
3. **Project filtering in UI**: Add a project selector dropdown in the frontend
4. **Project dashboards**: Create dedicated views for each project with project-specific metrics

## Example: Creating a New Project

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-app",
    "display_name": "Web Application",
    "description": "E2E tests for the web application",
    "color": "#10b981"
  }'
```

## Example: Uploading Test Results to a Project

When uploading test results, specify the project:

```bash
curl -X POST http://localhost:3000/api/upload-zip \
  -F "file=@playwright-report.zip" \
  -F "project=web-app" \
  -F "environment=staging" \
  -F "trigger=ci" \
  -F "branch=main" \
  -F "commit=abc123"
```
