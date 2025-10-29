vi.mock("@/lib/webhooks/webhook-service", () => ({
  triggerRunFailureWebhooks: vi.fn(),
  triggerFlakinessWebhooks: vi.fn(),
  triggerPerformanceWebhooks: vi.fn(),
}));

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  vi,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { processUpload } from "@/lib/upload/shared-upload-handler";
import { formatRunFailure } from "@/lib/webhooks/slack-formatter";
import { triggerRunFailureWebhooks } from "@/lib/webhooks/webhook-service";
import JSZip from "jszip";
import fs from "fs/promises";
import path from "path";

// Setup MSW server
const SUPABASE_URL = "https://test.supabase.co";
const SUPABASE_ANON_KEY = "test-anon-key";

const server = setupServer();

describe("Shared Upload Handler Integration", () => {
  beforeAll(() => {
    // Set environment variables
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_APP_URL = "https://test.app";

    server.listen({ onUnhandledRequest: "warn" });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  beforeEach(() => {
    // Setup default handlers for common Supabase endpoints
    server.use(
      // Mock environment lookup (Supabase uses .single() which expects single object or 406)
      http.get(`${SUPABASE_URL}/rest/v1/environments`, ({ request }) => {
        const url = new URL(request.url);
        const name = url.searchParams.get("name");

        if (name === "eq.production") {
          return HttpResponse.json(
            {
              id: "env-1",
              name: "production",
              project_id: "project-456",
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        return HttpResponse.json(null, { status: 406 });
      }),

      // Mock trigger lookup
      http.get(`${SUPABASE_URL}/rest/v1/test_triggers`, ({ request }) => {
        const url = new URL(request.url);
        const name = url.searchParams.get("name");

        if (name === "eq.ci") {
          return HttpResponse.json(
            {
              id: "trigger-1",
              name: "ci",
              project_id: "project-456",
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        return HttpResponse.json(null, { status: 406 });
      }),

      // Mock suite lookup
      http.get(`${SUPABASE_URL}/rest/v1/suites`, ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");

        if (id === "eq.suite-123") {
          return HttpResponse.json(
            {
              id: "suite-123",
              name: "E2E Tests",
              project_id: "project-456",
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        return HttpResponse.json(null, { status: 406 });
      }),

      // Mock duplicate check (test_runs query)
      http.get(`${SUPABASE_URL}/rest/v1/test_runs`, () => {
        // Return empty array (no duplicates)
        return HttpResponse.json([]);
      }),

      // Mock organization_projects lookup (uses .single())
      http.get(
        `${SUPABASE_URL}/rest/v1/organization_projects`,
        ({ request }) => {
          const url = new URL(request.url);
          const projectId = url.searchParams.get("project_id");

          if (projectId === "eq.project-456") {
            return HttpResponse.json(
              {
                organization_id: "org-1",
                project: {
                  name: "Test Project",
                },
              },
              {
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }

          return HttpResponse.json(null, { status: 406 });
        },
      ),

      // Mock test_runs insert (uses .select().single() so returns single object)
      http.post(`${SUPABASE_URL}/rest/v1/test_runs`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "run-123",
            timestamp: "2024-01-01T00:00:00Z",
            environment_id: "env-1",
            trigger_id: "trigger-1",
            suite_id: "suite-123",
            ...body,
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),

      // Mock suite_tests upsert
      http.post(`${SUPABASE_URL}/rest/v1/suite_tests`, async ({ request }) => {
        const body = await request.json();
        const tests = Array.isArray(body) ? body : [body];
        return HttpResponse.json(
          tests.map((test, index) => ({
            id: `suite-test-${index + 1}`,
            ...test,
          })),
        );
      }),

      // Mock tests insert
      http.post(`${SUPABASE_URL}/rest/v1/tests`, async ({ request }) => {
        const body = await request.json();
        const tests = Array.isArray(body) ? body : [body];
        return HttpResponse.json(
          tests.map((test, index) => ({
            id: `test-${index + 1}`,
            ...test,
          })),
        );
      }),

      // Mock test_results insert (for retry results)
      http.post(`${SUPABASE_URL}/rest/v1/test_results`, async ({ request }) => {
        const body = await request.json();
        const results = Array.isArray(body) ? body : [body];
        return HttpResponse.json(
          results.map((result, index) => ({
            id: `result-${index + 1}`,
            ...result,
          })),
        );
      }),

      // Mock test_steps insert
      http.post(`${SUPABASE_URL}/rest/v1/test_steps`, async ({ request }) => {
        const body = await request.json();
        const steps = Array.isArray(body) ? body : [body];
        return HttpResponse.json(
          steps.map((step, index) => ({
            id: `step-${index + 1}`,
            ...step,
          })),
        );
      }),

      // Mock flakiness_metrics upsert
      http.post(`${SUPABASE_URL}/rest/v1/flakiness_metrics`, async () => {
        return HttpResponse.json([]);
      }),

      // Mock performance_metrics upsert
      http.post(`${SUPABASE_URL}/rest/v1/performance_metrics`, async () => {
        return HttpResponse.json([]);
      }),

      // Mock flakiness_alerts query
      http.get(`${SUPABASE_URL}/rest/v1/flakiness_alerts`, () => {
        return HttpResponse.json([]);
      }),

      // Mock performance_alerts query
      http.get(`${SUPABASE_URL}/rest/v1/performance_alerts`, () => {
        return HttpResponse.json([]);
      }),

      // Mock tests query for metrics aggregation (flakiness and performance)
      http.get(`${SUPABASE_URL}/rest/v1/tests`, ({ request }) => {
        const url = new URL(request.url);
        const select = url.searchParams.get("select");

        // Return empty array for any metrics queries
        // These queries have complex filters for aggregation
        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),

      // Mock test_flakiness_metrics query for alert detection
      http.get(`${SUPABASE_URL}/rest/v1/test_flakiness_metrics`, () => {
        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),

      // Mock test_performance_metrics query for alert detection
      http.get(`${SUPABASE_URL}/rest/v1/test_performance_metrics`, () => {
        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),

      // Mock Supabase Storage upload
      http.post(`${SUPABASE_URL}/storage/v1/object/screenshots/*`, async () => {
        return HttpResponse.json({
          Key: "screenshots/test.png",
        });
      }),
    );
  });

  it("should successfully process a complete upload with real HTTP mocking", async () => {
    // Create a test ZIP file with playwright report
    const zip = new JSZip();

    // Add a test report JSON with proper Playwright format
    const testReport = {
      config: {
        rootDir: "/test",
        configFile: "playwright.config.ts",
      },
      suites: [
        {
          title: "Login Tests",
          file: "tests/login.spec.ts",
          line: 1,
          column: 0,
          specs: [
            {
              testId: "test-1",
              title: "should login successfully",
              projectName: "chromium",
              outcome: "expected" as const,
              duration: 1000,
              results: [
                {
                  status: "passed" as const,
                  duration: 1000,
                  retry: 0,
                  startTime: "2024-01-01T00:00:00.000Z",
                  attachments: [],
                },
              ],
            },
            {
              testId: "test-2",
              title: "should show error on invalid credentials",
              projectName: "chromium",
              outcome: "unexpected" as const,
              duration: 500,
              results: [
                {
                  status: "failed" as const,
                  duration: 500,
                  retry: 0,
                  startTime: "2024-01-01T00:00:01.000Z",
                  error: {
                    message: "Expected error message not found",
                  },
                  attachments: [],
                },
              ],
            },
          ],
        },
      ],
    };

    zip.file("report.json", JSON.stringify(testReport));

    const params = {
      environment: "production",
      trigger: "ci",
      suite: "suite-123",
      branch: "main",
      commit: "abc123",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "test-report.zip",
      "[Integration Test]",
    );

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.testRunId).toBe("run-123");
    expect(result.testRun).toBeDefined();
    expect(result.testRun?.passed).toBeGreaterThan(0);
    expect(result.testRun?.failed).toBeGreaterThan(0);
    expect(result.message).toContain("Successfully uploaded");
  });

  it("should handle missing environment configuration", async () => {
    // Override handler to return empty environment
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/environments`, () => {
        return HttpResponse.json([]);
      }),
    );

    const zip = new JSZip();
    zip.file("report.json", JSON.stringify({ suites: [] }));

    const params = {
      environment: "nonexistent",
      trigger: "ci",
      suite: "suite-123",
      branch: "main",
      commit: "abc123",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "test-report.zip",
      "[Integration Test]",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should detect and handle duplicate uploads", async () => {
    // Override handler to return existing test run
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/test_runs`, () => {
        return HttpResponse.json([
          {
            id: "existing-run-123",
            timestamp: "2024-01-01T00:00:00Z",
            content_hash: "hash123",
          },
        ]);
      }),
    );

    const zip = new JSZip();
    const testReport = {
      config: {
        rootDir: "/test",
      },
      suites: [
        {
          title: "Test Suite",
          file: "test.spec.ts",
          line: 1,
          column: 0,
          specs: [
            {
              testId: "test-1",
              title: "test",
              projectName: "chromium",
              outcome: "expected" as const,
              duration: 100,
              results: [
                {
                  status: "passed" as const,
                  duration: 100,
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

    const params = {
      environment: "production",
      trigger: "ci",
      suite: "suite-123",
      branch: "main",
      commit: "abc123",
      preCalculatedHash: "hash123",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "test-report.zip",
      "[Integration Test]",
    );

    expect(result.success).toBe(false);
    expect(result.isDuplicate).toBe(true);
    expect(result.existingRunId).toBe("existing-run-123");
    expect(result.error).toContain("Duplicate");
  });

  it("should handle database errors gracefully", async () => {
    // Override handler to return error
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/environments`, () => {
        return HttpResponse.json(
          { message: "Database connection failed" },
          { status: 500 },
        );
      }),
    );

    const zip = new JSZip();
    zip.file("report.json", JSON.stringify({ suites: [] }));

    const params = {
      environment: "production",
      trigger: "ci",
      suite: "suite-123",
      branch: "main",
      commit: "abc123",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "test-report.zip",
      "[Integration Test]",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should trigger webhooks on test failures", async () => {
    // Mock webhook endpoint (webhooks are triggered via external service)
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/webhooks`, async () => {
        return HttpResponse.json([]);
      }),
    );

    const zip = new JSZip();
    const testReport = {
      config: {
        rootDir: "/test",
      },
      suites: [
        {
          title: "Test Suite",
          file: "test.spec.ts",
          line: 1,
          column: 0,
          specs: [
            {
              testId: "test-1",
              title: "failing test",
              projectName: "chromium",
              outcome: "unexpected" as const,
              duration: 100,
              results: [
                {
                  status: "failed" as const,
                  duration: 100,
                  retry: 0,
                  startTime: "2024-01-01T00:00:00.000Z",
                  error: { message: "Test failed" },
                  attachments: [],
                },
              ],
            },
          ],
        },
      ],
    };
    zip.file("report.json", JSON.stringify(testReport));

    const params = {
      environment: "production",
      trigger: "ci",
      suite: "suite-123",
      branch: "main",
      commit: "abc123",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "test-report.zip",
      "[Integration Test]",
    );

    expect(result.success).toBe(true);
    expect(result.testRun?.failed).toBeGreaterThan(0);
  });

  it("should return error when Supabase is not configured", async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const zip = new JSZip();
    zip.file("report.json", JSON.stringify({ suites: [] }));

    const params = {
      environment: "production",
      trigger: "ci",
      suite: "suite-123",
      branch: "main",
      commit: "abc123",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "test-report.zip",
      "[Integration Test]",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Database not configured");

    // Restore env vars
    process.env.SUPABASE_URL = originalUrl;
    process.env.SUPABASE_ANON_KEY = originalKey;
  });

  it("should process real playwright-report-sample.zip fixture and trigger failure webhook", async () => {
    // Clear any previous calls
    vi.clearAllMocks();

    // Load the actual fixture file
    const fixturePath = path.join(
      __dirname,
      "../fixtures/playwright-report-sample.zip",
    );
    const zipBuffer = await fs.readFile(fixturePath);
    const zip = await JSZip.loadAsync(new Uint8Array(zipBuffer));

    const params = {
      environment: "production",
      trigger: "ci",
      suite: "suite-123",
      branch: "main",
      commit: "fixture-test-123",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "playwright-report-sample.zip",
      "[Fixture Test]",
    );

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.testRunId).toBe("run-123");
    expect(result.testRun).toBeDefined();
    expect(result.testRun?.total).toBeGreaterThan(0);
    expect(result.message).toContain("Successfully uploaded");

    expect(result.testRun?.failed).toBeGreaterThan(0);

    const expectedPassRate = result.testRun?.total
      ? (result.testRun.passed / result.testRun.total) * 100
      : 0;

    expect(triggerRunFailureWebhooks).toHaveBeenCalledTimes(1);

    // Get the actual call arguments using vi.mocked
    const calls = vi.mocked(triggerRunFailureWebhooks).mock.calls;
    expect(calls.length).toBe(1);

    const [eventPayload, projectId, organizationId] = calls[0];

    // Verify the event payload structure
    expect(eventPayload).toMatchObject({
      projectName: "Test Project",
      environment: "production",
      branch: "main",
      commit: "fixture-test-123",
      totalTests: result.testRun?.total,
      failedTests: result.testRun?.failed,
      flakyTests: result.testRun?.flaky || 0,
      passRate: expectedPassRate,
    });

    expect(eventPayload.runUrl).toContain("/runs/run-123");
    expect(eventPayload.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(projectId).toBe("project-456");
    expect(organizationId).toBe("org-1");

    // Test the Slack message formatting
    const slackMessage = formatRunFailure(eventPayload);

    // Verify Slack message structure
    expect(slackMessage).toHaveProperty("text");
    expect(slackMessage).toHaveProperty("blocks");
    expect(slackMessage).not.toHaveProperty("attachments"); // Should not have empty attachments

    // Verify the message contains key information
    const messageStr = JSON.stringify(slackMessage);
    expect(messageStr).toContain("Test Project");
    expect(messageStr).toContain("production");
    expect(messageStr).toContain("main");
    expect(messageStr).toContain("fixture"); // Commit is truncated to 7 chars in Slack message
    expect(messageStr).toContain(result.testRun?.total.toString());
    expect(messageStr).toContain(result.testRun?.failed.toString());

    // Verify blocks structure
    const blocks = (slackMessage as any).blocks;
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);

    // Verify header block
    const headerBlock = blocks.find((b: any) => b.type === "header");
    expect(headerBlock).toBeDefined();
    expect(headerBlock.text.text).toContain("Test Run Failed");

    // Verify action buttons
    const actionsBlock = blocks.find((b: any) => b.type === "actions");
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock.elements).toHaveLength(1);
    expect(actionsBlock.elements[0].url).toContain("/runs/run-123");

    // Log details about what was processed
    console.log(`Processed ${result.testRun?.total} tests from fixture`);
    console.log(
      `Passed: ${result.testRun?.passed}, Failed: ${result.testRun?.failed}`,
    );
    console.log(`Pass rate: ${expectedPassRate.toFixed(1)}%`);
    console.log(
      `\nWebhook event payload:`,
      JSON.stringify(eventPayload, null, 2),
    );
    console.log(`\nSlack message:`, JSON.stringify(slackMessage, null, 2));
  });

  it("should process large playwright-report-preview--pr-and-merge-group-8890.zip fixture", async () => {
    // Clear any previous calls
    vi.clearAllMocks();

    // Load the large fixture file
    const fixturePath = path.join(
      __dirname,
      "../fixtures/playwright-report-preview--pr-and-merge-group-8890.zip",
    );

    // Check if file exists
    try {
      await fs.access(fixturePath);
    } catch (error) {
      console.warn(
        "playwright-report-preview--pr-and-merge-group-8890.zip not found, skipping test",
      );
      return;
    }

    console.log(`Loading large fixture from: ${fixturePath}`);
    const zipBuffer = await fs.readFile(fixturePath);
    console.log(
      `Loaded ZIP buffer: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`,
    );

    const zip = await JSZip.loadAsync(new Uint8Array(zipBuffer));

    // Log ZIP contents to understand structure
    const fileNames = Object.keys(zip.files).slice(0, 10); // First 10 files
    console.log(`ZIP contains ${Object.keys(zip.files).length} files`);
    console.log(`Sample files:`, fileNames);

    const params = {
      environment: "production",
      trigger: "ci",
      suite: "suite-123",
      branch: "pr-8890",
      commit: "pr-and-merge-group-test",
    };

    const result = await processUpload(
      zip,
      params,
      "project-456",
      "playwright-report-preview--pr-and-merge-group-8890.zip",
      "[Large Fixture Test]",
    );

    // Verify the result
    console.log("\n=== Upload Result ===");
    console.log(`Success: ${result.success}`);
    console.log(`Test Run ID: ${result.testRunId}`);
    console.log(`Total Tests: ${result.testRun?.total}`);
    console.log(`Passed: ${result.testRun?.passed}`);
    console.log(`Failed: ${result.testRun?.failed}`);
    console.log(`Flaky: ${result.testRun?.flaky}`);
    console.log(`Duration: ${result.testRun?.duration}`);
    console.log(`Message: ${result.message}`);

    // Basic assertions
    expect(result.success).toBe(true);
    expect(result.testRunId).toBe("run-123");
    expect(result.testRun).toBeDefined();
    expect(result.testRun?.total).toBeGreaterThan(0);
    expect(result.message).toContain("Successfully uploaded");

    // Verify stats add up
    const statsTotal =
      (result.testRun?.passed || 0) +
      (result.testRun?.failed || 0) +
      (result.testRun?.skipped || 0);
    expect(statsTotal).toBe(result.testRun?.total);

    // Performance metrics
    console.log("\n=== Performance Info ===");
    console.log(`File size: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Number of files in ZIP: ${Object.keys(zip.files).length}`);
  }, 30000); // 30 second timeout for large file
});
