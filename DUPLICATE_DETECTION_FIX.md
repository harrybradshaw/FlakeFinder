# Duplicate Detection Bug Fix

## Problem

The duplicate detection feature was not working reliably. When a test report was uploaded via `/api/upload-zip` and then checked via `/api/check-duplicate`, the system would fail to detect it as a duplicate even though it was the same file with the same metadata.

## Root Cause

The bug was in the hash calculation logic in `/app/api/check-duplicate/route.ts`. The two endpoints were calculating different hashes for the same test data:

### upload-zip (CORRECT)
```typescript
tests: tests.map((t) => ({
  name: t.name,
  file: t.file,
  status: t.status,
}))
```

### check-duplicate (BUGGY - BEFORE FIX)
```typescript
tests: tests.map((test) => ({
  id: test.id,      // ← EXTRA FIELD!
  name: test.name,
  file: test.file,
  status: test.status,
}))
```

The `check-duplicate` endpoint was including the `id` field in the hash calculation, but `upload-zip` was not. Since test IDs are unique for each test execution, the hashes would **never match**, making duplicate detection impossible.

## Fix

Removed the `id` field from the hash calculation in `check-duplicate` to match the `upload-zip` logic:

```typescript
// File: app/api/check-duplicate/route.ts
// Line: 142-147

tests: tests.map((test) => ({
  name: test.name,    // ✅ Only these 3 fields
  file: test.file,
  status: test.status,
}))
```

## Verification

Created comprehensive tests to verify the fix:

### 1. Hash Consistency Test (`app/api/hash-consistency.test.ts`)
- ✅ Verifies both endpoints calculate identical hashes for the same data
- ✅ Verifies different metadata produces different hashes
- ✅ Verifies hash is order-independent (sorting works correctly)

### 2. Integration Test (`app/api/integration.test.ts`)
- Tests end-to-end duplicate detection flow
- Uploads a file via upload-zip
- Checks the same file via check-duplicate
- Verifies duplicate is correctly detected

## Test Results

```bash
$ pnpm test:run app/api/hash-consistency.test.ts

✓ Hash Calculation Consistency (3 tests)
  ✓ should calculate identical hashes for the same test data
  ✓ should produce different hashes when metadata differs
  ✓ should produce same hash regardless of test order in array

Test Files  1 passed (1)
Tests       3 passed (3)
```

### Hash Verification Output
```
=== Hash Calculation Test ===
Upload hash: 734d8d7054b97edbadb49bacee6cfa1d537f61b43836219692c26cc1b7d9137e
Check hash:  734d8d7054b97edbadb49bacee6cfa1d537f61b43836219692c26cc1b7d9137e
Match: true ✅
```

## Impact

- **Before**: Duplicate detection never worked - all uploads were treated as unique
- **After**: Duplicate detection works correctly - identical test runs are properly identified

## Hash Calculation Logic

Both endpoints now use the same logic:

```typescript
const hashContent = {
  environment,
  trigger,
  branch,
  commit,
  tests: tests
    .map((test) => ({
      name: test.name,
      file: test.file,
      status: test.status,
    }))
    .sort((a, b) =>
      `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
    ),
};

const contentHash = await crypto.subtle
  .digest("SHA-256", new TextEncoder().encode(JSON.stringify(hashContent)))
  .then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
```

### What's Included in the Hash
- Environment (e.g., "production", "staging")
- Trigger (e.g., "manual", "ci")
- Branch (e.g., "main", "develop")
- Commit SHA
- Test names, files, and statuses (sorted for consistency)

### What's NOT Included
- Test IDs (unique per execution)
- Timestamps
- Durations
- Screenshots
- Error messages
- Worker indices

This ensures that the same tests with the same results produce the same hash, regardless of when or where they were run.

## Files Changed

1. **`app/api/check-duplicate/route.ts`**
   - Fixed hash calculation to exclude `id` field
   - Now matches `upload-zip` logic exactly

2. **`app/api/hash-consistency.test.ts`** (NEW)
   - Unit tests for hash calculation
   - Verifies consistency between endpoints

3. **`app/api/integration.test.ts`** (NEW)
   - End-to-end integration tests
   - Verifies duplicate detection workflow

## Running the Tests

```bash
# Run all tests
pnpm test

# Run only hash consistency tests
pnpm test:run app/api/hash-consistency.test.ts

# Run only integration tests
pnpm test:run app/api/integration.test.ts

# Run with UI
pnpm test:ui
```

## Future Improvements

Consider adding:
1. Database-backed integration tests with real Supabase instance
2. Performance tests for large test reports
3. Tests for edge cases (empty reports, malformed data, etc.)
4. Monitoring/alerting for duplicate detection failures in production
