import { describe, it, expect, vi, beforeEach } from "vitest";
import { processUpload } from "./shared-upload-handler";
import type JSZip from "jszip";

// Mock all the dependencies
vi.mock("@/lib/upload/upload-processing", () => ({
  processScreenshots: vi.fn(),
  processTestsFromZip: vi.fn(),
  lookupDatabaseIds: vi.fn(),
  checkDuplicate: vi.fn(),
}));

vi.mock("@/lib/upload/zip-extraction-utils", () => ({
  mapScreenshotPaths: vi.fn(),
}));

vi.mock("@/lib/metrics/flakiness-aggregation", () => ({
  aggregateFlakinessMetrics: vi.fn(),
  aggregatePerformanceMetrics: vi.fn(),
}));

vi.mock("@/lib/metrics/flakiness-alerts", () => ({
  detectAndNotifyAlerts: vi.fn(),
}));

vi.mock("@/lib/webhooks/webhook-service", () => ({
  triggerRunFailureWebhooks: vi.fn(),
}));

vi.mock("@/lib/insert-test-run", () => ({
  insertTestRun: vi.fn(),
}));

vi.mock("@/lib/repositories", () => ({
  createRepositories: vi.fn(),
}));

import {
  processScreenshots,
  processTestsFromZip,
  lookupDatabaseIds,
  checkDuplicate,
} from "@/lib/upload/upload-processing";
import { mapScreenshotPaths } from "@/lib/upload/zip-extraction-utils";
import {
  aggregateFlakinessMetrics,
  aggregatePerformanceMetrics,
} from "@/lib/metrics/flakiness-aggregation";
import { detectAndNotifyAlerts } from "@/lib/metrics/flakiness-alerts";
import { triggerRunFailureWebhooks } from "@/lib/webhooks/webhook-service";
import { insertTestRun } from "@/lib/insert-test-run";
import { createRepositories } from "@/lib/repositories";

describe("shared-upload-handler", () => {
  const mockZip = {} as JSZip;
  const mockParams = {
    environment: "production",
    trigger: "ci",
    suite: "suite-123",
    branch: "main",
    commit: "abc123",
  };
  const mockProjectId = "project-456";
  const mockFilename = "test-report.zip";
  const logPrefix = "[Test]";

  const mockDatabaseIds = {
    projectId: mockProjectId,
    environmentId: "env-1",
    triggerId: "trigger-1",
    suiteId: "suite-1",
  };

  const mockProcessedData = {
    tests: [{ id: "test-1", name: "Test 1", status: "passed" }],
    timestamp: "2024-01-01T00:00:00Z",
    environment: "production",
    branch: "main",
    contentHash: "hash123",
    stats: {
      total: 10,
      passed: 8,
      failed: 2,
      flaky: 0,
      skipped: 0,
    },
    durationFormatted: "5m 30s",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up environment variables
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://test.app";

    // Default mock implementations for repositories
    const mockRepos = {
      lookups: {
        getSuiteById: vi.fn().mockResolvedValue({
          id: mockDatabaseIds.suiteId,
          project_id: mockProjectId,
        }),
        getEnvironmentByName: vi.fn().mockResolvedValue({
          id: mockDatabaseIds.environmentId,
        }),
        getTriggerByName: vi.fn().mockResolvedValue({
          id: mockDatabaseIds.triggerId,
        }),
      },
      testRuns: {
        findDuplicateByContentHash: vi.fn().mockResolvedValue(null),
      },
      projects: {
        getProjectWithOrganization: vi.fn().mockResolvedValue({
          name: "Test Project",
          organization_id: "org-1",
        }),
      },
      metrics: {},
    };

    vi.mocked(createRepositories).mockReturnValue(mockRepos as any);

    vi.mocked(lookupDatabaseIds).mockResolvedValue({
      success: true,
      data: mockDatabaseIds,
    });

    vi.mocked(processTestsFromZip).mockResolvedValue(
      mockProcessedData as unknown as Awaited<
        ReturnType<typeof processTestsFromZip>
      >,
    );

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: { "test.png": "https://example.com/test.png" },
      screenshotCount: 1,
    });

    vi.mocked(checkDuplicate).mockResolvedValue({
      isDuplicate: false,
    });

    vi.mocked(insertTestRun).mockResolvedValue({
      success: true,
      testRunId: "run-123",
    });

    vi.mocked(aggregateFlakinessMetrics).mockResolvedValue(undefined as never);
    vi.mocked(aggregatePerformanceMetrics).mockResolvedValue(
      undefined as never,
    );
    vi.mocked(detectAndNotifyAlerts).mockResolvedValue({
      alertsTriggered: 0,
      webhooksTriggered: 0,
      errors: [],
    });
  });

  describe("processUpload", () => {
    it("should successfully process a complete upload", async () => {
      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(true);
      expect(result.testRunId).toBe("run-123");
      expect(result.testRun).toBeDefined();
      expect(result.message).toContain("Successfully uploaded");

      // Verify all steps were called
      expect(lookupDatabaseIds).toHaveBeenCalledWith({
        lookupRepo: expect.anything(),
        environmentName: mockParams.environment,
        triggerName: mockParams.trigger,
        suiteId: mockParams.suite,
        logPrefix,
      });

      expect(processTestsFromZip).toHaveBeenCalledWith(
        mockZip,
        mockParams.branch,
        mockParams.environment,
        undefined,
        logPrefix,
      );

      expect(processScreenshots).toHaveBeenCalledWith(mockZip, logPrefix);
      expect(mapScreenshotPaths).toHaveBeenCalled();
      expect(checkDuplicate).toHaveBeenCalled();
      expect(insertTestRun).toHaveBeenCalled();
    });

    it("should return error when Supabase is not configured", async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database not configured");
    });

    it("should return error when database ID lookup fails", async () => {
      vi.mocked(lookupDatabaseIds).mockResolvedValue({
        success: false,
        error: { message: "Environment not found", status: 404 },
      });

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Environment not found");
    });

    it("should handle duplicate detection and return 409 status info", async () => {
      vi.mocked(checkDuplicate).mockResolvedValue({
        isDuplicate: true,
        existingRun: {
          id: "existing-run-123",
          timestamp: "2024-01-01T00:00:00Z",
        },
      });

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Duplicate upload detected");
      expect(result.isDuplicate).toBe(true);
      expect(result.existingRunId).toBe("existing-run-123");
      expect(result.message).toContain("already uploaded");
    });

    it("should return error when test run insertion fails", async () => {
      vi.mocked(insertTestRun).mockResolvedValue({
        success: false,
        error: "Database error",
      });

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to store test results");
      expect(result.details).toBe("Database error");
    });

    it("should trigger webhooks when there are test failures", async () => {
      const failedProcessedData = {
        ...mockProcessedData,
        stats: {
          total: 10,
          passed: 7,
          failed: 3,
          flaky: 0,
          skipped: 0,
        },
      };

      vi.mocked(processTestsFromZip).mockResolvedValue(
        failedProcessedData as unknown as Awaited<
          ReturnType<typeof processTestsFromZip>
        >,
      );

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(true);
      expect(triggerRunFailureWebhooks).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: "Test Project",
          environment: mockParams.environment,
          branch: mockParams.branch,
          commit: mockParams.commit,
          totalTests: 10,
          failedTests: 3,
          passRate: 70,
        }),
        mockProjectId,
        "org-1",
      );
    });

    it("should NOT trigger webhooks when all tests pass", async () => {
      const passedProcessedData = {
        ...mockProcessedData,
        stats: {
          total: 10,
          passed: 10,
          failed: 0,
          flaky: 0,
          skipped: 0,
        },
      };

      vi.mocked(processTestsFromZip).mockResolvedValue(
        passedProcessedData as unknown as Awaited<
          ReturnType<typeof processTestsFromZip>
        >,
      );

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(true);
      expect(triggerRunFailureWebhooks).not.toHaveBeenCalled();
    });

    it("should continue if webhook triggering fails", async () => {
      const failedProcessedData = {
        ...mockProcessedData,
        stats: {
          total: 10,
          passed: 7,
          failed: 3,
          flaky: 0,
          skipped: 0,
        },
      };

      vi.mocked(processTestsFromZip).mockResolvedValue(
        failedProcessedData as unknown as Awaited<
          ReturnType<typeof processTestsFromZip>
        >,
      );
      vi.mocked(triggerRunFailureWebhooks).mockRejectedValue(
        new Error("Webhook error"),
      );

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      // Should still succeed even if webhooks fail
      expect(result.success).toBe(true);
      expect(result.testRunId).toBe("run-123");
    });

    it("should aggregate metrics after successful upload", async () => {
      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(true);
      expect(aggregateFlakinessMetrics).toHaveBeenCalledWith(
        expect.anything(),
        "2024-01-01",
      );
      expect(aggregatePerformanceMetrics).toHaveBeenCalledWith(
        expect.anything(),
        "2024-01-01",
      );
      expect(detectAndNotifyAlerts).toHaveBeenCalledWith(
        expect.anything(), // metricsRepo
        "2024-01-01",
      );
    });

    it("should continue if metrics aggregation fails", async () => {
      vi.mocked(aggregateFlakinessMetrics).mockRejectedValue(
        new Error("Metrics error"),
      );

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      // Should still succeed even if metrics fail
      expect(result.success).toBe(true);
      expect(result.testRunId).toBe("run-123");
    });

    it("should use pre-calculated hash when provided", async () => {
      const paramsWithHash = {
        ...mockParams,
        preCalculatedHash: "precalc-hash-456",
      };

      await processUpload(
        mockZip,
        paramsWithHash,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(processTestsFromZip).toHaveBeenCalledWith(
        mockZip,
        paramsWithHash.branch,
        paramsWithHash.environment,
        "precalc-hash-456",
        logPrefix,
      );
    });

    it("should handle errors gracefully and return error result", async () => {
      vi.mocked(processTestsFromZip).mockRejectedValue(
        new Error("ZIP processing failed"),
      );

      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Failed to process upload");
      expect(result.details).toBe("ZIP processing failed");
    });

    it("should include all test run details in success response", async () => {
      const result = await processUpload(
        mockZip,
        mockParams,
        mockProjectId,
        mockFilename,
        logPrefix,
      );

      expect(result.success).toBe(true);
      expect(result.testRun).toEqual({
        id: "run-123",
        timestamp: mockProcessedData.timestamp,
        environment: mockParams.environment,
        trigger: mockParams.trigger,
        suite: mockParams.suite,
        branch: mockProcessedData.branch,
        commit: mockParams.commit,
        total: 10,
        passed: 8,
        failed: 2,
        flaky: 0,
        skipped: 0,
        duration: "5m 30s",
        contentHash: "hash123",
        tests: mockProcessedData.tests,
      });
    });
  });
});
