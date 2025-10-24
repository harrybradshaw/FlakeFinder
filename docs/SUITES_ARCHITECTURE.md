# Suites Architecture

## Overview

Suites provide a way to logically group tests within a project. This allows for better organization and filtering of tests.

## Database Schema

### `suites` Table

```sql
CREATE TABLE public.suites (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE(project_id, name)
);
```

**Key Fields**:

- `id` - Unique identifier for the suite
- `project_id` - Which project this suite belongs to
- `name` - Suite name (e.g., "Smoke Tests", "E2E Tests", "API Tests")
- `description` - Optional description
- **Unique Constraint**: `(project_id, name)` - One suite name per project

### Updated `suite_tests` Table

```sql
ALTER TABLE suite_tests
ADD COLUMN suite_id UUID REFERENCES suites(id) NOT NULL;
```

## Hierarchy

```
Organization
  └── Project
      └── Suite (e.g., "Smoke Tests", "E2E Tests")
          └── Suite Test (canonical test definition)
              └── Test Execution (in test_runs)
```

## Default Suite

Every project automatically gets a **"Default Suite"** that contains all tests unless explicitly assigned to another suite.

### Migration Behavior

- Creates "Default Suite" for each existing project
- Assigns all existing `suite_tests` to the default suite
- Future uploads will use the default suite unless specified otherwise

## Use Cases

### 1. **Test Organization**

```
Project: "E-Commerce App"
├── Suite: "Smoke Tests" (quick, critical path tests)
├── Suite: "E2E Tests" (full user journeys)
├── Suite: "API Tests" (backend integration)
└── Suite: "Performance Tests" (load testing)
```

### 2. **Selective Test Runs**

- Run only smoke tests on every PR
- Run full E2E suite nightly
- Run performance tests weekly

### 3. **Test Health Dashboard Filtering**

- View flakiness by suite
- Compare suite performance over time
- Identify problematic test categories

## API Integration

### Upload Flow

1. **Upload test results** → `/api/upload-zip`
2. **Get/Create default suite** for the project
3. **Upsert suite_tests** with `suite_id` reference
4. **Insert test executions** linked to suite_tests

### Future Enhancements

#### Suite Detection from File Path

```typescript
// Auto-assign suite based on file path
if (test.file.includes("/smoke/")) {
  suiteId = smokeSuiteId;
} else if (test.file.includes("/e2e/")) {
  suiteId = e2eSuiteId;
}
```

#### Suite Metadata in Upload

```typescript
// Allow specifying suite in upload form
const formData = {
  file: zipFile,
  project: "my-project",
  suite: "Smoke Tests", // Optional
  // ...
};
```

#### Suite-based Filtering

```typescript
// Filter test runs by suite
GET /api/test-runs?suite=smoke-tests

// View suite health
GET /api/suites/{suiteId}/health
```

## Benefits

1. **Better Organization** - Group related tests together
2. **Flexible Filtering** - View/run specific test categories
3. **Clearer Reporting** - Suite-level metrics and trends
4. **Scalability** - Manage large test suites more effectively
5. **Team Alignment** - Different teams can own different suites

## Example Queries

### Get all suites for a project

```sql
SELECT * FROM suites WHERE project_id = 'abc-123';
```

### Get all tests in a suite

```sql
SELECT st.*
FROM suite_tests st
WHERE st.suite_id = 'suite-123';
```

### Get test execution stats by suite

```sql
SELECT
  s.name as suite_name,
  COUNT(DISTINCT st.id) as total_tests,
  COUNT(t.id) as total_executions,
  SUM(CASE WHEN t.status = 'passed' THEN 1 ELSE 0 END) as passed,
  SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as failed
FROM suites s
JOIN suite_tests st ON st.suite_id = s.id
JOIN tests t ON t.suite_test_id = st.id
WHERE s.project_id = 'abc-123'
GROUP BY s.id, s.name;
```

## Migration Path

1. **Run migration** → `003_add_suites.sql`
2. **Default suite created** for each project
3. **Existing tests migrated** to default suite
4. **Future uploads** automatically use default suite
5. **(Optional)** Manually create additional suites
6. **(Optional)** Reassign tests to appropriate suites
