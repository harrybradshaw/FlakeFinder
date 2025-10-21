import { describe, it, expect } from "vitest";
import {
  calculateHealth,
  transformTestMetrics,
  sortTestsByHealth,
  getMostRecentStatus,
  aggregateTestMetrics,
  type TestMetrics,
  type TestResponse,
} from "./test-aggregation-utils";

describe("test-aggregation-utils", () => {
  describe("calculateHealth", () => {
    it("should return 100 for tests with zero runs", () => {
      const health = calculateHealth({
        totalRuns: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      });
      expect(health).toBe(100);
    });

    it("should return 100 for tests with 100% pass rate", () => {
      const health = calculateHealth({
        totalRuns: 10,
        passed: 10,
        failed: 0,
        flaky: 0,
      });
      expect(health).toBe(100);
    });

    it("should penalize failures more than flakiness", () => {
      const healthWithFailures = calculateHealth({
        totalRuns: 10,
        passed: 5,
        failed: 5,
        flaky: 0,
      });

      const healthWithFlaky = calculateHealth({
        totalRuns: 10,
        passed: 5,
        failed: 0,
        flaky: 5,
      });

      // 50% failures: 100 - (50 * 2) = 0
      expect(healthWithFailures).toBe(0);
      // 50% flaky: 100 - 50 = 50
      expect(healthWithFlaky).toBe(50);
      expect(healthWithFlaky).toBeGreaterThan(healthWithFailures);
    });

    it("should calculate correct health for mixed results", () => {
      const health = calculateHealth({
        totalRuns: 10,
        passed: 7,
        failed: 2,
        flaky: 1,
      });

      // 20% failures, 10% flaky: 100 - (20 * 2) - 10 = 50
      expect(health).toBe(50);
    });

    it("should never return negative health", () => {
      const health = calculateHealth({
        totalRuns: 10,
        passed: 0,
        failed: 10,
        flaky: 0,
      });

      // 100% failures: 100 - (100 * 2) = -100, but clamped to 0
      expect(health).toBe(0);
    });

    it("should handle edge case with all flaky tests", () => {
      const health = calculateHealth({
        totalRuns: 10,
        passed: 0,
        failed: 0,
        flaky: 10,
      });

      // 100% flaky: 100 - 100 = 0
      expect(health).toBe(0);
    });

    it("should calculate health for mostly passing tests with few failures", () => {
      const health = calculateHealth({
        totalRuns: 100,
        passed: 95,
        failed: 3,
        flaky: 2,
      });

      // 3% failures, 2% flaky: 100 - (3 * 2) - 2 = 92
      expect(health).toBe(92);
    });
  });

  describe("transformTestMetrics", () => {
    it("should transform metrics with all fields populated", () => {
      const metrics: TestMetrics = {
        suite_test_id: "test-123",
        name: "should login successfully",
        file: "tests/auth.spec.ts",
        totalRuns: 10,
        passed: 8,
        failed: 1,
        flaky: 1,
        skipped: 0,
        totalDuration: 5000,
        recentStatuses: [
          { status: "passed", started_at: "2025-10-20T10:00:00Z" },
          { status: "failed", started_at: "2025-10-19T10:00:00Z" },
        ],
      };

      const result = transformTestMetrics(metrics);

      expect(result).toEqual({
        suite_test_id: "test-123",
        name: "should login successfully",
        file: "tests/auth.spec.ts",
        totalRuns: 10,
        passRate: "80.0",
        failRate: "10.0",
        flakyRate: "10.0",
        avgDuration: 500,
        recentStatuses: ["passed", "failed"],
        health: 70, // 100 - (10 * 2) - 10 = 70
      });
    });

    it("should handle zero runs correctly", () => {
      const metrics: TestMetrics = {
        suite_test_id: "test-456",
        name: "new test",
        file: "tests/new.spec.ts",
        totalRuns: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
        totalDuration: 0,
        recentStatuses: [],
      };

      const result = transformTestMetrics(metrics);

      expect(result.passRate).toBe("0.0");
      expect(result.failRate).toBe("0.0");
      expect(result.flakyRate).toBe("0.0");
      expect(result.avgDuration).toBe(0);
      expect(result.health).toBe(100);
    });

    it("should round average duration correctly", () => {
      const metrics: TestMetrics = {
        suite_test_id: "test-789",
        name: "test with odd duration",
        file: "tests/timing.spec.ts",
        totalRuns: 3,
        passed: 3,
        failed: 0,
        flaky: 0,
        skipped: 0,
        totalDuration: 1000, // 1000 / 3 = 333.33...
        recentStatuses: [],
      };

      const result = transformTestMetrics(metrics);

      expect(result.avgDuration).toBe(333); // Rounded
    });

    it("should format rates with one decimal place", () => {
      const metrics: TestMetrics = {
        suite_test_id: "test-decimal",
        name: "decimal test",
        file: "tests/decimal.spec.ts",
        totalRuns: 3,
        passed: 2,
        failed: 1,
        flaky: 0,
        skipped: 0,
        totalDuration: 300,
        recentStatuses: [],
      };

      const result = transformTestMetrics(metrics);

      expect(result.passRate).toBe("66.7");
      expect(result.failRate).toBe("33.3");
      expect(result.flakyRate).toBe("0.0");
    });

    it("should extract only status strings from recentStatuses", () => {
      const metrics: TestMetrics = {
        suite_test_id: "test-status",
        name: "status test",
        file: "tests/status.spec.ts",
        totalRuns: 5,
        passed: 3,
        failed: 1,
        flaky: 1,
        skipped: 0,
        totalDuration: 500,
        recentStatuses: [
          { status: "passed", started_at: "2025-10-20T10:00:00Z" },
          { status: "flaky", started_at: "2025-10-19T10:00:00Z" },
          { status: "failed", started_at: "2025-10-18T10:00:00Z" },
          { status: "passed", started_at: "2025-10-17T10:00:00Z" },
          { status: "passed", started_at: "2025-10-16T10:00:00Z" },
        ],
      };

      const result = transformTestMetrics(metrics);

      expect(result.recentStatuses).toEqual([
        "passed",
        "flaky",
        "failed",
        "passed",
        "passed",
      ]);
    });

    it("should sort recentStatuses by timestamp descending (most recent first)", () => {
      const metrics: TestMetrics = {
        suite_test_id: "test-unsorted",
        name: "unsorted test",
        file: "tests/unsorted.spec.ts",
        totalRuns: 4,
        passed: 2,
        failed: 1,
        flaky: 1,
        skipped: 0,
        totalDuration: 400,
        recentStatuses: [
          // Intentionally out of order
          { status: "passed", started_at: "2025-10-18T10:00:00Z" },
          { status: "failed", started_at: "2025-10-20T10:00:00Z" }, // Most recent
          { status: "flaky", started_at: "2025-10-17T10:00:00Z" },
          { status: "passed", started_at: "2025-10-19T10:00:00Z" },
        ],
      };

      const result = transformTestMetrics(metrics);

      // Should be sorted by timestamp descending
      expect(result.recentStatuses).toEqual([
        "failed", // 2025-10-20
        "passed", // 2025-10-19
        "passed", // 2025-10-18
        "flaky",  // 2025-10-17
      ]);
    });

    it("should limit recentStatuses to 10 most recent items", () => {
      const metrics: TestMetrics = {
        suite_test_id: "test-many-runs",
        name: "test with many runs",
        file: "tests/many.spec.ts",
        totalRuns: 15,
        passed: 15,
        failed: 0,
        flaky: 0,
        skipped: 0,
        totalDuration: 1500,
        recentStatuses: [
          { status: "passed", started_at: "2025-10-20T10:00:00Z" },
          { status: "passed", started_at: "2025-10-19T10:00:00Z" },
          { status: "passed", started_at: "2025-10-18T10:00:00Z" },
          { status: "passed", started_at: "2025-10-17T10:00:00Z" },
          { status: "passed", started_at: "2025-10-16T10:00:00Z" },
          { status: "passed", started_at: "2025-10-15T10:00:00Z" },
          { status: "passed", started_at: "2025-10-14T10:00:00Z" },
          { status: "passed", started_at: "2025-10-13T10:00:00Z" },
          { status: "passed", started_at: "2025-10-12T10:00:00Z" },
          { status: "passed", started_at: "2025-10-11T10:00:00Z" },
          { status: "failed", started_at: "2025-10-10T10:00:00Z" }, // 11th item
          { status: "failed", started_at: "2025-10-09T10:00:00Z" }, // 12th item
          { status: "failed", started_at: "2025-10-08T10:00:00Z" }, // 13th item
          { status: "failed", started_at: "2025-10-07T10:00:00Z" }, // 14th item
          { status: "failed", started_at: "2025-10-06T10:00:00Z" }, // 15th item
        ],
      };

      const result = transformTestMetrics(metrics);

      // Should only return the 10 most recent
      expect(result.recentStatuses).toHaveLength(10);
      expect(result.recentStatuses).toEqual([
        "passed", "passed", "passed", "passed", "passed",
        "passed", "passed", "passed", "passed", "passed",
      ]);
      // Should NOT include the older "failed" statuses
      expect(result.recentStatuses).not.toContain("failed");
    });
  });

  describe("sortTestsByHealth", () => {
    it("should sort tests by health ascending (worst first)", () => {
      const tests: TestResponse[] = [
        {
          suite_test_id: "test-1",
          name: "healthy test",
          file: "test1.spec.ts",
          totalRuns: 10,
          passRate: "100.0",
          failRate: "0.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: ["passed"],
          health: 100,
        },
        {
          suite_test_id: "test-2",
          name: "unhealthy test",
          file: "test2.spec.ts",
          totalRuns: 10,
          passRate: "0.0",
          failRate: "100.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: ["failed"],
          health: 0,
        },
        {
          suite_test_id: "test-3",
          name: "medium test",
          file: "test3.spec.ts",
          totalRuns: 10,
          passRate: "50.0",
          failRate: "25.0",
          flakyRate: "25.0",
          avgDuration: 100,
          recentStatuses: ["passed"],
          health: 25,
        },
      ];

      const sorted = sortTestsByHealth(tests);

      expect(sorted[0].health).toBe(0);
      expect(sorted[1].health).toBe(25);
      expect(sorted[2].health).toBe(100);
      expect(sorted[0].suite_test_id).toBe("test-2");
      expect(sorted[2].suite_test_id).toBe("test-1");
    });

    it("should not mutate the original array", () => {
      const tests: TestResponse[] = [
        {
          suite_test_id: "test-1",
          name: "test 1",
          file: "test1.spec.ts",
          totalRuns: 10,
          passRate: "100.0",
          failRate: "0.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: [],
          health: 100,
        },
        {
          suite_test_id: "test-2",
          name: "test 2",
          file: "test2.spec.ts",
          totalRuns: 10,
          passRate: "0.0",
          failRate: "100.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: [],
          health: 0,
        },
      ];

      const originalOrder = tests.map((t) => t.suite_test_id);
      sortTestsByHealth(tests);

      expect(tests.map((t) => t.suite_test_id)).toEqual(originalOrder);
    });

    it("should handle empty array", () => {
      const sorted = sortTestsByHealth([]);
      expect(sorted).toEqual([]);
    });

    it("should handle single test", () => {
      const tests: TestResponse[] = [
        {
          suite_test_id: "test-1",
          name: "single test",
          file: "test1.spec.ts",
          totalRuns: 10,
          passRate: "100.0",
          failRate: "0.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: [],
          health: 100,
        },
      ];

      const sorted = sortTestsByHealth(tests);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].suite_test_id).toBe("test-1");
    });

    it("should maintain stable sort for tests with same health", () => {
      const tests: TestResponse[] = [
        {
          suite_test_id: "test-1",
          name: "test 1",
          file: "test1.spec.ts",
          totalRuns: 10,
          passRate: "100.0",
          failRate: "0.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: [],
          health: 50,
        },
        {
          suite_test_id: "test-2",
          name: "test 2",
          file: "test2.spec.ts",
          totalRuns: 10,
          passRate: "100.0",
          failRate: "0.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: [],
          health: 50,
        },
        {
          suite_test_id: "test-3",
          name: "test 3",
          file: "test3.spec.ts",
          totalRuns: 10,
          passRate: "100.0",
          failRate: "0.0",
          flakyRate: "0.0",
          avgDuration: 100,
          recentStatuses: [],
          health: 50,
        },
      ];

      const sorted = sortTestsByHealth(tests);
      expect(sorted.every((t) => t.health === 50)).toBe(true);
    });
  });

  describe("getMostRecentStatus", () => {
    it("should return the first status when statuses are sorted descending", () => {
      const statuses = [
        { status: "passed", started_at: "2025-10-20T10:00:00Z" },
        { status: "failed", started_at: "2025-10-19T10:00:00Z" },
        { status: "passed", started_at: "2025-10-18T10:00:00Z" },
      ];

      const result = getMostRecentStatus(statuses);
      expect(result).toBe("passed");
    });

    it("should return 'unknown' for empty array", () => {
      const result = getMostRecentStatus([]);
      expect(result).toBe("unknown");
    });

    it("should return the only status for single-item array", () => {
      const statuses = [{ status: "flaky", started_at: "2025-10-20T10:00:00Z" }];

      const result = getMostRecentStatus(statuses);
      expect(result).toBe("flaky");
    });
  });

  describe("aggregateTestMetrics", () => {
    it("should aggregate multiple executions of the same test", () => {
      const tests = [
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "login test",
            file: "auth.spec.ts",
          },
        },
        {
          suite_test_id: "test-1",
          status: "failed",
          duration: 150,
          test_run_id: "run-2",
          started_at: "2025-10-19T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "login test",
            file: "auth.spec.ts",
          },
        },
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 120,
          test_run_id: "run-3",
          started_at: "2025-10-18T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "login test",
            file: "auth.spec.ts",
          },
        },
      ];

      const result = aggregateTestMetrics(tests);

      expect(result.size).toBe(1);
      const metrics = result.get("test-1")!;
      expect(metrics.totalRuns).toBe(3);
      expect(metrics.passed).toBe(2);
      expect(metrics.failed).toBe(1);
      expect(metrics.totalDuration).toBe(370);
      expect(metrics.recentStatuses).toHaveLength(3);
    });

    it("should aggregate multiple different tests", () => {
      const tests = [
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test 1",
            file: "test1.spec.ts",
          },
        },
        {
          suite_test_id: "test-2",
          status: "failed",
          duration: 200,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-2",
            name: "test 2",
            file: "test2.spec.ts",
          },
        },
      ];

      const result = aggregateTestMetrics(tests);

      expect(result.size).toBe(2);
      expect(result.has("test-1")).toBe(true);
      expect(result.has("test-2")).toBe(true);
    });

    it("should handle all status types correctly", () => {
      const tests = [
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
        {
          suite_test_id: "test-1",
          status: "failed",
          duration: 100,
          test_run_id: "run-2",
          started_at: "2025-10-19T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
        {
          suite_test_id: "test-1",
          status: "flaky",
          duration: 100,
          test_run_id: "run-3",
          started_at: "2025-10-18T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
        {
          suite_test_id: "test-1",
          status: "skipped",
          duration: 0,
          test_run_id: "run-4",
          started_at: "2025-10-17T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
      ];

      const result = aggregateTestMetrics(tests);
      const metrics = result.get("test-1")!;

      expect(metrics.passed).toBe(1);
      expect(metrics.failed).toBe(1);
      expect(metrics.flaky).toBe(1);
      expect(metrics.skipped).toBe(1);
      expect(metrics.totalRuns).toBe(4);
    });

    it("should skip tests without suite_test reference", () => {
      const tests = [
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: null,
        },
        {
          suite_test_id: "test-2",
          status: "passed",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-2",
            name: "valid test",
            file: "test.spec.ts",
          },
        },
      ];

      const result = aggregateTestMetrics(tests);

      expect(result.size).toBe(1);
      expect(result.has("test-1")).toBe(false);
      expect(result.has("test-2")).toBe(true);
    });

    it("should handle null duration correctly", () => {
      const tests = [
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: null,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 100,
          test_run_id: "run-2",
          started_at: "2025-10-19T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
      ];

      const result = aggregateTestMetrics(tests);
      const metrics = result.get("test-1")!;

      expect(metrics.totalDuration).toBe(100); // null treated as 0
    });

    it("should preserve recent statuses with timestamps", () => {
      const tests = [
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
        {
          suite_test_id: "test-1",
          status: "failed",
          duration: 100,
          test_run_id: "run-2",
          started_at: "2025-10-19T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
      ];

      const result = aggregateTestMetrics(tests);
      const metrics = result.get("test-1")!;

      expect(metrics.recentStatuses).toEqual([
        { status: "passed", started_at: "2025-10-20T10:00:00Z" },
        { status: "failed", started_at: "2025-10-19T10:00:00Z" },
      ]);
    });

    it("should handle empty input array", () => {
      const result = aggregateTestMetrics([]);
      expect(result.size).toBe(0);
    });

    it("should handle unknown status types gracefully", () => {
      const tests = [
        {
          suite_test_id: "test-1",
          status: "unknown_status",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "test",
            file: "test.spec.ts",
          },
        },
      ];

      const result = aggregateTestMetrics(tests);
      const metrics = result.get("test-1")!;

      // Unknown status shouldn't increment any counter
      expect(metrics.passed).toBe(0);
      expect(metrics.failed).toBe(0);
      expect(metrics.flaky).toBe(0);
      expect(metrics.skipped).toBe(0);
      expect(metrics.totalRuns).toBe(1); // But should still count as a run
    });
  });

  describe("integration: full pipeline", () => {
    it("should correctly process tests through the full pipeline", () => {
      const rawTests = [
        {
          suite_test_id: "test-1",
          status: "passed",
          duration: 100,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-1",
            name: "healthy test",
            file: "test1.spec.ts",
          },
        },
        {
          suite_test_id: "test-2",
          status: "failed",
          duration: 200,
          test_run_id: "run-1",
          started_at: "2025-10-20T10:00:00Z",
          suite_test: {
            id: "test-2",
            name: "failing test",
            file: "test2.spec.ts",
          },
        },
        {
          suite_test_id: "test-2",
          status: "failed",
          duration: 250,
          test_run_id: "run-2",
          started_at: "2025-10-19T10:00:00Z",
          suite_test: {
            id: "test-2",
            name: "failing test",
            file: "test2.spec.ts",
          },
        },
      ];

      // Aggregate
      const metrics = aggregateTestMetrics(rawTests);
      expect(metrics.size).toBe(2);

      // Transform
      const transformed = Array.from(metrics.values()).map(transformTestMetrics);
      expect(transformed).toHaveLength(2);

      // Sort
      const sorted = sortTestsByHealth(transformed);

      // Verify worst test is first
      expect(sorted[0].name).toBe("failing test");
      expect(sorted[0].health).toBe(0); // 100% failures
      expect(sorted[1].name).toBe("healthy test");
      expect(sorted[1].health).toBe(100);
    });
  });
});
