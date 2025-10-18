# Scalable Environments & Triggers System

## Overview
The system now uses dedicated database tables for environments and triggers with foreign key relationships, making it easy to add new values without code changes.

## Database Schema

### Environments Table
```sql
CREATE TABLE public.environments (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,           -- Internal name (e.g., "production")
    display_name TEXT NOT NULL,          -- Display name (e.g., "Production")
    description TEXT,                    -- Optional description
    color TEXT DEFAULT '#3b82f6',        -- Hex color for UI
    active BOOLEAN DEFAULT true,         -- Can be disabled without deletion
    created_at TIMESTAMPTZ
);
```

### Test Triggers Table
```sql
CREATE TABLE public.test_triggers (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,           -- Internal name (e.g., "merge_queue")
    display_name TEXT NOT NULL,          -- Display name (e.g., "Merge Queue")
    description TEXT,                    -- Optional description
    icon TEXT DEFAULT '▶️',              -- Emoji icon for UI
    active BOOLEAN DEFAULT true,         -- Can be disabled without deletion
    created_at TIMESTAMPTZ
);
```

### Test Runs (Updated)
```sql
CREATE TABLE public.test_runs (
    ...
    environment_id UUID REFERENCES environments(id),  -- FK instead of TEXT
    trigger_id UUID REFERENCES test_triggers(id),     -- FK instead of TEXT
    ...
);
```

## Default Data

### Environments
```sql
INSERT INTO environments (name, display_name, color) VALUES
    ('production', 'Production', '#ef4444'),     -- Red
    ('staging', 'Staging', '#f59e0b'),           -- Orange
    ('development', 'Development', '#3b82f6');   -- Blue
```

### Triggers
```sql
INSERT INTO test_triggers (name, display_name, icon) VALUES
    ('ci', 'CI', '🔄'),
    ('pull_request', 'Pull Request', '🔀'),
    ('merge_queue', 'Merge Queue', '📦'),
    ('post_deploy', 'Post Deploy', '🚀');
```

## Adding New Values

### Add a New Environment (via SQL)
```sql
INSERT INTO public.environments (name, display_name, description, color)
VALUES ('uat', 'UAT', 'User Acceptance Testing', '#8b5cf6');
```

### Add a New Trigger (via SQL)
```sql
INSERT INTO public.test_triggers (name, display_name, description, icon)
VALUES ('nightly', 'Nightly', 'Nightly regression tests', '🌙');
```

### Disable Without Deleting
```sql
UPDATE public.environments SET active = false WHERE name = 'uat';
UPDATE public.test_triggers SET active = false WHERE name = 'nightly';
```

## API Endpoints

### GET /api/environments
Returns all active environments.

**Response:**
```json
{
  "environments": [
    {
      "id": "uuid",
      "name": "production",
      "display_name": "Production",
      "description": "Production environment",
      "color": "#ef4444",
      "active": true
    }
  ]
}
```

### GET /api/triggers
Returns all active triggers.

**Response:**
```json
{
  "triggers": [
    {
      "id": "uuid",
      "name": "merge_queue",
      "display_name": "Merge Queue",
      "description": "Merge queue validation",
      "icon": "📦",
      "active": true
    }
  ]
}
```

## Frontend Integration

### Upload Dialog
Dropdowns now populate dynamically from the API:

```typescript
const { data: environmentsData } = useSWR("/api/environments", fetcher)
const { data: triggersData } = useSWR("/api/triggers", fetcher)

const environments = environmentsData?.environments || []
const triggers = triggersData?.triggers || []

// Rendered as:
<SelectContent>
  {environments.map((env) => (
    <SelectItem key={env.id} value={env.name}>
      {env.display_name}
    </SelectItem>
  ))}
</SelectContent>
```

### Test Run Display
Test runs now include rich metadata:

```typescript
{
  environment: "production",              // Internal name
  environment_display: "Production",      // Display name
  environment_color: "#ef4444",          // Color for badges
  trigger: "merge_queue",                 // Internal name
  trigger_display: "Merge Queue",        // Display name
  trigger_icon: "📦"                     // Icon
}
```

## Upload Flow

1. **User selects file** → Auto-detection suggests environment/trigger
2. **User reviews metadata** → Dropdowns populated from database
3. **Upload API receives** → `environment: "production"`, `trigger: "merge_queue"`
4. **API looks up IDs**:
   ```typescript
   const env = await db.environments.findOne({ name: "production", active: true })
   const trig = await db.test_triggers.findOne({ name: "merge_queue", active: true })
   ```
5. **Insert with FKs**:
   ```sql
   INSERT INTO test_runs (environment_id, trigger_id, ...)
   VALUES (env.id, trig.id, ...)
   ```

## Benefits

### ✅ Scalability
- Add unlimited environments/triggers
- No code deployment needed
- Just run SQL INSERT

### ✅ Data Integrity
- Foreign key constraints
- Can't delete env/trigger in use
- Referential integrity enforced

### ✅ Rich Metadata
- Colors for visual distinction
- Icons for quick recognition
- Descriptions for clarity

### ✅ Backwards Compatible
- Frontend still uses name strings
- API transparently handles FK lookup
- No breaking changes

### ✅ Flexible Management
- Disable without deleting (active flag)
- Update display names/colors anytime
- Historical data preserved

## Use Cases

### Multi-Region Environments
```sql
INSERT INTO environments (name, display_name, color) VALUES
    ('prod-us', 'Production US', '#ef4444'),
    ('prod-eu', 'Production EU', '#dc2626'),
    ('prod-asia', 'Production Asia', '#b91c1c');
```

### Custom Triggers
```sql
INSERT INTO test_triggers (name, display_name, icon) VALUES
    ('release-candidate', 'Release Candidate', '🎯'),
    ('hotfix', 'Hotfix', '🔥'),
    ('smoke-test', 'Smoke Test', '💨');
```

### Temporary Environments
```sql
INSERT INTO environments (name, display_name, color) VALUES
    ('feature-abc', 'Feature ABC', '#a855f7');

-- Later, disable instead of delete:
UPDATE environments SET active = false WHERE name = 'feature-abc';
```

## Migration Instructions

### For Fresh Installation
1. Run `teardown.sql` to drop old tables
2. Run `schema.sql` to create new structure
3. Default environments/triggers are auto-inserted

### Adding Custom Values
```sql
-- Add your custom environments
INSERT INTO public.environments (name, display_name, description, color)
VALUES 
    ('qa', 'QA', 'Quality Assurance environment', '#10b981'),
    ('demo', 'Demo', 'Demo environment for clients', '#6366f1');

-- Add your custom triggers
INSERT INTO public.test_triggers (name, display_name, description, icon)
VALUES 
    ('manual', 'Manual', 'Manually triggered tests', '👤'),
    ('scheduled', 'Scheduled', 'Scheduled test runs', '⏰');
```

## Future Admin UI

The system is designed for a future admin page where you can:
- Add/edit environments (name, display, color)
- Add/edit triggers (name, display, icon)
- Enable/disable without deleting
- See usage statistics
- Manage via UI instead of SQL

### Suggested Admin UI Features:
```
┌─ Environments ──────────────────┐
│ [+ Add Environment]              │
│                                  │
│ Production      🟥 Active        │
│   #ef4444       [Edit] [Disable]│
│                                  │
│ Staging         🟧 Active        │
│   #f59e0b       [Edit] [Disable]│
└──────────────────────────────────┘
```

## Querying

### Get test runs with environment/trigger names
```typescript
const runs = await supabase
  .from("test_runs")
  .select(`
    *,
    environment:environments(name, display_name, color),
    trigger:test_triggers(name, display_name, icon)
  `)
```

### Filter by environment name
```typescript
// Get environment ID first
const { data: env } = await supabase
  .from("environments")
  .select("id")
  .eq("name", "production")
  .single()

// Then query test runs
const { data: runs } = await supabase
  .from("test_runs")
  .select("*")
  .eq("environment_id", env.id)
```

## Color Palette Suggestions

For additional environments:
- `#22c55e` - Green (success/stable)
- `#06b6d4` - Cyan (preview)
- `#8b5cf6` - Purple (special/UAT)
- `#ec4899` - Pink (experimental)
- `#64748b` - Slate (deprecated)

## Icon Suggestions

For additional triggers:
- `⏰` - Scheduled
- `👤` - Manual
- `🔥` - Hotfix
- `🎯` - Release Candidate
- `💨` - Smoke Test
- `🧪` - Experimental
- `📊` - Benchmark
