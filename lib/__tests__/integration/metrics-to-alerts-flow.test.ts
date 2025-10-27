/**
 * Integration test for the complete metrics → alerts → webhooks flow
 *
 * Tests the full pipeline:
 * 1. aggregateFlakinessMetrics() - calculates and stores metrics
 * 2. detectAndNotifyAlerts() - reads metrics and triggers webhooks
 */

vi.mock("@/lib/webhooks/webhook-service", () => ({
  triggerFlakinessWebhooks: vi.fn(),
  triggerPerformanceWebhooks: vi.fn(),
  triggerRunFailureWebhooks: vi.fn(),
}));

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  aggregateFlakinessMetrics,
  aggregatePerformanceMetrics,
} from "@/lib/metrics/flakiness-aggregation";
import { MetricsRepository } from "@/lib/repositories";
import { detectAndNotifyAlerts } from "@/lib/metrics/flakiness-alerts";
import {
  triggerFlakinessWebhooks,
  triggerPerformanceWebhooks,
} from "@/lib/webhooks/webhook-service";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://test.supabase.co";
const SUPABASE_ANON_KEY = "test-anon-key";

const server = setupServer();

// Store metrics in memory to simulate database persistence
let storedFlakinessMetrics: any[] = [];
let storedPerformanceMetrics: any[] = [];
let storedFlakinessAlerts: any[] = [];
let storedPerformanceAlerts: any[] = [];

describe("Metrics to Alerts Flow Integration", () => {
  beforeAll(() => {
    process.env.SUPABASE_URL = SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
    server.listen({ onUnhandledRequest: "bypass" });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
    vi.clearAllMocks();
    // Clear stored data
    storedFlakinessMetrics = [];
    storedPerformanceMetrics = [];
    storedFlakinessAlerts = [];
    storedPerformanceAlerts = [];
  });

  it("should aggregate metrics and then detect alerts from those metrics", async () => {
    const testDate = "2025-01-15";

    server.use(
      // Step 1: Fetch test data for aggregation
      http.get(`${SUPABASE_URL}/rest/v1/tests`, ({ request }) => {
        const url = new URL(request.url);
        const select = url.searchParams.get("select");

        // Return flaky test data - flake rate is based on status="flaky"
        if (select?.includes("status")) {
          return HttpResponse.json(
            [
              {
                suite_test_id: "flaky-test-1",
                status: "flaky",
                duration: 1000,
                test_runs: { timestamp: `${testDate}T10:00:00Z` },
              },
              {
                suite_test_id: "flaky-test-1",
                status: "flaky",
                duration: 1100,
                test_runs: { timestamp: `${testDate}T11:00:00Z` },
              },
              {
                suite_test_id: "flaky-test-1",
                status: "passed",
                duration: 900,
                test_runs: { timestamp: `${testDate}T12:00:00Z` },
              },
              {
                suite_test_id: "flaky-test-1",
                status: "passed",
                duration: 950,
                test_runs: { timestamp: `${testDate}T13:00:00Z` },
              },
              {
                suite_test_id: "flaky-test-1",
                status: "passed",
                duration: 980,
                test_runs: { timestamp: `${testDate}T14:00:00Z` },
              },
              // 40% flake rate (2 flaky out of 5 total runs)
            ],
            {
              headers: {
                "Content-Type": "application/json",
                "Content-Range": "0-4/5",
              },
            },
          );
        }

        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),

      // Step 2: Store aggregated flakiness metrics (upsert to test_flakiness_metrics)
      http.post(
        `${SUPABASE_URL}/rest/v1/test_flakiness_metrics`,
        async ({ request }) => {
          const body = (await request.json()) as any;
          const metrics = Array.isArray(body) ? body : [body];
          storedFlakinessMetrics.push(...metrics);
          console.log(
            `[Test] Stored ${metrics.length} flakiness metrics:`,
            metrics,
          );
          return HttpResponse.json(metrics);
        },
      ),

      // Step 3: Fetch the stored metrics for alert detection
      http.get(`${SUPABASE_URL}/rest/v1/test_flakiness_metrics`, () => {
        console.log(`[Test] Fetching stored metrics:`, storedFlakinessMetrics);
        return HttpResponse.json(storedFlakinessMetrics, {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": `0-${storedFlakinessMetrics.length - 1}/${storedFlakinessMetrics.length}`,
          },
        });
      }),

      // Step 4: Check for existing alerts (none initially)
      http.get(`${SUPABASE_URL}/rest/v1/flakiness_alerts`, ({ request }) => {
        const url = new URL(request.url);
        const select = url.searchParams.get("select");

        // If fetching with full details for webhooks
        if (select?.includes("suite_tests")) {
          return HttpResponse.json(
            storedFlakinessAlerts.map((alert) => ({
              ...alert,
              suite_tests: {
                id: alert.suite_test_id,
                test_name: "Flaky Login Test",
                file_path: "tests/login.spec.ts",
                projects: {
                  id: "project-1",
                  name: "Test Project",
                  organization_id: "org-1",
                },
              },
            })),
            {
              headers: {
                "Content-Type": "application/json",
                "Content-Range": `0-${storedFlakinessAlerts.length - 1}/${storedFlakinessAlerts.length}`,
              },
            },
          );
        }

        // Simple check for existing alerts
        return HttpResponse.json(storedFlakinessAlerts, {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": `0-${storedFlakinessAlerts.length - 1}/${storedFlakinessAlerts.length}`,
          },
        });
      }),

      // Step 5: Store new alerts
      http.post(
        `${SUPABASE_URL}/rest/v1/flakiness_alerts`,
        async ({ request }) => {
          const body = (await request.json()) as any;
          const alerts = Array.isArray(body) ? body : [body];
          storedFlakinessAlerts.push(...alerts);
          console.log(
            `[Test] Stored ${alerts.length} flakiness alerts:`,
            alerts,
          );
          return HttpResponse.json(alerts);
        },
      ),

      // Performance metrics (empty for this test)
      http.post(`${SUPABASE_URL}/rest/v1/performance_metrics`, async () => {
        return HttpResponse.json([]);
      }),
      http.get(`${SUPABASE_URL}/rest/v1/test_performance_metrics`, () => {
        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),
      http.post(`${SUPABASE_URL}/rest/v1/performance_alerts`, async () => {
        return HttpResponse.json([]);
      }),
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const metricsRepo = new MetricsRepository(supabase);

    // STEP 1: Aggregate metrics
    console.log("\n=== STEP 1: Aggregating Flakiness Metrics ===");
    const metricsCount = await aggregateFlakinessMetrics(metricsRepo, testDate);

    expect(metricsCount).toBeGreaterThan(0);
    expect(storedFlakinessMetrics.length).toBeGreaterThan(0);
    expect(storedFlakinessMetrics[0]).toHaveProperty("flake_rate");
    expect(storedFlakinessMetrics[0].flake_rate).toBeGreaterThan(20); // Should exceed threshold

    console.log(
      `Aggregated ${metricsCount} metrics with flake rate: ${storedFlakinessMetrics[0].flake_rate}%`,
    );

    // STEP 2: Detect alerts and trigger webhooks
    console.log("\n=== STEP 2: Detecting Alerts from Metrics ===");
    const alertResult = await detectAndNotifyAlerts(metricsRepo, testDate);

    expect(alertResult.alertsTriggered).toBeGreaterThan(0);
    expect(storedFlakinessAlerts.length).toBeGreaterThan(0);

    console.log(`Detected ${alertResult.alertsTriggered} alerts`);
    console.log(`Triggered ${alertResult.webhooksTriggered} webhooks`);

    // STEP 3: Verify webhooks were triggered
    expect(triggerFlakinessWebhooks).toHaveBeenCalledTimes(1);
    expect(triggerFlakinessWebhooks).toHaveBeenCalledWith(
      expect.objectContaining({
        testName: "Flaky Login Test",
        flakyRate: expect.any(Number),
        threshold: 20,
      }),
      "project-1",
      "org-1",
    );

    console.log("\n=== Flow Complete ===");
    console.log("✅ Metrics aggregated");
    console.log("✅ Alerts detected from metrics");
    console.log("✅ Webhooks triggered");
  });

  it("should not create duplicate alerts on subsequent runs", async () => {
    const testDate = "2025-01-15";

    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/tests`, ({ request }) => {
        const url = new URL(request.url);
        const select = url.searchParams.get("select");

        if (select?.includes("status")) {
          return HttpResponse.json(
            [
              {
                suite_test_id: "flaky-test-1",
                status: "flaky",
                duration: 1000,
                test_runs: { timestamp: `${testDate}T10:00:00Z` },
              },
              {
                suite_test_id: "flaky-test-1",
                status: "flaky",
                duration: 1100,
                test_runs: { timestamp: `${testDate}T11:00:00Z` },
              },
              {
                suite_test_id: "flaky-test-1",
                status: "passed",
                duration: 900,
                test_runs: { timestamp: `${testDate}T12:00:00Z` },
              },
              {
                suite_test_id: "flaky-test-1",
                status: "passed",
                duration: 950,
                test_runs: { timestamp: `${testDate}T13:00:00Z` },
              },
            ],
            {
              headers: {
                "Content-Type": "application/json",
                "Content-Range": "0-3/4",
              },
            },
          );
        }

        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),

      http.post(
        `${SUPABASE_URL}/rest/v1/test_flakiness_metrics`,
        async ({ request }) => {
          const body = (await request.json()) as any;
          const metrics = Array.isArray(body) ? body : [body];
          storedFlakinessMetrics.push(...metrics);
          return HttpResponse.json(metrics);
        },
      ),

      http.get(`${SUPABASE_URL}/rest/v1/test_flakiness_metrics`, () => {
        return HttpResponse.json(storedFlakinessMetrics, {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": `0-${storedFlakinessMetrics.length - 1}/${storedFlakinessMetrics.length}`,
          },
        });
      }),

      http.get(`${SUPABASE_URL}/rest/v1/flakiness_alerts`, ({ request }) => {
        const url = new URL(request.url);
        const select = url.searchParams.get("select");

        if (select?.includes("suite_tests")) {
          return HttpResponse.json(storedFlakinessAlerts, {
            headers: {
              "Content-Type": "application/json",
              "Content-Range": `0-${storedFlakinessAlerts.length - 1}/${storedFlakinessAlerts.length}`,
            },
          });
        }

        return HttpResponse.json(storedFlakinessAlerts, {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": `0-${storedFlakinessAlerts.length - 1}/${storedFlakinessAlerts.length}`,
          },
        });
      }),

      http.post(
        `${SUPABASE_URL}/rest/v1/flakiness_alerts`,
        async ({ request }) => {
          const body = (await request.json()) as any;
          const alerts = Array.isArray(body) ? body : [body];
          storedFlakinessAlerts.push(...alerts);
          return HttpResponse.json(alerts);
        },
      ),

      http.post(`${SUPABASE_URL}/rest/v1/performance_metrics`, async () => {
        return HttpResponse.json([]);
      }),
      http.get(`${SUPABASE_URL}/rest/v1/test_performance_metrics`, () => {
        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),
      http.post(`${SUPABASE_URL}/rest/v1/performance_alerts`, async () => {
        return HttpResponse.json([]);
      }),
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const metricsRepo = new MetricsRepository(supabase);

    // First run - should create alert
    await aggregateFlakinessMetrics(metricsRepo, testDate);
    const firstResult = await detectAndNotifyAlerts(metricsRepo, testDate);

    expect(firstResult.alertsTriggered).toBe(1);
    expect(storedFlakinessAlerts.length).toBe(1);

    // Second run - should NOT create duplicate alert
    await aggregateFlakinessMetrics(metricsRepo, testDate);
    const secondResult = await detectAndNotifyAlerts(metricsRepo, testDate);

    expect(secondResult.alertsTriggered).toBe(0); // No new alerts
    expect(storedFlakinessAlerts.length).toBe(1); // Still only 1 alert

    console.log("✅ Duplicate alert prevention working");
  });

  it("should aggregate performance metrics and detect performance alerts", async () => {
    // Setup test date (yesterday to ensure baseline query works)
    const testDate = new Date();
    testDate.setDate(testDate.getDate() - 1);
    const testDateStr = testDate.toISOString().split("T")[0];

    server.use(
      // Mock test data with slow durations
      http.get(`${SUPABASE_URL}/rest/v1/tests`, ({ request }) => {
        const url = new URL(request.url);
        const select = url.searchParams.get("select");

        if (select?.includes("duration")) {
          return HttpResponse.json(
            [
              {
                suite_test_id: "slow-test-1",
                duration: 10000,
                status: "passed",
                test_runs: { timestamp: `${testDateStr}T10:00:00Z` },
              },
              {
                suite_test_id: "slow-test-1",
                duration: 10500,
                status: "passed",
                test_runs: { timestamp: `${testDateStr}T11:00:00Z` },
              },
              {
                suite_test_id: "slow-test-1",
                duration: 9500,
                status: "passed",
                test_runs: { timestamp: `${testDateStr}T12:00:00Z` },
              },
            ],
            {
              headers: {
                "Content-Type": "application/json",
                "Content-Range": "0-2/3",
              },
            },
          );
        }

        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),

      // Store performance metrics
      http.post(
        `${SUPABASE_URL}/rest/v1/test_performance_metrics`,
        async ({ request }) => {
          const body = (await request.json()) as any;
          const metrics = Array.isArray(body) ? body : [body];
          storedPerformanceMetrics.push(...metrics);
          return HttpResponse.json(metrics);
        },
      ),

      // Fetch performance metrics (baseline vs current)
      http.get(
        `${SUPABASE_URL}/rest/v1/test_performance_metrics`,
        ({ request }) => {
          const url = new URL(request.url);
          const dateParams = url.searchParams.getAll("date");
          const isBaselineQuery =
            dateParams.some((v) => v.startsWith("gte.")) &&
            dateParams.some((v) => v.startsWith("lt."));

          if (isBaselineQuery) {
            // Return 7-day baseline history
            return HttpResponse.json(
              [
                {
                  suite_test_id: "slow-test-1",
                  avg_duration: 2000,
                  date: "2025-01-08",
                },
                {
                  suite_test_id: "slow-test-1",
                  avg_duration: 2100,
                  date: "2025-01-09",
                },
                {
                  suite_test_id: "slow-test-1",
                  avg_duration: 1900,
                  date: "2025-01-10",
                },
              ],
              {
                headers: {
                  "Content-Type": "application/json",
                  "Content-Range": "0-2/3",
                },
              },
            );
          }

          // Return today's metrics
          return HttpResponse.json(storedPerformanceMetrics, {
            headers: {
              "Content-Type": "application/json",
              "Content-Range": `0-${storedPerformanceMetrics.length - 1}/${storedPerformanceMetrics.length}`,
            },
          });
        },
      ),

      // Store performance alerts
      http.post(
        `${SUPABASE_URL}/rest/v1/performance_alerts`,
        async ({ request }) => {
          const body = (await request.json()) as any;
          const alerts = Array.isArray(body) ? body : [body];
          storedPerformanceAlerts.push(...alerts);
          return HttpResponse.json(alerts);
        },
      ),

      // Fetch alerts with test details
      http.get(`${SUPABASE_URL}/rest/v1/performance_alerts`, ({ request }) => {
        const url = new URL(request.url);
        const select = url.searchParams.get("select");

        if (select?.includes("suite_tests")) {
          return HttpResponse.json(
            storedPerformanceAlerts.map((alert) => ({
              ...alert,
              suite_tests: {
                id: alert.suite_test_id,
                test_name: "Slow Performance Test",
                file_path: "tests/performance.spec.ts",
                projects: {
                  id: "project-1",
                  name: "Test Project",
                  organization_id: "org-1",
                },
              },
            })),
            {
              headers: {
                "Content-Type": "application/json",
                "Content-Range": `0-${storedPerformanceAlerts.length - 1}/${storedPerformanceAlerts.length}`,
              },
            },
          );
        }

        return HttpResponse.json(storedPerformanceAlerts, {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": `0-${storedPerformanceAlerts.length - 1}/${storedPerformanceAlerts.length}`,
          },
        });
      }),

      // Mock empty flakiness data
      http.post(`${SUPABASE_URL}/rest/v1/test_flakiness_metrics`, async () => {
        return HttpResponse.json([]);
      }),
      http.get(`${SUPABASE_URL}/rest/v1/test_flakiness_metrics`, () => {
        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),
      http.get(`${SUPABASE_URL}/rest/v1/flakiness_alerts`, () => {
        return HttpResponse.json([], {
          headers: {
            "Content-Type": "application/json",
            "Content-Range": "0-0/0",
          },
        });
      }),
    );

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const metricsRepo = new MetricsRepository(supabase);

    // Step 1: Aggregate performance metrics
    const metricsCount = await aggregatePerformanceMetrics(
      metricsRepo,
      testDateStr,
    );

    expect(metricsCount).toBeGreaterThan(0);
    expect(storedPerformanceMetrics).toHaveLength(metricsCount);
    expect(storedPerformanceMetrics[0]).toMatchObject({
      suite_test_id: "slow-test-1",
      avg_duration: expect.any(Number),
      date: testDateStr,
    });
    expect(storedPerformanceMetrics[0].avg_duration).toBeGreaterThan(9000);

    // Step 2: Detect performance alerts
    const alertResult = await detectAndNotifyAlerts(metricsRepo, testDateStr);

    expect(alertResult.alertsTriggered).toBeGreaterThan(0);
    expect(storedPerformanceAlerts).toHaveLength(alertResult.alertsTriggered);

    // Step 3: Verify webhook notifications
    expect(triggerPerformanceWebhooks).toHaveBeenCalledTimes(1);
    expect(triggerPerformanceWebhooks).toHaveBeenCalledWith(
      expect.objectContaining({
        testName: "Slow Performance Test",
        currentDuration: expect.any(Number),
        baselineDuration: expect.any(Number),
        deviationPercent: expect.any(Number),
      }),
      "project-1",
      "org-1",
    );
  });
});
