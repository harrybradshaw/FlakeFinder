# Duplicate Detection

## Overview

The system automatically detects and prevents duplicate test run uploads using content-based hashing. This allows the same tests to run multiple times with the same parameters (commit, branch, environment, trigger) as long as the results differ.

## How It Works

### Content Hash Generation

When you upload a test run, the system generates a SHA-256 hash of:

- Environment
- Trigger
- Branch
- Commit SHA
- Test names, files, and statuses (sorted for consistency)

**Excluded from hash:**

- Timestamps
- Durations
- Screenshots
- Error messages

This means the same tests can run multiple times, and only truly duplicate results are blocked.

### Hash Example

```javascript
{
  environment: "staging",
  trigger: "merge_queue",
  branch: "main",
  commit: "abc123",
  tests: [
    { name: "User can login", file: "auth.spec.ts", status: "passed" },
    { name: "User can logout", file: "auth.spec.ts", status: "failed" }
  ]
}
// Hash: "a3f5e82b9c1d..."
```

## When Duplicates Are Detected

### Upload Blocked with Message:

```
⚠️ This exact test run was already uploaded on Jan 18, 2025, 2:30 PM.
If you want to re-upload, please modify the tests or wait for different results.
```

**HTTP Status:** 409 Conflict

**Response:**

```json
{
  "error": "Duplicate upload detected",
  "message": "This exact test run was already uploaded on...",
  "existingRunId": "uuid-of-existing-run",
  "isDuplicate": true
}
```

## Scenarios

### ✅ Allowed (Different Results)

**Scenario 1: Flaky Test**

```
Run 1: Test A fails → Hash: abc123...
Run 2: Test A passes → Hash: def456... ✅ Different hash, allowed
```

**Scenario 2: Fixed Bug**

```
Run 1: 5 tests fail → Hash: abc123...
Run 2: All tests pass → Hash: def456... ✅ Different hash, allowed
```

**Scenario 3: New Test Added**

```
Run 1: 10 tests → Hash: abc123...
Run 2: 11 tests → Hash: def456... ✅ Different hash, allowed
```

### ❌ Blocked (True Duplicates)

**Scenario 1: Accidental Re-upload**

```
Run 1: 10 tests, 8 passed, 2 failed → Hash: abc123...
Run 2: Same 10 tests, same results → Hash: abc123... ❌ Blocked
```

**Scenario 2: Re-running Without Changes**

```
Run 1: All tests pass → Hash: abc123...
Run 2: All tests pass (no code changes) → Hash: abc123... ❌ Blocked
```

## Why This Approach?

### Problem Solved:

You can run the same test suite multiple times on the same commit:

- **Flaky tests** might pass/fail differently
- **Environment issues** might cause intermittent failures
- **Timing issues** might affect results

### What's Prevented:

- Accidentally uploading the same report twice
- Cluttering the database with duplicate data
- Confusing trend charts with duplicate runs

## Database Schema

### test_runs Table:

```sql
CREATE TABLE test_runs (
  ...
  content_hash TEXT,
  ...
);

CREATE INDEX idx_test_runs_content_hash ON test_runs(content_hash);
```

The hash is indexed for fast duplicate lookups.

## API Behavior

### Duplicate Check Flow:

1. Generate content hash from uploaded data
2. Query database for existing run with same hash
3. If found: Return 409 Conflict with existing run details
4. If not found: Proceed with upload

### Performance:

- Hash generation: ~1ms
- Database lookup: ~10ms (indexed)
- Total overhead: Negligible

## Use Cases

### CI/CD Pipelines

**Multiple runs per commit:**

```
Commit abc123:
- Run 1 (merge queue): 2 tests fail
- Run 2 (merge queue): Same tests fail → ❌ Blocked
- Run 3 (after fix): All pass → ✅ Allowed (different results)
```

### Flaky Test Detection

**Repeated runs to check flakiness:**

```
Commit abc123, Run 10 times:
- Run 1: Test A fails → ✅
- Run 2: Test A passes → ✅ (different)
- Run 3: Test A fails → ✅ (different from run 2)
- Run 4: Test A passes → ✅ (different from run 3)
```

### Environment Testing

**Same commit, different environments:**

```
Commit abc123:
- staging + merge_queue → Hash includes "staging"
- production + merge_queue → Hash includes "production"
✅ Both allowed (different environments)
```

## Edge Cases

### Same Results, Different Timestamps

```
Run at 2:00 PM: Tests A, B, C all pass
Run at 3:00 PM: Tests A, B, C all pass
❌ Blocked (timestamps excluded from hash)
```

### Different Durations

```
Run 1: Test takes 2 seconds
Run 2: Test takes 5 seconds (same pass/fail status)
❌ Blocked (durations excluded from hash)
```

### Screenshot Differences

```
Run 1: Screenshot shows error state
Run 2: Screenshot shows different error
❌ Blocked if test statuses are the same (screenshots excluded)
```

## Bypassing Duplicate Detection

If you need to re-upload the same results:

### Option 1: Modify Metadata

Change environment, trigger, or branch to create a different hash.

### Option 2: Wait for Different Results

Run tests again until results change (natural for flaky tests).

### Option 3: Manual Database Edit

If absolutely necessary, manually delete the existing run from the database.

## Benefits

### ✅ **Data Integrity**

- No accidental duplicates
- Clean, accurate historical data
- Reliable trend analysis

### ✅ **Storage Efficiency**

- Prevents duplicate test data
- Reduces database size
- Lower storage costs

### ✅ **Better UX**

- Clear error messages
- Shows when duplicate was uploaded
- Prevents confusion

### ✅ **Allows Retries**

- Same suite can run multiple times
- Only blocks identical results
- Supports flaky test detection

## Future Enhancements

Potential improvements:

- Option to override and upload anyway
- Show diff between current and existing run
- Automatic retry detection (mark as retry instead of blocking)
- Configurable hash fields (include/exclude durations)
- Duplicate detection for JSON uploads (currently only ZIP)
