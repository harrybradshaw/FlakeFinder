# Test Execution Time vs Upload Time

## Overview
The system now displays the actual test execution time from Playwright reports, not the upload time. This provides accurate historical data even if reports are uploaded hours or days after the tests ran.

## How It Works

### Timestamp Priority
1. **Test Execution Time** (from Playwright report) - Preferred
2. **Upload Time** (current time) - Fallback

### Data Source
The test execution time is extracted from the Playwright report's `startTime` field:

```json
{
  "startTime": "2025-01-18T14:30:00.000Z",
  "duration": 125000,
  "metadata": { ... },
  "files": [ ... ]
}
```

This timestamp represents when the test suite **started running**, not when the report was generated or uploaded.

## Benefits

### ✅ **Accurate Historical Data**
```
Tests run: 10:00 AM
Report uploaded: 2:00 PM
Dashboard shows: 10:00 AM ✓
```

### ✅ **Delayed Uploads**
```
Tests run on CI: Monday 9 AM
Developer downloads report: Tuesday 3 PM
Uploads to viewer: Tuesday 3:15 PM
Dashboard shows: Monday 9 AM ✓
```

### ✅ **Correct Trend Analysis**
```
Timeline shows tests in order they ran:
- 9:00 AM: First run
- 11:30 AM: Second run
- 2:15 PM: Third run

Even if uploaded:
- 5:00 PM: All three uploaded at once
```

## Where This Appears

### Main Dashboard
```
Test Runs (Last 7 Days)
┌──────────────────────────────┐
│ staging • main               │
│ Jan 18, 2025, 10:30 AM ← Test execution time
│ 45 tests • 2m 15s           │
└──────────────────────────────┘
```

### Test Details Page
```
Header:
staging • main
Jan 18, 2025, 10:30 AM • 2m 15s • abc1234
```

### Test Health Dashboard
Charts show data points at test execution time, not upload time.

### Trends Chart
X-axis represents when tests actually ran, providing accurate trend analysis.

## Edge Cases

### No Execution Time in Report
If the Playwright report doesn't include `startTime`:
- Falls back to upload time
- Still functions correctly
- Rare (Playwright always includes startTime)

### Manual JSON Upload
JSON reports might not include `startTime`:
- Uses upload time
- No impact on functionality
- User still sees when they uploaded it

### Time Zone Differences
- Timestamps stored in UTC
- Displayed in user's local timezone
- Consistent across all views

## Technical Implementation

### Upload API
```typescript
// Extract from report.json
if (reportData.startTime) {
  testExecutionTime = reportData.startTime
}

// Use in test run
timestamp: testExecutionTime || new Date().toISOString()
```

### Database
```sql
-- Stored as TIMESTAMPTZ (UTC)
timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Frontend Display
```typescript
// Displayed in user's local timezone
new Date(testRun.timestamp).toLocaleString()
```

## Comparison

### Before:
```
Run tests at 10:00 AM
Upload at 2:00 PM
Dashboard shows: 2:00 PM ❌ (upload time)
```

### After:
```
Run tests at 10:00 AM
Upload at 2:00 PM
Dashboard shows: 10:00 AM ✅ (execution time)
```

## Benefits for Different Workflows

### CI/CD Pipeline
```
1. Tests run in CI: 10:00 AM
2. Artifact saved: 10:05 AM
3. Uploaded to viewer: 10:10 AM
Dashboard shows: 10:00 AM ✅
```

### Manual Testing
```
1. Run tests locally: 2:00 PM
2. Save report: 2:05 PM
3. Upload next day: 9:00 AM
Dashboard shows: 2:00 PM ✅ (previous day)
```

### Batch Upload
```
Upload multiple reports at once:
- Report A (ran Monday 9 AM)
- Report B (ran Monday 2 PM)
- Report C (ran Tuesday 10 AM)

Dashboard shows each at correct execution time
```

## Future Enhancements

Potential improvements:
- Show both execution time and upload time
- Warn if upload is significantly delayed
- Display time since execution
- Highlight "late" uploads

## Migration

Existing test runs in the database:
- Already have upload time as timestamp
- Will remain unchanged
- New uploads use execution time
- No data migration needed
