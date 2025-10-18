# Next.js 15 Params Fix

## Issue
Next.js 15 requires dynamic route `params` to be awaited before accessing properties.

**Error:**
```
Route "/runs/[id]" used `params.id`. `params` should be awaited before using its properties.
```

## Changes Made

### 1. Created API Endpoint for Single Test Run
**File:** `/app/api/test-runs/[id]/route.ts`

- Fetches test run by ID from Postgres
- Includes associated tests from the `tests` table
- Properly awaits params: `const { id } = await params`
- Returns formatted data matching the frontend interface

### 2. Updated Test Run Page Component
**File:** `/app/runs/[id]/page.tsx`

**Before:**
```typescript
export default function TestRunPage({ params }: { params: { id: string } }) {
  const testRun = mockTestRuns.find((run) => run.id === params.id)
  // ...
}
```

**After:**
```typescript
export default async function TestRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const testRun = await fetchTestRun(id)
  // ...
}
```

### Key Changes:
1. ✅ Made component `async`
2. ✅ Changed params type to `Promise<{ id: string }>`
3. ✅ Await params before accessing: `const { id } = await params`
4. ✅ Replaced mock data with real Postgres data
5. ✅ Server-side data fetching for better performance

## Benefits
- **Compliant with Next.js 15** - No more sync params errors
- **Real data** - Fetches from Postgres instead of mock data
- **Server-side rendering** - Better SEO and initial load performance
- **Type-safe** - Proper TypeScript types for async params

## Testing
Navigate to a test run detail page to verify:
```
/runs/[test-run-uuid]
```

The page should now load real data from your Postgres database.
