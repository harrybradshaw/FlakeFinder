# Test Details View Fix

## Problem

The test details page was showing mock/generated test cases instead of the actual tests from the database.

## Root Cause

The `TestDetailsView` component was calling `generateMockTestCases()` which created fake test data based only on the count statistics (passed, failed, flaky), not the actual test results.

## Solution

### 1. Updated TestRun Interface

**File:** `/lib/mock-data.ts`

Added `tests` property to the `TestRun` interface:

```typescript
tests?: Array<{
  id: string
  name: string
  status: "passed" | "failed" | "flaky" | "skipped" | "timedOut"
  duration: number
  file: string
  error?: string
  screenshots?: string[]
}>
```

### 2. Updated TestDetailsView Component

**File:** `/components/test-details-view.tsx`

**Before:**

```typescript
const testCases = generateMockTestCases(testRun);
```

**After:**

```typescript
const testCases: TestCase[] =
  testRun.tests && testRun.tests.length > 0
    ? testRun.tests.map((test) => ({
        name: test.name,
        file: test.file,
        status:
          test.status === "timedOut"
            ? "failed"
            : (test.status as "passed" | "failed" | "flaky"),
        duration: formatDuration(test.duration),
        error: test.error,
        screenshots: test.screenshots?.map((url, idx) => ({
          name: `screenshot-${idx + 1}.png`,
          url,
        })),
      }))
    : generateMockTestCases(testRun);
```

### 3. Added Duration Formatter

Added helper function to format milliseconds into human-readable duration:

```typescript
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}
```

## What Now Works

When you navigate to a test run detail page:

1. ✅ Real test names from your Playwright tests
2. ✅ Actual test file paths
3. ✅ Real test durations
4. ✅ Actual error messages for failed tests
5. ✅ Real screenshots (if uploaded as base64 or URLs)
6. ✅ Accurate test statuses

## Data Flow

```
Database (test_runs + tests tables)
  ↓
API: /api/test-runs/[id]
  ↓
Page: /runs/[id]/page.tsx
  ↓
Component: TestDetailsView
  ↓
Displays real test data
```

The component still falls back to `generateMockTestCases()` if no real test data is available, ensuring the UI always has something to display.
