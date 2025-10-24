# Suite Tests Architecture

## Overview

The database now has a cleaner separation between **test definitions** and **test executions**.

## Database Tables

### `suite_tests` - Canonical Test Definitions

- **Purpose**: Stores the unique definition of each test in your suite
- **Key Fields**:
  - `id` (UUID) - Primary key, unique identifier for this test definition
  - `project_id` (UUID) - Which project this test belongs to
  - `file` (TEXT) - Test file path
  - `name` (TEXT) - Test name
- **Unique Constraint**: `(project_id, file, name)` - ensures one entry per unique test
- **Usage**: This is the "canonical" test that exists across all test runs

### `tests` - Test Execution Instances

- **Purpose**: Stores each individual execution of a test in a test run
- **Key Fields**:
  - `id` (UUID) - Primary key for this specific execution
  - `test_run_id` (UUID) - Which test run this execution belongs to
  - `suite_test_id` (UUID) - **Links to the canonical test definition**
  - `status`, `duration`, `error`, etc. - Execution-specific data
  - **Note**: `name` and `file` are NOT stored here - they're in `suite_tests` to avoid duplication
- **Usage**: Each row represents one execution of a test. Join with `suite_tests` to get name and file.

## Benefits

### 1. **Clean Referential Integrity**

- No more encoding/decoding `name::file` in base64
- Direct UUID foreign key relationships
- Proper database normalization

### 2. **No Data Duplication**

- Test `name` and `file` are stored once in `suite_tests`
- The `tests` table only stores execution-specific data
- Reduces storage and ensures consistency

### 3. **Efficient Queries**

```sql
-- Get all executions of a specific test with name and file
SELECT t.*, st.name, st.file
FROM tests t
JOIN suite_tests st ON t.suite_test_id = st.id
WHERE t.suite_test_id = 'abc-123-def';

-- Much better than scanning text fields:
SELECT * FROM tests WHERE name = 'my test' AND file = 'path/to/file.spec.ts';
```

### 3. **Better Indexing**

- Single column index on `suite_test_id` instead of composite `(name, file)`
- Faster lookups and joins

### 4. **Test History**

- The `/tests/[testId]` route now uses `suite_test_id` (UUID)
- No more base64 encoding/decoding
- Direct database lookups

## Data Flow

### Upload Process

1. **Upload test results** → `/api/upload-zip`
2. **Upsert suite_tests** → Create/update canonical test definitions
   - Uses `ON CONFLICT (project_id, file, name)` to avoid duplicates
3. **Insert tests** → Create execution instances with `suite_test_id` reference
4. **Insert test_results** → Store retry attempts

### Viewing Test History

1. **Click "View Test History"** button → `/tests/{suite_test_id}`
2. **API fetches** suite_test definition
3. **API queries** all test executions with matching `suite_test_id`
4. **Returns** history across all runs

## Migration

The migration file `/migrations/002_add_suite_tests.sql` handles:

1. Creating the `suite_tests` table
2. Adding `suite_test_id` column to `tests` table
3. **Migrating existing data** - creates suite_tests from existing tests
4. **Backfilling** - updates existing tests to reference their suite_test
5. Indexes and RLS policies

## API Changes

### `/api/test-runs/[id]` Response

```typescript
{
  tests: [
    {
      id: "uuid", // Execution instance ID
      suite_test_id: "uuid", // Canonical test definition ID
      name: "test name", // Joined from suite_tests
      file: "path/to/file", // Joined from suite_tests
      // ... other fields
    },
  ];
}
```

### `/api/tests` (Test Health Dashboard)

- **Before**: Aggregated by `name::file` string concatenation
- **After**: Aggregates by `suite_test_id` (UUID)
- **Query**: Joins `tests` with `suite_tests` to get name/file
- **Response**: Includes `suite_test_id` for direct linking

### `/api/tests/[testId]` (Test History)

- **Before**: `testId` was base64 encoded `name::file`
- **After**: `testId` is the `suite_test_id` (UUID)
- **Query**: Direct lookup by `suite_test_id` instead of name+file scan

## Frontend Changes

### Component Updates

- `TestDetailsView` now uses `suite_test_id` for linking
- Button changed from "View Full Test Details" to "View Test History" (more accurate)
- TypeScript interfaces updated with clear comments

### Type Definitions

```typescript
interface TestCase {
  id?: string; // UUID - execution instance
  suite_test_id?: string; // UUID - canonical test definition
  name: string;
  file: string;
  // ...
}
```

## Key Improvements

1. **No more encoding** - UUIDs instead of base64 `name::file`
2. **Proper normalization** - Test definitions separated from executions
3. **Better performance** - Indexed UUID lookups instead of text scans
4. **Clearer semantics** - Explicit distinction between definition and execution
5. **Referential integrity** - Foreign key constraints ensure data consistency
