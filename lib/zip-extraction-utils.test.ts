import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import JSZip from "jszip";
import {
  determineTestStatus,
  extractBranchFromCI,
  normalizeEnvironment,
  extractMetadataFromDatFiles,
  extractTestsFromZip,
  findScreenshotFiles,
  mapScreenshotPaths,
  calculateTestStats,
  formatDuration,
  extractEnvironmentData,
  ENVIRONMENT_MAPPING,
  type CIMetadata,
  type ExtractedTest,
} from "./zip-extraction-utils";

describe("zip-extraction-utils", () => {
  let testZip: JSZip;
  let testZipWithAllureMetadata: JSZip;

  beforeAll(async () => {
    // Load the sample test report from fixtures
    const buffer = readFileSync(
      __dirname + "/__tests__/fixtures/playwright-report-sample.zip",
    );
    testZip = await JSZip.loadAsync(new Uint8Array(buffer));

    // Load test report with Allure metadata
    const allureBuffer = readFileSync(
      __dirname + "/__tests__/fixtures/playwright-report-with-allure-metadata.zip",
    );
    testZipWithAllureMetadata = await JSZip.loadAsync(new Uint8Array(allureBuffer));
  });

  describe("determineTestStatus", () => {
    it("should return skipped when last result is skipped", () => {
      expect(determineTestStatus("expected", "skipped")).toBe("skipped");
      expect(determineTestStatus("flaky", "skipped")).toBe("skipped");
    });

    it("should return last result status when outcome is expected", () => {
      expect(determineTestStatus("expected", "passed")).toBe("passed");
      expect(determineTestStatus("expected", "failed")).toBe("failed");
      expect(determineTestStatus("expected", "timedOut")).toBe("timedOut");
    });

    it("should return flaky when outcome is flaky", () => {
      expect(determineTestStatus("flaky", "passed")).toBe("flaky");
      expect(determineTestStatus("flaky", "failed")).toBe("flaky");
    });

    it("should return failed for unexpected outcomes", () => {
      expect(determineTestStatus("unexpected", "failed")).toBe("failed");
      expect(determineTestStatus("unexpected", "passed")).toBe("failed");
    });
  });

  describe("extractBranchFromCI", () => {
    it("should respect user-provided branch over CI metadata", () => {
      const ciMetadata: CIMetadata = {
        GITHUB_HEAD_REF: "feature/test-branch",
        prTitle: "WS-2938: Fix something",
      };
      // When user provides explicit branch, it should be used
      expect(extractBranchFromCI(ciMetadata, "my-custom-branch")).toBe(
        "my-custom-branch",
      );
    });

    it("should extract branch from GITHUB_HEAD_REF when fallback is unknown", () => {
      const ciMetadata: CIMetadata = {
        GITHUB_HEAD_REF: "feature/test-branch",
      };
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe(
        "feature/test-branch",
      );
    });

    it("should extract branch from GITHUB_REF_NAME when fallback is unknown", () => {
      const ciMetadata: CIMetadata = {
        GITHUB_REF_NAME: "main",
      };
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe("main");
    });

    it("should prioritize GITHUB_HEAD_REF over GITHUB_REF_NAME", () => {
      const ciMetadata: CIMetadata = {
        GITHUB_HEAD_REF: "feature-branch",
        GITHUB_REF_NAME: "main",
      };
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe(
        "feature-branch",
      );
    });

    it("should extract ticket from PR title when no CI vars and fallback is unknown", () => {
      const ciMetadata: CIMetadata = {
        prTitle: "WS-2938: Fix something important",
      };
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe("WS-2938");
    });

    it("should use PR title part before colon when no ticket pattern", () => {
      const ciMetadata: CIMetadata = {
        prTitle: "WS-XX: Try add ingest into FlakeFinder.",
        prHref: "https://github.com/org/repo/pull/2007",
      };
      // Should use "WS-XX" instead of falling back to "pr-2007"
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe("WS-XX");
    });

    it("should extract PR number from href when no ticket and no title part", () => {
      const ciMetadata: CIMetadata = {
        prTitle: ": Fix something", // Empty before colon
        prHref: "https://github.com/org/repo/pull/123",
      };
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe("pr-123");
    });

    it("should return fallback when no branch found", () => {
      const ciMetadata: CIMetadata = {};
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe("unknown");
      expect(extractBranchFromCI(ciMetadata, "default")).toBe("default");
    });

    it("should handle multiple CI environment variables", () => {
      const ciMetadata: CIMetadata = {
        BRANCH: "develop",
      };
      expect(extractBranchFromCI(ciMetadata, "unknown")).toBe("develop");
    });

    it("should sanitize special characters in branch names", () => {
      const ciMetadata: CIMetadata = {};
      expect(extractBranchFromCI(ciMetadata, "feature@branch#test")).toBe(
        "feature-branch-test",
      );
    });

    it("should truncate long branch names to 60 characters", () => {
      const ciMetadata: CIMetadata = {};
      const longBranch = "a".repeat(70);
      const result = extractBranchFromCI(ciMetadata, longBranch);
      expect(result.length).toBe(63); // 60 chars + "..."
      expect(result).toBe("a".repeat(60) + "...");
    });

    it("should preserve allowed characters in branch names", () => {
      const ciMetadata: CIMetadata = {};
      expect(extractBranchFromCI(ciMetadata, "feature-123_test/branch")).toBe(
        "feature-123_test/branch",
      );
    });
  });

  describe("normalizeEnvironment", () => {
    it("should map preview to development", () => {
      expect(normalizeEnvironment("preview")).toBe("development");
      expect(normalizeEnvironment("Preview")).toBe("development");
      expect(normalizeEnvironment("PREVIEW")).toBe("development");
    });

    it("should map dev to development", () => {
      expect(normalizeEnvironment("dev")).toBe("development");
    });

    it("should map prod to production", () => {
      expect(normalizeEnvironment("prod")).toBe("production");
    });

    it("should map stage to staging", () => {
      expect(normalizeEnvironment("stage")).toBe("staging");
    });

    it("should map test to testing", () => {
      expect(normalizeEnvironment("test")).toBe("testing");
    });

    it("should return original value if no mapping exists", () => {
      expect(normalizeEnvironment("custom")).toBe("custom");
      expect(normalizeEnvironment("production")).toBe("production");
    });

    it("should be case-insensitive", () => {
      expect(normalizeEnvironment("DEV")).toBe("development");
      expect(normalizeEnvironment("Prod")).toBe("production");
    });
  });

  describe("extractMetadataFromDatFiles", () => {
    it("should extract metadata from .dat files", async () => {
      const zip = new JSZip();
      zip.file(
        "abc123.dat",
        JSON.stringify({
          type: "metadata",
          data: { browser: "chromium", version: "1.0" },
        }),
      );

      const metadata = await extractMetadataFromDatFiles(zip);

      expect(metadata.size).toBe(1);
      expect(metadata.get("abc123")).toEqual({
        browser: "chromium",
        version: "1.0",
      });
    });

    it("should skip invalid JSON files", async () => {
      const zip = new JSZip();
      zip.file("invalid.dat", "not json");
      zip.file(
        "valid.dat",
        JSON.stringify({ type: "metadata", data: { test: "data" } }),
      );

      const metadata = await extractMetadataFromDatFiles(zip);

      expect(metadata.size).toBe(1);
      expect(metadata.get("valid")).toEqual({ test: "data" });
    });

    it("should skip non-metadata .dat files", async () => {
      const zip = new JSZip();
      zip.file(
        "other.dat",
        JSON.stringify({ type: "other", data: { test: "data" } }),
      );

      const metadata = await extractMetadataFromDatFiles(zip);

      expect(metadata.size).toBe(0);
    });

    it("should handle empty ZIP", async () => {
      const zip = new JSZip();
      const metadata = await extractMetadataFromDatFiles(zip);

      expect(metadata.size).toBe(0);
    });
  });

  describe("findScreenshotFiles", () => {
    it("should find PNG screenshots in data/ directory", () => {
      const zip = new JSZip();
      zip.file("data/screenshot1.png", "fake-image-data");
      zip.file("data/screenshot2.png", "fake-image-data");
      zip.file("other/screenshot3.png", "fake-image-data");

      const screenshots = findScreenshotFiles(zip);

      expect(screenshots).toHaveLength(2);
      expect(screenshots).toContain("data/screenshot1.png");
      expect(screenshots).toContain("data/screenshot2.png");
    });

    it("should find JPG and JPEG screenshots", () => {
      const zip = new JSZip();
      zip.file("data/screenshot1.jpg", "fake-image-data");
      zip.file("data/screenshot2.jpeg", "fake-image-data");

      const screenshots = findScreenshotFiles(zip);

      expect(screenshots).toHaveLength(2);
      expect(screenshots).toContain("data/screenshot1.jpg");
      expect(screenshots).toContain("data/screenshot2.jpeg");
    });

    it("should ignore non-screenshot files", () => {
      const zip = new JSZip();
      zip.file("data/report.json", "{}");
      zip.file("data/test.txt", "text");
      zip.file("data/screenshot.png", "image");

      const screenshots = findScreenshotFiles(zip);

      expect(screenshots).toHaveLength(1);
      expect(screenshots).toContain("data/screenshot.png");
    });

    it("should return empty array for ZIP without screenshots", () => {
      const zip = new JSZip();
      zip.file("report.json", "{}");

      const screenshots = findScreenshotFiles(zip);

      expect(screenshots).toHaveLength(0);
    });
  });

  describe("mapScreenshotPaths", () => {
    it("should map screenshot paths to URLs", () => {
      const tests: ExtractedTest[] = [
        {
          id: "test1",
          name: "Test 1",
          status: "passed",
          duration: 1000,
          file: "test.spec.ts",
          screenshots: ["data/screenshot1.png", "data/screenshot2.png"],
        },
      ];

      const screenshotUrls = {
        "data/screenshot1.png": "https://example.com/screenshot1.png",
        "data/screenshot2.png": "https://example.com/screenshot2.png",
      };

      mapScreenshotPaths(tests, screenshotUrls);

      expect(tests[0].screenshots).toEqual([
        "https://example.com/screenshot1.png",
        "https://example.com/screenshot2.png",
      ]);
    });

    it("should try .jpg variant for missing .png files", () => {
      const tests: ExtractedTest[] = [
        {
          id: "test1",
          name: "Test 1",
          status: "passed",
          duration: 1000,
          file: "test.spec.ts",
          screenshots: ["data/screenshot.png"],
        },
      ];

      const screenshotUrls = {
        "data/screenshot.jpg": "https://example.com/screenshot.jpg",
      };

      mapScreenshotPaths(tests, screenshotUrls);

      expect(tests[0].screenshots).toEqual([
        "https://example.com/screenshot.jpg",
      ]);
    });

    it("should filter out missing screenshots", () => {
      const tests: ExtractedTest[] = [
        {
          id: "test1",
          name: "Test 1",
          status: "passed",
          duration: 1000,
          file: "test.spec.ts",
          screenshots: ["data/missing.png", "data/found.png"],
        },
      ];

      const screenshotUrls = {
        "data/found.png": "https://example.com/found.png",
      };

      mapScreenshotPaths(tests, screenshotUrls);

      expect(tests[0].screenshots).toEqual(["https://example.com/found.png"]);
    });

    it("should map attempt result screenshots", () => {
      const tests: ExtractedTest[] = [
        {
          id: "test1",
          name: "Test 1",
          status: "flaky",
          duration: 2000,
          file: "test.spec.ts",
          screenshots: ["data/final.png"],
          attempts: [
            {
              retryIndex: 0,
              status: "failed",
              duration: 1000,
              screenshots: ["data/retry1.png"],
            },
            {
              retryIndex: 1,
              status: "passed",
              duration: 1000,
              screenshots: ["data/retry2.png"],
            },
          ],
        },
      ];

      const screenshotUrls = {
        "data/final.png": "https://example.com/final.png",
        "data/retry1.png": "https://example.com/retry1.png",
        "data/retry2.png": "https://example.com/retry2.png",
      };

      mapScreenshotPaths(tests, screenshotUrls);

      expect(tests[0].screenshots).toEqual(["https://example.com/final.png"]);
      expect(tests[0].attempts![0].screenshots).toEqual([
        "https://example.com/retry1.png",
      ]);
      expect(tests[0].attempts![1].screenshots).toEqual([
        "https://example.com/retry2.png",
      ]);
    });

    it("should handle tests without screenshots", () => {
      const tests: ExtractedTest[] = [
        {
          id: "test1",
          name: "Test 1",
          status: "passed",
          duration: 1000,
          file: "test.spec.ts",
          screenshots: [],
        },
      ];

      mapScreenshotPaths(tests, {});

      expect(tests[0].screenshots).toEqual([]);
    });
  });

  describe("calculateTestStats", () => {
    it("should calculate correct statistics", () => {
      const tests: ExtractedTest[] = [
        {
          id: "1",
          name: "Test 1",
          status: "passed",
          duration: 1000,
          file: "test.spec.ts",
          screenshots: [],
        },
        {
          id: "2",
          name: "Test 2",
          status: "failed",
          duration: 2000,
          file: "test.spec.ts",
          screenshots: [],
        },
        {
          id: "3",
          name: "Test 3",
          status: "flaky",
          duration: 3000,
          file: "test.spec.ts",
          screenshots: [],
        },
        {
          id: "4",
          name: "Test 4",
          status: "skipped",
          duration: 0,
          file: "test.spec.ts",
          screenshots: [],
        },
      ];

      const stats = calculateTestStats(tests);

      expect(stats.total).toBe(3); // Excludes skipped
      expect(stats.passed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.flaky).toBe(1);
      expect(stats.skipped).toBe(1);
    });

    it("should handle empty test array", () => {
      const stats = calculateTestStats([]);

      expect(stats.total).toBe(0);
      expect(stats.passed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.flaky).toBe(0);
      expect(stats.skipped).toBe(0);
    });

    it("should handle all passed tests", () => {
      const tests: ExtractedTest[] = [
        {
          id: "1",
          name: "Test 1",
          status: "passed",
          duration: 1000,
          file: "test.spec.ts",
          screenshots: [],
        },
        {
          id: "2",
          name: "Test 2",
          status: "passed",
          duration: 2000,
          file: "test.spec.ts",
          screenshots: [],
        },
      ];

      const stats = calculateTestStats(tests);

      expect(stats.total).toBe(2);
      expect(stats.passed).toBe(2);
      expect(stats.failed).toBe(0);
      expect(stats.flaky).toBe(0);
      expect(stats.skipped).toBe(0);
    });
  });

  describe("formatDuration", () => {
    it("should format duration in minutes and seconds", () => {
      expect(formatDuration(0)).toBe("0m 0s");
      expect(formatDuration(1000)).toBe("0m 1s");
      expect(formatDuration(60000)).toBe("1m 0s");
      expect(formatDuration(90000)).toBe("1m 30s");
      expect(formatDuration(125000)).toBe("2m 5s");
    });

    it("should handle large durations", () => {
      expect(formatDuration(3600000)).toBe("60m 0s"); // 1 hour
      expect(formatDuration(3661000)).toBe("61m 1s"); // 1 hour, 1 minute, 1 second
    });

    it("should round down seconds", () => {
      expect(formatDuration(1999)).toBe("0m 1s");
      expect(formatDuration(59999)).toBe("0m 59s");
    });
  });

  describe("extractTestsFromZip - Integration Tests with Real Data", () => {
    it("should extract tests from real HTML report", async () => {
      const result = await extractTestsFromZip(testZip);

      expect(result.tests).toBeDefined();
      expect(Array.isArray(result.tests)).toBe(true);
      expect(result.tests.length).toBe(39);

      // Verify test structure
      const firstTest = result.tests[0];
      expect(firstTest).toHaveProperty("id");
      expect(firstTest).toHaveProperty("name");
      expect(firstTest).toHaveProperty("status");
      expect(firstTest).toHaveProperty("duration");
      expect(firstTest).toHaveProperty("file");
      expect(firstTest).toHaveProperty("screenshots");
    });

    it("should extract all test statuses correctly from real data", async () => {
      const result = await extractTestsFromZip(testZip);

      // Group tests by status
      const statusCounts = {
        passed: result.tests.filter((t) => t.status === "passed").length,
        failed: result.tests.filter((t) => t.status === "failed").length,
        flaky: result.tests.filter((t) => t.status === "flaky").length,
        skipped: result.tests.filter((t) => t.status === "skipped").length,
        timedOut: result.tests.filter((t) => t.status === "timedOut").length,
      };

      // Should have at least some tests
      expect(result.tests.length).toBeGreaterThan(0);

      // All statuses should be valid
      result.tests.forEach((test) => {
        expect(["passed", "failed", "flaky", "skipped", "timedOut"]).toContain(
          test.status,
        );
      });

      expect(statusCounts.passed).toBe(18);
      expect(statusCounts.failed).toBe(11);
      expect(statusCounts.flaky).toBe(9);
      expect(statusCounts.skipped).toBe(1);
    });

    it("should extract CI metadata from real report", async () => {
      const result = await extractTestsFromZip(testZip);

      expect(result.ciMetadata).toEqual({
        commitHref:
          "https://github.com/lnerlabs/lner-web/commit/4f56d520f7e14e5d16dc547843440e983988e028",
        commitHash: "4f56d520f7e14e5d16dc547843440e983988e028",
        buildHref:
          "https://github.com/lnerlabs/lner-web/actions/runs/18632640797",
      });
    });

    it("should extract test execution time from real report", async () => {
      const result = await extractTestsFromZip(testZip);

      expect(result.testExecutionTime).toBe("2025-10-19T15:54:08.856Z");
    });

    it("should extract retry results for flaky tests with complete data", async () => {
      const result = await extractTestsFromZip(testZip);

      const flakyTests = result.tests.filter((t) => t.status === "flaky");
      expect(flakyTests.length).toBe(9);

      const flakyTest = flakyTests[2];
      expect(flakyTest.name).toBe("Change of journey flexi free");
      expect(flakyTest.attempts).toBeDefined();
      expect(flakyTest.attempts!.length).toBe(2);

      // Verify first attempt
      expect(flakyTest.attempts![0]).toMatchObject({
        retryIndex: 0,
        status: "failed",
        duration: 119770,
      });
      expect(flakyTest.attempts![0].error).toContain("TimeoutError");

      // Verify second attempt
      expect(flakyTest.attempts![1]).toMatchObject({
        retryIndex: 1,
        status: "passed",
        duration: 103886,
      });
    });

    it("should extract error messages for failed tests", async () => {
      const result = await extractTestsFromZip(testZip);

      const failedTests = result.tests.filter((t) => t.status === "failed");
      expect(failedTests.length).toBe(11);

      const failedTest = failedTests[0];
      expect(failedTest.name).toBe("Purchase - With fully covering voucher");
      expect(failedTest.error).toBeDefined();
      expect(failedTest.error).toContain(
        "TimeoutError: locator.click: Timeout 10000ms exceeded.",
      );
      expect(failedTest.error).toContain(
        "waiting for getByRole('group', { name: 'LNER Perks credit toggle' })",
      );
    });

    it("should extract screenshots with correct paths", async () => {
      const result = await extractTestsFromZip(testZip);

      const testsWithScreenshots = result.tests.filter(
        (t) => t.screenshots.length > 0,
      );
      expect(testsWithScreenshots.length).toBe(3);

      const testWithScreenshot = testsWithScreenshots[0];
      expect(testWithScreenshot.name).toBe(
        "Purchase - With fully covering voucher",
      );
      expect(testWithScreenshot.screenshots).toEqual([
        "data/bdc31566e93affed5985413d83340ab9638ebcb9.png",
      ]);
    });

    it("should extract worker index and start time when available", async () => {
      const result = await extractTestsFromZip(testZip);

      const testsWithWorkerInfo = result.tests.filter(
        (t) => t.worker_index !== undefined,
      );
      const testsWithStartTime = result.tests.filter(
        (t) => t.started_at !== undefined,
      );

      // This fixture has no worker_index data
      expect(testsWithWorkerInfo.length).toBe(0);

      // All tests should have start time
      expect(testsWithStartTime.length).toBe(39);

      const firstTest = result.tests[0];
      expect(firstTest.started_at).toBe("2025-10-19T15:54:23.138Z");
    });

    it("should extract test metadata (browser, tags, annotations)", async () => {
      const result = await extractTestsFromZip(testZip);

      const testsWithMetadata = result.tests.filter((t) => t.metadata);
      expect(testsWithMetadata.length).toBe(39);

      // Find test with annotations
      const testWithAnnotations = result.tests.find(
        (t) => t.name === "should immediately remove cancelled bike reservation without page refresh"
      );
      expect(testWithAnnotations).toBeDefined();
      expect(testWithAnnotations!.metadata).toEqual({
        browser: "chromium",
        tags: [],
        annotations: [
          {
            type: "skip",
          },
        ],
      });
    });

    it("should calculate correct total duration from all retry attempts", async () => {
      const result = await extractTestsFromZip(testZip);

      const testsWithRetries = result.tests.filter(
        (t) => t.attempts && t.attempts.length > 0,
      );
      expect(testsWithRetries.length).toBe(39);

      const test = testsWithRetries[0];
      expect(test.name).toBe(
        "No exponea cookie when user doesn't consent to OneTrust",
      );

      // Calculate sum of all retry durations
      const sumOfRetries = test.attempts!.reduce(
        (sum, retry) => sum + retry.duration,
        0,
      );

      // Test duration should equal sum of all attempts
      expect(test.duration).toBe(sumOfRetries);
      expect(test.duration).toBe(11566);
    });

    it("should extract all file paths correctly", async () => {
      const result = await extractTestsFromZip(testZip);

      // All tests should have a file path
      result.tests.forEach((test) => {
        expect(test.file).toBeDefined();
        expect(typeof test.file).toBe("string");
        expect(test.file.length).toBeGreaterThan(0);
        expect(test.file).not.toBe("unknown");
      });

      // Get unique file paths
      const uniqueFiles = new Set(result.tests.map((t) => t.file));
      expect(uniqueFiles.size).toBe(10);
      expect(uniqueFiles).toEqual(
        new Set([
          "bloomreach.spec.ts",
          "change-of-journey.spec.ts",
          "consent-mode.spec.ts",
          "fallback-cache.spec.ts",
          "live-smoke/live-updates.spec.ts",
          "season-ticket-purchase.spec.ts",
          "staff-purchase.spec.ts",
          "standalone-reservation.spec.ts",
          "ticket-purchase.spec.ts",
          "ticket-purchase.mobile.spec.ts",
        ]),
      );
    });

    it("should have consistent test IDs", async () => {
      const result = await extractTestsFromZip(testZip);

      // All tests should have unique IDs
      const testIds = result.tests.map((t) => t.id);
      const uniqueIds = new Set(testIds);

      expect(testIds.length).toBe(uniqueIds.size); // No duplicates

      // IDs should be non-empty strings
      result.tests.forEach((test) => {
        expect(typeof test.id).toBe("string");
        expect(test.id.length).toBeGreaterThan(0);
      });
    });

    it("should extract Allure metadata (epic, labels, parameters, descriptions) from .dat files", async () => {
      const result = await extractTestsFromZip(testZipWithAllureMetadata);

      expect(result.tests.length).toBe(30);

      // Find tests with epic metadata
      const testsWithEpic = result.tests.filter((t) => t.metadata?.epic);
      expect(testsWithEpic.length).toBe(25);

      // Verify unique epics
      const epics = new Set(testsWithEpic.map((t) => t.metadata!.epic));
      expect(epics).toEqual(new Set([
        "Season Tickets",
        "Standalone Reservations",
        "Ticket Purchase",
      ]));

      // Find a specific test with rich metadata
      const testWithMetadata = result.tests.find(
        (t) => t.name === "Test Purchase - Smartcard"
      );
      expect(testWithMetadata).toBeDefined();
      expect(testWithMetadata!.metadata?.epic).toBe("Season Tickets");
      expect(testWithMetadata!.metadata?.labels).toBeDefined();
      expect(testWithMetadata!.metadata?.labels!.length).toBeGreaterThan(0);
      
      // Verify labels structure
      const epicLabel = testWithMetadata!.metadata?.labels?.find(
        (l) => l.name === "epic"
      );
      expect(epicLabel).toEqual({ name: "epic", value: "Season Tickets" });

      // Verify parameters are extracted
      const testsWithParams = result.tests.filter(
        (t) => t.metadata?.parameters && t.metadata.parameters.length > 0
      );
      expect(testsWithParams.length).toBe(25);

      // Check a test with parameters
      if (testsWithParams.length > 0) {
        const testWithParams = testsWithParams[0];
        expect(testWithParams.metadata?.parameters).toBeDefined();
        expect(Array.isArray(testWithParams.metadata?.parameters)).toBe(true);
        
        // Verify parameter structure
        const param = testWithParams.metadata!.parameters![0];
        expect(param).toHaveProperty("name");
        expect(param).toHaveProperty("value");
        expect(typeof param.name).toBe("string");
        expect(typeof param.value).toBe("string");
      }

      // Verify descriptions are extracted
      const testsWithDescription = result.tests.filter(
        (t) => t.metadata?.description || t.metadata?.descriptionHtml
      );
      expect(testsWithDescription.length).toBeGreaterThan(0);

      // Verify all tests still have basic metadata
      result.tests.forEach((test) => {
        expect(test.metadata).toBeDefined();
        expect(test.metadata?.browser).toBeDefined();
        expect(typeof test.metadata?.browser).toBe("string");
        expect(Array.isArray(test.metadata?.tags)).toBe(true);
        expect(Array.isArray(test.metadata?.annotations)).toBe(true);
      });
    });
  });

  describe("ENVIRONMENT_MAPPING", () => {
    it("should have correct mappings", () => {
      expect(ENVIRONMENT_MAPPING.preview).toBe("development");
      expect(ENVIRONMENT_MAPPING.dev).toBe("development");
      expect(ENVIRONMENT_MAPPING.prod).toBe("production");
      expect(ENVIRONMENT_MAPPING.stage).toBe("staging");
      expect(ENVIRONMENT_MAPPING.test).toBe("testing");
    });
  });

  describe("extractEnvironmentData", () => {
    it("should extract valid environment.json from zip", async () => {
      const zip = new JSZip();
      const environmentData = {
        tramVersion: "ef3f368c",
        tramInfraVersion: "ad43c4e5",
        paymentsVersion: "90670f95",
        authVersion: "7bf9957e",
        nodeVersion: "v20.19.5",
        playwrightVersion: "1.52.0",
        environment: "preview",
        branch: "WS-3059",
        commit: "d37003c978dc641ef19d961b255f4a42d74702fc",
      };
      zip.file("environment.json", JSON.stringify(environmentData));

      const result = await extractEnvironmentData(zip);

      expect(result).toBeDefined();
      expect(result?.tramVersion).toBe("ef3f368c");
      expect(result?.tramInfraVersion).toBe("ad43c4e5");
      expect(result?.paymentsVersion).toBe("90670f95");
      expect(result?.authVersion).toBe("7bf9957e");
      expect(result?.nodeVersion).toBe("v20.19.5");
      expect(result?.playwrightVersion).toBe("1.52.0");
      expect(result?.environment).toBe("preview");
      expect(result?.branch).toBe("WS-3059");
      expect(result?.commit).toBe("d37003c978dc641ef19d961b255f4a42d74702fc");
    });

    it("should return undefined when environment.json is missing", async () => {
      const zip = new JSZip();
      zip.file("some-other-file.txt", "content");

      const result = await extractEnvironmentData(zip);

      expect(result).toBeUndefined();
    });

    it("should handle invalid JSON gracefully", async () => {
      const zip = new JSZip();
      zip.file("environment.json", "{ invalid json }");

      const result = await extractEnvironmentData(zip);

      expect(result).toBeUndefined();
    });

    it("should handle empty environment.json", async () => {
      const zip = new JSZip();
      zip.file("environment.json", "{}");

      const result = await extractEnvironmentData(zip);

      expect(result).toBeDefined();
      expect(Object.keys(result!).length).toBe(0);
    });

    it("should handle partial environment data", async () => {
      const zip = new JSZip();
      const partialData = {
        tramVersion: "abc123",
        nodeVersion: "v18.0.0",
      };
      zip.file("environment.json", JSON.stringify(partialData));

      const result = await extractEnvironmentData(zip);

      expect(result).toBeDefined();
      expect(result?.tramVersion).toBe("abc123");
      expect(result?.nodeVersion).toBe("v18.0.0");
      expect(result?.paymentsVersion).toBeUndefined();
    });

    it("should handle custom fields in environment data", async () => {
      const zip = new JSZip();
      const customData = {
        tramVersion: "abc123",
        customField: "customValue",
        anotherField: 12345,
      };
      zip.file("environment.json", JSON.stringify(customData));

      const result = await extractEnvironmentData(zip);

      expect(result).toBeDefined();
      expect(result?.tramVersion).toBe("abc123");
      expect(result?.customField).toBe("customValue");
      expect(result?.anotherField).toBe(12345);
    });
  });
});
