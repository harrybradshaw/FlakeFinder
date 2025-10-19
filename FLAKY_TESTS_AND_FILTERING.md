# Flaky Test Improvements & Filtering Features

## Overview

Enhanced the test viewer to display detailed retry information for flaky tests and added filtering/sorting capabilities for test cases.

## What's New

### 1. Flaky Test Retry Details ✨

**Before:** Flaky tests showed a simple message about retries
**After:** Full breakdown of each retry attempt with:

- Individual status for each attempt (passed/failed)
- Duration for each retry
- Error messages from failed attempts
- Screenshots captured during each retry
- Visual attempt badges showing retry index

### 2. Database Schema Updates

Created new `test_results` table to store individual retry attempts:

```sql
CREATE TABLE public.test_results (
    id UUID PRIMARY KEY,
    test_id UUID REFERENCES tests(id),
    retry_index INTEGER,
    status TEXT,
    duration INTEGER,
    error TEXT,
    screenshots JSONB,
    started_at TIMESTAMPTZ
);
```

### 3. Upload Logic Enhanced

Updated `/app/api/upload-zip/route.ts` to:

- Capture ALL retry attempts from Playwright reports (not just the last one)
- Store each retry with its screenshots and error messages
- Insert retry data into `test_results` table

### 4. Filtering & Sorting 🎯

Added UI controls to filter and sort test cases:

**Filters:**

- All Tests
- Failed only
- Flaky only
- Passed only
- Skipped only

**Sort Options:**

- By Status (failed → flaky → skipped → passed)
- By Name (alphabetical)
- By Duration (longest first)

### 5. UI Improvements

**Test Case List:**

- Added filter dropdown with status options
- Added sort dropdown with sorting criteria
- Shows filtered count: "Test Cases (15)"
- Skipped tests now have a clock icon

**Flaky Test Display:**

- Expandable accordion showing all retry attempts
- Each attempt shows:
  - Badge with attempt number
  - Pass/fail indicator
  - Duration
  - Error message (if failed)
  - Screenshots from that specific attempt
- Color-coded borders (yellow for flaky)

## How It Works

### Data Flow

```
Playwright Test Run (with retries)
  ↓
Upload API extracts all retry attempts
  ↓
Stores in database:
  - tests table (final status)
  - test_results table (each retry)
  ↓
API endpoint fetches both tables
  ↓
UI displays with filtering/sorting
```

### Example Flaky Test Display

```
⚠️ Flaky Test
This test had 3 attempts

┌─ Attempt 1 ────────────────┐
│ ✗ Failed • 2.34s           │
│ Error: Timeout waiting...  │
│ [Screenshot 1] [Screenshot 2] │
└────────────────────────────┘

┌─ Attempt 2 ────────────────┐
│ ✗ Failed • 1.89s           │
│ Error: Element not found...│
│ [Screenshot 1]             │
└────────────────────────────┘

┌─ Attempt 3 ────────────────┐
│ ✓ Passed • 1.45s           │
└────────────────────────────┘
```

## Migration Steps

### Apply Schema Changes

Run the updated `schema.sql` in your Supabase SQL editor:

```sql
-- Creates test_results table
-- Adds indexes
-- Sets up RLS policies
```

### Upload New Test Results

After applying the schema, upload a new Playwright test report:

1. The system will extract all retry attempts
2. Store them in the new `test_results` table
3. Display them in the UI with full details

## Benefits

1. **Better Flaky Test Analysis**
   - See exactly which attempts failed and why
   - Compare screenshots across retries
   - Identify patterns in flaky behavior

2. **Easier Debugging**
   - Error messages from each failed attempt
   - Screenshots showing the state during each retry
   - Timestamps for each attempt

3. **Improved Navigation**
   - Quickly filter to see only problematic tests
   - Sort by duration to find slow tests
   - Focus on specific test statuses

4. **Historical Context**
   - Full retry history preserved in database
   - Can analyze flakiness patterns over time
   - Screenshots provide visual debugging context

## API Changes

### GET /api/test-runs/[id]

Now includes `retryResults` array for each test:

```typescript
{
  tests: [
    {
      id: "...",
      name: "should display correctly",
      status: "flaky",
      retryResults: [
        {
          retry_index: 0,
          status: "failed",
          duration: 2340,
          error: "Timeout...",
          screenshots: ["data:image/png;base64,..."],
        },
        {
          retry_index: 1,
          status: "passed",
          duration: 1450,
          screenshots: [],
        },
      ],
    },
  ];
}
```

## Future Enhancements

Potential improvements:

- Retry timeline visualization
- Flakiness rate over time chart
- Automatic flaky test detection
- Retry pattern analysis
- Export flaky test reports
