# Test Attachments Feature

## Overview

The test viewer now captures and displays all attachments from Playwright test runs, providing rich context for debugging.

## What's Captured

### Text/Data Attachments

- **Route Selection** - Test parameters like origin/destination
- **Test Configuration** - Environment settings, feature flags, etc.
- **stdout/stderr** - Console output from test execution
- **Custom Test Data** - Any text data attached via `test.attach()`

### Visual Attachments

- **Screenshots** - Error screenshots and test checkpoints
- **Videos** - (if configured in Playwright)
- **Trace Files** - Referenced but not displayed inline

## Schema Changes

Added `attachments` JSONB column to `test_results` table:

```sql
attachments JSONB DEFAULT '[]'::jsonb
```

Stores attachments as JSON array:

```json
[
  {
    "name": "Route Selection",
    "contentType": "text/plain",
    "content": "Origin: KGX\nDestination: EDB"
  },
  {
    "name": "Test Configuration",
    "contentType": "text/plain",
    "content": "Environment: staging\nFeature flags: {...}"
  }
]
```

## Upload Logic

The upload API now:

1. Scans all result attachments
2. Extracts image attachments separately (for screenshots)
3. Captures text/data attachments with inline `body` content
4. Stores them in the `attachments` field

```typescript
// Processes attachments like:
{
  name: "Route Selection",
  contentType: "text/plain",
  body: "Origin: KGX\nDestination: EDB"
}
```

## UI Display

Attachments appear in each retry attempt under **"Test Context"**:

```
┌─ Attempt 1 ──────────────────┐
│ ✗ Failed • 2.34s             │
│                               │
│ Test Context:                 │
│ ┌───────────────────────────┐│
│ │ Route Selection           ││
│ │ Origin: KGX               ││
│ │ Destination: EDB          ││
│ └───────────────────────────┘│
│ ┌───────────────────────────┐│
│ │ Test Configuration        ││
│ │ Environment: staging      ││
│ │ User: test@example.com    ││
│ └───────────────────────────┘│
│                               │
│ Error Details:                │
│ ...                           │
└───────────────────────────────┘
```

## Benefits

1. **Better Debugging** - See exactly what parameters/config were used
2. **Test Context** - Understand test environment and setup
3. **Reproducibility** - All info needed to reproduce failures
4. **Generic** - Works with any text attachment from Playwright

## Usage in Playwright Tests

```typescript
// Attach custom data to tests
await test.step("Setup", async () => {
  await test.attach("Route Selection", {
    body: `Origin: ${origin}\nDestination: ${destination}`,
    contentType: "text/plain",
  });

  await test.attach("Test Configuration", {
    body: JSON.stringify(config, null, 2),
    contentType: "application/json",
  });
});
```

## Migration

1. Run `teardown.sql` to drop old tables
2. Run `schema.sql` to create tables with `attachments` field
3. Re-upload test results to capture attachments

Existing data won't have attachments, but new uploads will capture them automatically.
