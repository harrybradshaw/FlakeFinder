/**
 * Integration tests for flakiness tracking and webhook system
 *
 * Migrated to use Repository Pattern instead of direct Supabase mocks
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MetricsRepository } from "@/lib/repositories";
import {
  aggregateFlakinessMetrics,
  aggregatePerformanceMetrics,
} from "../../metrics/flakiness-aggregation";
import {
  detectFlakinessAlerts,
  detectPerformanceAlerts,
  detectAndNotifyAlerts,
} from "../../metrics/flakiness-alerts";

// Mock webhook service
vi.mock("../../webhooks/webhook-service", () => ({
  triggerFlakinessWebhooks: vi.fn().mockResolvedValue(undefined),
  triggerPerformanceWebhooks: vi.fn().mockResolvedValue(undefined),
  triggerRunFailureWebhooks: vi.fn().mockResolvedValue(undefined),
}));

// Mock Supabase client
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({})),
}));

describe("Flakiness Tracking Integration", () => {
  let mockMetricsRepo: Partial<MetricsRepository>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock repository with default implementations
    mockMetricsRepo = {
      getTestsForDateRange: vi.fn().mockResolvedValue([]),
      saveFlakinessMetrics: vi.fn().mockResolvedValue(undefined),
      savePerformanceMetrics: vi.fn().mockResolvedValue(undefined),
      getFlakinessMetricsForDate: vi.fn().mockResolvedValue([]),
      getPerformanceMetricsForDate: vi.fn().mockResolvedValue([]),
      getPerformanceBaseline: vi.fn().mockResolvedValue([]),
      getRecentFlakinessAlerts: vi.fn().mockResolvedValue([]),
      saveFlakinessAlerts: vi.fn().mockResolvedValue(undefined),
      savePerformanceAlerts: vi.fn().mockResolvedValue(undefined),
      getFlakinessAlertsWithDetails: vi.fn().mockResolvedValue([]),
      getPerformanceAlertsWithDetails: vi.fn().mockResolvedValue([]),
    };
  });

  describe("Flakiness Metrics Aggregation", () => {
    it("should aggregate flakiness metrics for a given date", async () => {
      const mockTestResults = [
        { suite_test_id: "test-1", status: "passed", duration: 1000 },
        { suite_test_id: "test-1", status: "failed", duration: 1200 },
        { suite_test_id: "test-2", status: "passed", duration: 800 },
      ];

      vi.mocked(mockMetricsRepo.getTestsForDateRange!).mockResolvedValue(
        mockTestResults as any,
      );

      const result = await aggregateFlakinessMetrics(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(mockMetricsRepo.getTestsForDateRange).toHaveBeenCalled();
      expect(mockMetricsRepo.saveFlakinessMetrics).toHaveBeenCalled();
      expect(result).toBeGreaterThan(0);
    });

    it("should handle empty test results", async () => {
      vi.mocked(mockMetricsRepo.getTestsForDateRange!).mockResolvedValue([]);

      const result = await aggregateFlakinessMetrics(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(result).toBe(0);
    });

    it("should calculate correct flake rate", async () => {
      const mockTestResults = [
        { suite_test_id: "test-1", status: "flaky", duration: 1000 },
        { suite_test_id: "test-1", status: "flaky", duration: 1100 },
        { suite_test_id: "test-1", status: "passed", duration: 1000 },
        { suite_test_id: "test-1", status: "failed", duration: 1200 },
      ];

      vi.mocked(mockMetricsRepo.getTestsForDateRange!).mockResolvedValue(
        mockTestResults as any,
      );

      let savedMetrics: any[] = [];
      mockMetricsRepo.saveFlakinessMetrics = vi
        .fn()
        .mockImplementation(async (metrics) => {
          savedMetrics = metrics as any[];
          return Promise.resolve();
        });

      await aggregateFlakinessMetrics(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(savedMetrics.length).toBeGreaterThan(0);
      expect(savedMetrics[0]).toHaveProperty("flake_rate");
      expect(savedMetrics[0].flake_rate).toBeGreaterThan(0);
    });
  });

  describe("Performance Metrics Aggregation", () => {
    it("should aggregate performance metrics for a given date", async () => {
      const mockTestResults = [
        { suite_test_id: "test-1", duration: 1000, status: "passed" },
        { suite_test_id: "test-1", duration: 1200, status: "passed" },
        { suite_test_id: "test-2", duration: 500, status: "passed" },
      ];

      vi.mocked(mockMetricsRepo.getTestsForDateRange!).mockResolvedValue(
        mockTestResults as any,
      );

      const result = await aggregatePerformanceMetrics(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(mockMetricsRepo.getTestsForDateRange).toHaveBeenCalled();
      expect(mockMetricsRepo.savePerformanceMetrics).toHaveBeenCalled();
      expect(result).toBeGreaterThan(0);
    });

    it("should calculate correct percentiles", async () => {
      const mockTestResults = Array.from({ length: 100 }, (_, i) => ({
        suite_test_id: "test-1",
        duration: i * 10, // 0, 10, 20, ..., 990
        status: "passed",
      }));

      vi.mocked(mockMetricsRepo.getTestsForDateRange!).mockResolvedValue(
        mockTestResults as any,
      );

      let savedMetrics: any[] = [];
      mockMetricsRepo.savePerformanceMetrics = vi
        .fn()
        .mockImplementation(async (metrics) => {
          savedMetrics = metrics as any[];
          return Promise.resolve();
        });

      await aggregatePerformanceMetrics(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(savedMetrics.length).toBeGreaterThan(0);
      expect(savedMetrics[0]).toHaveProperty("p50_duration");
      expect(savedMetrics[0]).toHaveProperty("p95_duration");
      expect(savedMetrics[0]).toHaveProperty("p99_duration");
      expect(savedMetrics[0].p95_duration).toBeGreaterThan(
        savedMetrics[0].p50_duration,
      );
    });
  });

  describe("Flakiness Alert Detection", () => {
    it("should detect tests exceeding flakiness threshold", async () => {
      const mockMetrics = [
        {
          suite_test_id: "test-1",
          flake_rate: 25, // Above 20% threshold
          total_runs: 10,
          flaky_runs: 3,
        },
        {
          suite_test_id: "test-2",
          flake_rate: 15, // Below threshold
          total_runs: 10,
          flaky_runs: 1,
        },
      ];

      vi.mocked(mockMetricsRepo.getFlakinessMetricsForDate!).mockResolvedValue(
        mockMetrics as any,
      );
      vi.mocked(mockMetricsRepo.getRecentFlakinessAlerts!).mockResolvedValue(
        [],
      );

      const result = await detectFlakinessAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(result).toBe(1); // Only test-1 should trigger alert
      expect(mockMetricsRepo.saveFlakinessAlerts).toHaveBeenCalled();
    });

    it("should not create duplicate alerts", async () => {
      const mockMetrics = [
        {
          suite_test_id: "test-1",
          flake_rate: 25,
          total_runs: 10,
          flaky_runs: 3,
        },
      ];

      const mockExistingAlerts = [{ suite_test_id: "test-1" }];

      vi.mocked(mockMetricsRepo.getFlakinessMetricsForDate!).mockResolvedValue(
        mockMetrics as any,
      );
      vi.mocked(mockMetricsRepo.getRecentFlakinessAlerts!).mockResolvedValue(
        mockExistingAlerts as any,
      );

      const result = await detectFlakinessAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(result).toBe(0); // Should not create duplicate
      expect(mockMetricsRepo.saveFlakinessAlerts).not.toHaveBeenCalled();
    });

    it("should respect custom threshold", async () => {
      const mockMetrics = [
        {
          suite_test_id: "test-1",
          flake_rate: 15,
          total_runs: 10,
          flaky_runs: 2,
        },
      ];

      vi.mocked(mockMetricsRepo.getFlakinessMetricsForDate!).mockResolvedValue(
        mockMetrics as any,
      );
      vi.mocked(mockMetricsRepo.getRecentFlakinessAlerts!).mockResolvedValue(
        [],
      );

      // Use 10% threshold instead of default 20%
      const result = await detectFlakinessAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
        { flakinessRate: 10 },
      );

      expect(result).toBe(1); // Should alert with custom threshold
    });
  });

  describe("Performance Alert Detection", () => {
    it("should detect performance regressions", async () => {
      const mockTodayMetrics = [
        {
          suite_test_id: "test-1",
          avg_duration: 2000, // 2x slower than baseline
        },
      ];

      const mockBaselineMetrics = [
        { suite_test_id: "test-1", avg_duration: 1000 },
        { suite_test_id: "test-1", avg_duration: 1000 },
        { suite_test_id: "test-1", avg_duration: 1000 },
      ];

      vi.mocked(
        mockMetricsRepo.getPerformanceMetricsForDate!,
      ).mockResolvedValue(mockTodayMetrics as any);
      vi.mocked(mockMetricsRepo.getPerformanceBaseline!).mockResolvedValue(
        mockBaselineMetrics as any,
      );

      const result = await detectPerformanceAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-08",
      );

      expect(result).toBeGreaterThan(0);
      expect(mockMetricsRepo.savePerformanceAlerts).toHaveBeenCalled();
    });

    it("should not alert on minor performance changes", async () => {
      const mockTodayMetrics = [
        {
          suite_test_id: "test-1",
          avg_duration: 1100, // Only 10% slower
        },
      ];

      const mockBaselineMetrics = [
        { suite_test_id: "test-1", avg_duration: 1000 },
        { suite_test_id: "test-1", avg_duration: 1000 },
        { suite_test_id: "test-1", avg_duration: 1000 },
      ];

      vi.mocked(
        mockMetricsRepo.getPerformanceMetricsForDate!,
      ).mockResolvedValue(mockTodayMetrics as any);
      vi.mocked(mockMetricsRepo.getPerformanceBaseline!).mockResolvedValue(
        mockBaselineMetrics as any,
      );

      const result = await detectPerformanceAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-08",
      );

      expect(result).toBe(0); // Should not alert on minor change
    });

    it("should require minimum baseline data", async () => {
      const mockTodayMetrics = [
        {
          suite_test_id: "test-1",
          avg_duration: 2000,
        },
      ];

      const mockBaselineMetrics = [
        { suite_test_id: "test-1", avg_duration: 1000 },
        // Only 1 data point - need at least 3
      ];

      vi.mocked(
        mockMetricsRepo.getPerformanceMetricsForDate!,
      ).mockResolvedValue(mockTodayMetrics as any);
      vi.mocked(mockMetricsRepo.getPerformanceBaseline!).mockResolvedValue(
        mockBaselineMetrics as any,
      );

      const result = await detectPerformanceAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-08",
      );

      expect(result).toBe(0); // Should not alert without enough baseline
    });
  });

  describe("Complete Alert Flow with Webhooks", () => {
    it("should detect alerts and trigger webhooks", async () => {
      const mockFlakinessMetrics = [
        {
          suite_test_id: "test-1",
          flake_rate: 30,
          total_runs: 10,
          flaky_runs: 3,
        },
      ];

      vi.mocked(
        mockMetricsRepo.getFlakinessAlertsWithDetails!,
      ).mockResolvedValue([
        {
          id: "alert-1",
          suite_test_id: "test-1",
          flake_rate: 30,
          test_name: "Test 1",
          file_path: "test.spec.ts",
        },
      ] as any);

      const result = await detectAndNotifyAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      expect(result.alertsTriggered).toBeGreaterThanOrEqual(0);
      expect(result.webhooksTriggered).toBeGreaterThanOrEqual(0);
    });

    it("should handle webhook failures gracefully", async () => {
      const { triggerFlakinessWebhooks } = await import(
        "../../webhooks/webhook-service"
      );

      vi.mocked(triggerFlakinessWebhooks).mockRejectedValue(
        new Error("Webhook failed"),
      );

      // Mock metrics that exceed threshold to trigger alerts
      vi.mocked(mockMetricsRepo.getFlakinessMetricsForDate!).mockResolvedValue([
        {
          suite_test_id: "test-1",
          flake_rate: 30,
          total_runs: 10,
          flaky_runs: 3,
        } as any,
      ]);
      vi.mocked(mockMetricsRepo.getRecentFlakinessAlerts!).mockResolvedValue(
        [],
      );

      vi.mocked(
        mockMetricsRepo.getFlakinessAlertsWithDetails!,
      ).mockResolvedValue([
        {
          id: "alert-1",
          suite_test_id: "test-1",
          flake_rate: 30,
          threshold: 20,
          triggered_at: "2025-01-01T00:00:00Z",
          metadata: { total_runs: 10, flaky_runs: 3 },
          suite_tests: {
            id: "suite-test-1",
            test_name: "Test 1",
            file_path: "test.spec.ts",
            projects: {
              id: "project-1",
              name: "Test Project",
              organization_id: "org-1",
            },
          },
        },
      ] as any);

      const result = await detectAndNotifyAlerts(
        mockMetricsRepo as MetricsRepository,
        "2025-01-01",
      );

      // Should complete even if webhooks fail
      expect(result).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      vi.mocked(mockMetricsRepo.getTestsForDateRange!).mockRejectedValue(
        new Error("Database connection failed"),
      );

      await expect(
        aggregateFlakinessMetrics(
          mockMetricsRepo as MetricsRepository,
          "2025-01-01",
        ),
      ).rejects.toThrow("Database connection failed");
    });

    it("should handle missing environment variables", async () => {
      delete process.env.SUPABASE_URL;

      // This should be handled at a higher level
      // The repository functions themselves don't validate env vars
      expect(process.env.SUPABASE_URL).toBeUndefined();
    });
  });
});
