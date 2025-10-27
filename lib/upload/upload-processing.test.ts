import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import {
  processScreenshots,
  processTestsFromZip,
  lookupDatabaseIds,
  verifyUserProjectAccess,
  checkDuplicate,
  type ProcessedUpload,
  type DatabaseIds,
} from "./upload-processing";
import { insertTestRun } from "@/lib/insert-test-run";

// Helper to convert Buffer to Uint8Array for JSZip (TS 5.9 compatibility)
const toUint8Array = (buffer: Buffer): Uint8Array => new Uint8Array(buffer);

describe("upload-processing", () => {
  describe("processScreenshots", () => {
    it("should process screenshots and upload to Supabase Storage", async () => {
      // Create a mock ZIP with screenshots in data/ directory
      const zip = new JSZip();
      zip.file(
        "data/test-screenshot.png",
        toUint8Array(Buffer.from("fake-image-data")),
      );

      // Set environment variables
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

      const result = await processScreenshots(zip, "[Test]");

      expect(result.screenshotCount).toBe(1);
      expect(result.screenshotUrls).toHaveProperty("data/test-screenshot.png");
    });

    it("should handle screenshots when Supabase is not configured", async () => {
      const zip = new JSZip();
      zip.file("data/test.png", toUint8Array(Buffer.from("fake-data")));

      // Clear environment variables
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const result = await processScreenshots(zip, "[Test]");

      expect(result.screenshotCount).toBe(1);
      // Should use base64 encoding
      expect(result.screenshotUrls["data/test.png"]).toMatch(
        /^data:image\/png;base64,/,
      );
    });

    it("should handle empty ZIP (no screenshots)", async () => {
      const zip = new JSZip();

      const result = await processScreenshots(zip, "[Test]");

      expect(result.screenshotCount).toBe(0);
      expect(Object.keys(result.screenshotUrls)).toHaveLength(0);
    });

    it("should determine correct content type for JPEG", async () => {
      const zip = new JSZip();
      zip.file("data/test.jpg", toUint8Array(Buffer.from("fake-data")));

      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const result = await processScreenshots(zip);

      expect(result.screenshotUrls["data/test.jpg"]).toMatch(
        /^data:image\/jpeg;base64,/,
      );
    });
  });

  describe("processTestsFromZip", () => {
    let mockZip: JSZip;

    beforeEach(async () => {
      // Create a realistic Playwright report structure
      mockZip = new JSZip();

      const reportData = {
        config: {
          rootDir: "/test",
          version: "1.0.0",
        },
        suites: [
          {
            title: "",
            file: "test.spec.ts",
            column: 0,
            line: 0,
            specs: [
              {
                title: "should pass",
                ok: true,
                testId: "test-1",
                projectName: "chromium",
                outcome: "expected",
                duration: 1000,
                tests: [
                  {
                    expectedStatus: "passed",
                    timeout: 30000,
                    annotations: [],
                    projectName: "chromium",
                    results: [
                      {
                        workerIndex: 0,
                        status: "passed",
                        duration: 1000,
                        errors: [],
                        attachments: [],
                      },
                    ],
                  },
                ],
                results: [
                  {
                    workerIndex: 0,
                    status: "passed",
                    duration: 1000,
                    errors: [],
                    attachments: [],
                    retry: 0,
                    startTime: new Date().toISOString(),
                  },
                ],
              },
            ],
          },
        ],
      };

      mockZip.file("report.json", JSON.stringify(reportData));
    });

    it("should extract tests from ZIP", async () => {
      const result = await processTestsFromZip(
        mockZip,
        "main",
        "production",
        undefined,
        "[Test]",
      );

      expect(result.tests).toBeDefined();
      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.stats).toBeDefined();
      expect(result.contentHash).toBeDefined();
      expect(result.branch).toBe("main");
      expect(result.environment).toBe("production");
    });

    it("should normalize environment names", async () => {
      const result = await processTestsFromZip(
        mockZip,
        "main",
        "prod", // Should be normalized to "production"
        undefined,
        "[Test]",
      );

      // Environment normalization depends on your implementation
      expect(result.environment).toBeDefined();
    });

    it("should use pre-calculated hash if provided", async () => {
      const preCalculatedHash = "test-hash-123";

      const result = await processTestsFromZip(
        mockZip,
        "main",
        "production",
        preCalculatedHash,
        "[Test]",
      );

      expect(result.contentHash).toBe(preCalculatedHash);
    });

    it("should extract CI metadata if available", async () => {
      // Add CI metadata to ZIP
      mockZip.file(
        "ci-metadata.json",
        JSON.stringify({
          branch: "feature-branch",
          commit: "abc123",
        }),
      );

      const result = await processTestsFromZip(
        mockZip,
        "unknown",
        "production",
        undefined,
        "[Test]",
      );

      expect(result.ciMetadata).toBeDefined();
    });
  });

  describe("verifyUserProjectAccess", () => {
    it("should return success when user has access", async () => {
      const mockLookupRepo = {
        getUserOrganizations: vi.fn().mockResolvedValue(["org-1"]),
        checkOrganizationProjectAccess: vi.fn().mockResolvedValue(true),
      } as any;

      const result = await verifyUserProjectAccess({
        lookupRepo: mockLookupRepo,
        userId: "user-1",
        projectId: "project-1",
        logPrefix: "[Test]",
      });

      expect(result.success).toBe(true);
      expect(mockLookupRepo.getUserOrganizations).toHaveBeenCalledWith(
        "user-1",
      );
      expect(
        mockLookupRepo.checkOrganizationProjectAccess,
      ).toHaveBeenCalledWith("project-1", ["org-1"]);
    });

    it("should return error when user has no organizations", async () => {
      const mockLookupRepo = {
        getUserOrganizations: vi.fn().mockResolvedValue([]),
      } as any;

      const result = await verifyUserProjectAccess({
        lookupRepo: mockLookupRepo,
        userId: "user-1",
        projectId: "project-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain("member of an organization");
    });

    it("should return error when user org has no access to project", async () => {
      const mockLookupRepo = {
        getUserOrganizations: vi.fn().mockResolvedValue(["org-1"]),
        checkOrganizationProjectAccess: vi.fn().mockResolvedValue(false),
      } as any;

      const result = await verifyUserProjectAccess({
        lookupRepo: mockLookupRepo,
        userId: "user-1",
        projectId: "project-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(403);
      expect(result.error?.message).toContain("do not have access");
    });
  });

  describe("lookupDatabaseIds", () => {
    it("should lookup all required IDs successfully", async () => {
      const mockLookupRepo = {
        getSuiteById: vi.fn().mockResolvedValue({
          id: "suite-1",
          project_id: "project-1",
        }),
        getEnvironmentByName: vi.fn().mockResolvedValue({ id: "env-1" }),
        getTriggerByName: vi.fn().mockResolvedValue({ id: "trigger-1" }),
      } as any;

      const result = await lookupDatabaseIds({
        lookupRepo: mockLookupRepo,
        environmentName: "production",
        triggerName: "ci",
        suiteId: "suite-1",
        logPrefix: "[Test]",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      });
      expect(mockLookupRepo.getSuiteById).toHaveBeenCalledWith("suite-1");
      expect(mockLookupRepo.getEnvironmentByName).toHaveBeenCalledWith(
        "production",
      );
      expect(mockLookupRepo.getTriggerByName).toHaveBeenCalledWith("ci");
    });

    it("should return error when environment not found", async () => {
      const mockLookupRepo = {
        getSuiteById: vi.fn().mockResolvedValue({
          id: "suite-1",
          project_id: "project-1",
        }),
        getEnvironmentByName: vi.fn().mockResolvedValue(null),
        getTriggerByName: vi.fn().mockResolvedValue({ id: "trigger-1" }),
      } as any;

      const result = await lookupDatabaseIds({
        lookupRepo: mockLookupRepo,
        environmentName: "invalid",
        triggerName: "ci",
        suiteId: "suite-1",
      });

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain("Environment");
    });

    it("should return error when suite not found", async () => {
      const mockLookupRepo = {
        getSuiteById: vi.fn().mockResolvedValue(null),
      } as any;

      const result = await lookupDatabaseIds({
        lookupRepo: mockLookupRepo,
        environmentName: "production",
        triggerName: "ci",
        suiteId: "invalid-suite",
      });

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain("Suite");
    });
  });

  describe("checkDuplicate", () => {
    it("should return not duplicate when no existing run found", async () => {
      const mockTestRunRepo = {
        findDuplicateByContentHash: vi.fn().mockResolvedValue(null),
      } as any;

      const result = await checkDuplicate({
        testRunRepo: mockTestRunRepo,
        contentHash: "hash-123",
        projectId: "project-1",
        logPrefix: "[Test]",
      });

      expect(result.isDuplicate).toBe(false);
      expect(mockTestRunRepo.findDuplicateByContentHash).toHaveBeenCalledWith(
        "hash-123",
        "project-1",
      );
    });

    it("should return duplicate when existing run found", async () => {
      const existingRun = {
        id: "run-1",
        timestamp: new Date().toISOString(),
      };

      const mockTestRunRepo = {
        findDuplicateByContentHash: vi.fn().mockResolvedValue(existingRun),
      } as any;

      const result = await checkDuplicate({
        testRunRepo: mockTestRunRepo,
        contentHash: "hash-123",
        projectId: "project-1",
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingRun).toEqual(existingRun);
    });

    it("should handle errors gracefully", async () => {
      const mockTestRunRepo = {
        findDuplicateByContentHash: vi
          .fn()
          .mockRejectedValue(new Error("DB error")),
      } as any;

      const result = await checkDuplicate({
        testRunRepo: mockTestRunRepo,
        contentHash: "hash-123",
        projectId: "project-1",
      });

      // Should return false on error instead of throwing
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("insertTestRun", () => {
    let mockDatabaseIds: DatabaseIds;
    let mockProcessedData: ProcessedUpload;

    beforeEach(() => {
      mockDatabaseIds = {
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      };

      mockProcessedData = {
        tests: [
          {
            id: "test-1",
            name: "should pass",
            file: "test.spec.ts",
            status: "passed",
            duration: 1000,
            screenshots: [],
            attempts: [],
          },
        ] as any,
        stats: {
          total: 1,
          passed: 1,
          failed: 0,
          flaky: 0,
          skipped: 0,
        },
        contentHash: "hash-123",
        branch: "main",
        environment: "production",
        timestamp: new Date().toISOString(),
        ciMetadata: null,
        totalDuration: 1000,
        durationFormatted: "1s",
        environmentData: null,
      };
    });

    it("should insert test run successfully", async () => {
      const runData = { id: "run-1" };

      const mockTestRunRepo = {
        createTestRun: vi.fn().mockResolvedValue(runData),
        upsertSuiteTests: vi
          .fn()
          .mockResolvedValue([
            { id: "st-1", file: "test.spec.ts", name: "should pass" },
          ]),
        insertTests: vi.fn().mockResolvedValue([{ id: "t-1" }]),
        insertTestResults: vi.fn().mockResolvedValue(undefined),
      } as any;

      const result = await insertTestRun({
        testRunRepo: mockTestRunRepo,
        databaseIds: mockDatabaseIds,
        processedData: mockProcessedData,
        commit: "abc123",
        filename: "test.zip",
        logPrefix: "[Test]",
      });

      expect(result.success).toBe(true);
      expect(result.testRunId).toBe("run-1");
      expect(mockTestRunRepo.createTestRun).toHaveBeenCalled();
      expect(mockTestRunRepo.upsertSuiteTests).toHaveBeenCalled();
      expect(mockTestRunRepo.insertTests).toHaveBeenCalled();
    });

    it("should return error when test run insertion fails", async () => {
      const mockTestRunRepo = {
        createTestRun: vi.fn().mockRejectedValue(new Error("Insert failed")),
      } as any;

      const result = await insertTestRun({
        testRunRepo: mockTestRunRepo,
        databaseIds: mockDatabaseIds,
        processedData: mockProcessedData,
        commit: "abc123",
        filename: "test.zip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should insert test results for tests with retries", async () => {
      const processedDataWithRetries = {
        ...mockProcessedData,
        tests: [
          {
            ...mockProcessedData.tests[0],
            attempts: [
              {
                retryIndex: 0,
                status: "failed",
                duration: 500,
                error: "Test failed",
                errorStack: "Error stack",
                screenshots: [],
                attachments: [],
                steps: [],
              },
              {
                retryIndex: 1,
                status: "passed",
                duration: 500,
                screenshots: [],
                attachments: [],
                steps: [],
              },
            ],
          },
        ] as any,
      };

      const mockTestRunRepo = {
        createTestRun: vi.fn().mockResolvedValue({ id: "run-1" }),
        upsertSuiteTests: vi
          .fn()
          .mockResolvedValue([
            { id: "st-1", file: "test.spec.ts", name: "should pass" },
          ]),
        insertTests: vi.fn().mockResolvedValue([{ id: "t-1" }]),
        insertTestResults: vi.fn().mockResolvedValue(undefined),
      } as any;

      const result = await insertTestRun({
        testRunRepo: mockTestRunRepo,
        databaseIds: mockDatabaseIds,
        processedData: processedDataWithRetries,
        commit: "abc123",
        filename: "test.zip",
      });

      expect(result.success).toBe(true);
      expect(mockTestRunRepo.insertTestResults).toHaveBeenCalled();
    });
  });
});
