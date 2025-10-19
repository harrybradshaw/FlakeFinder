# Test Health Dashboard

## Overview

A comprehensive view of all tests across all runs, showing reliability metrics, flakiness trends, and health scores.

## Features

### 1. **Test Aggregation**

- Groups tests by name + file path
- Aggregates metrics across all runs in selected time range
- Shows pass/fail/flaky rates
- Calculates health scores

### 2. **Filtering & Search**

- **Search** - Filter by test name or file path
- **Environment** - Filter by production, staging, development
- **Trigger** - Filter by CI, pull request, merge queue, etc.
- **Time Range** - View last 7, 30, or 90 days

### 3. **Sorting Options**

- **Health (Worst First)** - Default, shows unhealthy tests first
- **Most Flaky** - Tests with highest flaky rate
- **Most Failed** - Tests with highest failure rate
- **Most Runs** - Tests run most frequently
- **Name (A-Z)** - Alphabetical order

### 4. **Health Scoring**

Each test gets a health score (0-100):

- **100 = Perfect** - All passes
- **90+ = Healthy** - Very reliable
- **70-89 = Unstable** - Some issues
- **<70 = Unhealthy** - Serious reliability problems

Formula:

```
health = 100 - (failRate * 2) - flakyRate
```

Failures penalized more than flakiness.

### 5. **Visual Indicators**

**Health Badges:**

- 🟢 **Healthy** (90+) - Green badge
- 🟡 **Unstable** (70-89) - Yellow badge
- 🔴 **Unhealthy** (<70) - Red badge

**Trend Icons:**

- ↗️ **Improving** - Last 3 runs all passed
- ↘️ **Degrading** - Last 3 runs all failed
- ➖ **Mixed** - Inconsistent results

**Recent Status Dots:**

- 🟢 Passed
- 🔴 Failed
- 🟡 Flaky
- ⚪ Skipped

Shows last 10 runs for quick visual trend analysis.

### 6. **Metrics Displayed**

For each test:

- **Pass Rate** - % of runs that passed
- **Fail Rate** - % of runs that failed
- **Flaky Rate** - % of runs that were flaky
- **Total Runs** - How many times test has run
- **Avg Duration** - Average execution time
- **Recent History** - Visual dots showing last 10 runs

## API Endpoint

### GET `/api/tests`

**Query Parameters:**

- `environment` - Filter by environment (optional)
- `trigger` - Filter by trigger (optional)
- `timeRange` - 7d, 30d, or 90d (default: 30d)

**Response:**

```json
{
  "tests": [
    {
      "name": "User can login",
      "file": "auth/login.spec.ts",
      "totalRuns": 45,
      "passRate": "88.9",
      "failRate": "6.7",
      "flakyRate": "4.4",
      "avgDuration": 2340,
      "recentStatuses": ["passed", "passed", "flaky", "passed"],
      "health": 85.6
    }
  ]
}
```

## Use Cases

### 1. **Identify Flaky Tests**

Sort by "Most Flaky" to find tests that intermittently fail and need fixing.

### 2. **Find Failing Tests**

Sort by "Most Failed" to prioritize tests that consistently fail.

### 3. **Monitor Test Health**

Default sort shows unhealthy tests first - your action items for test maintenance.

### 4. **Environment-Specific Issues**

Filter by environment to see which tests fail in specific environments (e.g., only in production).

### 5. **CI vs Manual Testing**

Filter by trigger to compare reliability in CI vs pull requests vs manual runs.

### 6. **Spot Trends**

Visual dots show if tests are improving (more green), degrading (more red), or unstable (mixed).

## Navigation

**From Main Dashboard:**
Click "Test Health" button in header

**From Test Health:**
Click back arrow to return to main dashboard

## Example Workflow

1. **Open Test Health Dashboard**
2. **Set time range to 30 days**
3. **Sort by "Health (Worst First)"**
4. **See which tests are unhealthy**
5. **Click on flaky tests to investigate**
6. **Filter by environment to see environment-specific issues**
7. **Use search to find specific test**

## Future Enhancements

Potential additions:

- Click test to see detailed history timeline
- Export unhealthy tests to CSV
- Set health score thresholds with alerts
- Compare test health across branches
- Group by test suite/file
- Show correlation between test health and deployment success
