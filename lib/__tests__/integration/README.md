# Integration Tests

This directory contains integration tests that test the complete flow of features with real HTTP mocking using MSW (Mock Service Worker).

## Why MSW?

Previously, we used complex function mocks with Vitest's `vi.mock()` which required:

- Mocking every function in the call chain
- Maintaining complex mock implementations
- Brittle tests that break when implementation details change

MSW provides a better approach by:

- **Mocking at the network level**: Intercepts actual HTTP requests
- **Testing the real integration**: Tests use the actual Supabase client and all real code
- **More maintainable**: Only need to mock the HTTP responses, not internal functions
- **Closer to production**: Tests the actual network layer behavior

## Setup

MSW is configured in each test file with:

```typescript
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  server.resetHandlers();
});
```

## Writing Tests

### 1. Define HTTP handlers

Mock Supabase REST API endpoints:

```typescript
beforeEach(() => {
  server.use(
    // Mock a GET request
    http.get(`${SUPABASE_URL}/rest/v1/environments`, ({ request }) => {
      const url = new URL(request.url);
      const name = url.searchParams.get("name");

      if (name === "eq.production") {
        return HttpResponse.json({
          id: "env-1",
          name: "production",
        });
      }

      return HttpResponse.json(null, { status: 406 });
    }),

    // Mock a POST request
    http.post(`${SUPABASE_URL}/rest/v1/test_runs`, async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json({
        id: "run-123",
        ...body,
      });
    }),
  );
});
```

### 2. Override handlers for specific tests

```typescript
it("should handle errors", async () => {
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/environments`, () => {
      return HttpResponse.json({ message: "Database error" }, { status: 500 });
    }),
  );

  // Test code...
});
```

## Supabase PostgREST API Patterns

### Query Parameters

Supabase uses PostgREST which has specific query parameter patterns:

- **Equality**: `?name=eq.production`
- **Greater than**: `?age=gt.18`
- **Select fields**: `?select=id,name`
- **Filters**: `?active=eq.true`
- **Ordering**: `?order=created_at.desc`

### Response Formats

- **`.single()`**: Returns a single object (not an array)
- **`.select()`**: Returns an array of objects
- **Error responses**: Return `null` with status 406 for "not found"

## Test Structure

Each integration test should:

1. **Setup**: Create test data (e.g., ZIP files with reports)
2. **Mock**: Define HTTP handlers for expected API calls
3. **Execute**: Call the function being tested
4. **Assert**: Verify the results

## Example Test

```typescript
it("should successfully process upload", async () => {
  const zip = new JSZip();

  // Create test report
  const testReport = {
    config: { rootDir: "/test" },
    suites: [
      {
        title: "Tests",
        file: "test.spec.ts",
        line: 1,
        column: 0,
        specs: [
          {
            testId: "test-1",
            title: "should pass",
            projectName: "chromium",
            outcome: "expected",
            duration: 1000,
            results: [
              {
                status: "passed",
                duration: 1000,
                retry: 0,
                startTime: "2024-01-01T00:00:00.000Z",
                attachments: [],
              },
            ],
          },
        ],
      },
    ],
  };

  zip.file("report.json", JSON.stringify(testReport));

  const result = await processUpload(
    zip,
    params,
    projectId,
    filename,
    logPrefix,
  );

  expect(result.success).toBe(true);
  expect(result.testRunId).toBeDefined();
});
```

## Running Tests

```bash
# Run all integration tests
pnpm test lib/__tests__/integration

# Run specific test file
pnpm test lib/__tests__/integration/shared-upload-handler-integration.test.ts

# Run with UI
pnpm test:ui
```

## Debugging

If tests fail:

1. **Check MSW warnings**: Look for "intercepted a request without a matching request handler"
2. **Add logging**: Log the actual request URLs and bodies
3. **Verify response format**: Ensure responses match what Supabase returns (single object vs array)
4. **Check query parameters**: Supabase uses specific formats like `eq.value`

## Benefits

- ✅ Tests the complete integration flow
- ✅ No complex mocking of internal functions
- ✅ Tests are resilient to refactoring
- ✅ Catches integration issues early
- ✅ Easy to understand and maintain
- ✅ Closer to real production behavior
