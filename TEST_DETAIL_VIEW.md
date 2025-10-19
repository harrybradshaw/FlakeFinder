# Test Detail View

## Overview

Click on any test from the Test Health Dashboard to see detailed historical trends, charts, and run-by-run breakdown.

## Features

### 1. **Summary Metrics**

Four key metric cards at the top:

- **Pass Rate** - Percentage of successful runs
- **Fail Rate** - Percentage of failed runs
- **Flaky Rate** - Percentage of flaky runs
- **Avg Duration** - Average execution time

### 2. **Trend Chart**

Line chart showing test results over time:

- **Green line** - Passed tests per day
- **Red line** - Failed tests per day
- **Yellow line** - Flaky tests per day
- Filled areas for visual impact
- Interactive tooltips on hover

Similar to the homepage trends but focused on a single test.

### 3. **Recent Run History**

Chronological list of recent test executions showing:

- **Status** - Visual icon (✓ passed, ✗ failed, ⚠ flaky)
- **Timestamp** - When the test ran
- **Environment** - Badge showing environment
- **Trigger** - Badge showing what triggered it
- **Branch** - Git branch name
- **Duration** - How long it took

Shows last 20 runs (most recent first).

### 4. **Filtering**

Same filters as other views:

- **Environment** - Filter by production/staging/dev
- **Trigger** - Filter by CI/PR/manual
- **Time Range** - 7/30/90 days

All metrics and charts update based on filters.

## Navigation

**To view test details:**

1. Go to Test Health Dashboard (`/tests`)
2. Click on any test card
3. See detailed history and trends

**To go back:**

- Click the ← arrow in the header
- Returns to Test Health Dashboard

## How It Works

### URL Structure

Tests are identified by base64-encoded `name::file` combination:

```
/tests/VXNlciBjYW4gbG9naW46OmF1dGgvbG9naW4uc3BlYy50cw==
```

This ensures URL-safe handling of test names with special characters.

### API Endpoint

**GET** `/api/tests/[testId]`

Query parameters:

- `environment` - Filter by environment
- `trigger` - Filter by trigger
- `timeRange` - Time range (7d/30d/90d)

Response:

```json
{
  "name": "User can login",
  "file": "auth/login.spec.ts",
  "summary": {
    "totalRuns": 45,
    "passRate": "88.9",
    "failRate": "6.7",
    "flakyRate": "4.4",
    "avgDuration": 2340
  },
  "history": [
    {
      "timestamp": "2025-10-18T10:30:00Z",
      "status": "passed",
      "duration": 2100,
      "environment": "staging",
      "trigger": "ci",
      "branch": "main"
    }
  ]
}
```

### Chart Aggregation

- Groups test results by day
- Counts passed/failed/flaky per day
- Displays as multi-line chart
- Automatically scales axes

## Use Cases

### 1. **Investigate Flaky Test**

- See when flakiness started
- Check if it's environment-specific
- Identify pattern (e.g., only fails on weekends)

### 2. **Track Test Improvement**

- Made changes to fix flaky test
- View trend chart to confirm improvement
- Monitor over time to ensure stability

### 3. **Debug Failing Test**

- See recent failures
- Check which environments fail
- Look for branch correlation
- Compare durations for timeouts

### 4. **Performance Analysis**

- View average duration trend
- Identify if test is getting slower
- Compare across environments

### 5. **Environment Comparison**

- Filter by production - see metrics
- Filter by staging - see metrics
- Compare pass rates

## Example Workflow

1. **Notice flaky test** in Test Health Dashboard
2. **Click on test** to view details
3. **See trend chart** showing when it became flaky
4. **Filter by environment** - only flaky in staging
5. **Check recent runs** - see error messages
6. **Fix the issue** in staging environment
7. **Monitor trend** to confirm fix

## Visual Elements

### Status Icons

- ✓ **Green check** - Passed
- ✗ **Red X** - Failed
- ⚠ **Yellow triangle** - Flaky
- ⏰ **Gray clock** - Skipped

### Color Scheme

- **Green** - Success/passed
- **Red** - Failure/failed
- **Yellow** - Warning/flaky
- **Blue** - Information/duration
- **Gray** - Neutral/skipped

## Dependencies

Uses **Recharts** for visualizations (same as homepage):

- No additional dependencies needed
- Already included in the project
- Consistent styling with main dashboard

## Future Enhancements

Potential additions:

- Export history to CSV
- Compare two time periods
- Show correlation with deployments
- Link to specific test run details
- Add annotations for known issues
- Show test code snippet
- Performance regression alerts
