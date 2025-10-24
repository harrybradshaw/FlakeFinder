import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import {
  processPlaywrightReportFile,
  ReportProcessingError,
} from "./playwright-report-utils";

describe("playwright-report-utils", () => {
  let testReportFile: File;

  beforeAll(async () => {
    // Load the sample test report
    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    testReportFile = new File([buffer], "playwright-report-testing-466.zip", {
      type: "application/zip",
    });
  });

  describe("processPlaywrightReportFile", () => {
    it("should successfully process a valid Playwright HTML report", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      expect(result).toBeDefined();
      expect(result.tests).toBeDefined();
      expect(Array.isArray(result.tests)).toBe(true);
      expect(result.tests.length).toBeGreaterThan(0);
    });

    it("should extract test metadata correctly", async () => {
      const result = await processPlaywrightReportFile(testReportFile);
      const firstTest = result.tests[0];

      expect(firstTest).toHaveProperty("id");
      expect(firstTest).toHaveProperty("name");
      expect(firstTest).toHaveProperty("status");
      expect(firstTest).toHaveProperty("duration");
      expect(firstTest).toHaveProperty("file");
      expect(firstTest).toHaveProperty("screenshots");
    });

    it("should extract test status correctly", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      const statuses = result.tests.map((t) => t.status);
      const validStatuses = [
        "passed",
        "failed",
        "flaky",
        "skipped",
        "timedOut",
      ];

      statuses.forEach((status) => {
        expect(validStatuses).toContain(status);
      });
    });

    it("should extract retry results for flaky tests", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      const flakyTests = result.tests.filter((t) => t.status === "flaky");

      if (flakyTests.length > 0) {
        const flakyTest = flakyTests[0];
        expect(flakyTest.attempts).toBeDefined();
        expect(Array.isArray(flakyTest.attempts)).toBe(true);

        if (flakyTest.attempts && flakyTest.attempts.length > 0) {
          const retry = flakyTest.attempts[0];
          expect(retry).toHaveProperty("retryIndex");
          expect(retry).toHaveProperty("status");
          expect(retry).toHaveProperty("duration");
        }
      }
    });

    it("should extract error messages for failed tests", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      const failedTests = result.tests.filter((t) => t.status === "failed");

      if (failedTests.length > 0) {
        const failedTest = failedTests[0];
        // Failed tests should have error information
        expect(
          failedTest.error !== undefined || failedTest.errorStack !== undefined,
        ).toBe(true);
      }
    });

    it("should extract screenshot paths", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      const testsWithScreenshots = result.tests.filter(
        (t) => t.screenshots.length > 0,
      );

      if (testsWithScreenshots.length > 0) {
        const testWithScreenshot = testsWithScreenshots[0];
        expect(Array.isArray(testWithScreenshot.screenshots)).toBe(true);
        expect(testWithScreenshot.screenshots[0]).toMatch(/\.(png|jpg|jpeg)$/);
      }
    });

    it("should extract test location information", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      const testsWithLocation = result.tests.filter((t) => t.location);

      if (testsWithLocation.length > 0) {
        const test = testsWithLocation[0];
        expect(test.location).toHaveProperty("file");
        expect(test.location).toHaveProperty("line");
        expect(test.location).toHaveProperty("column");
      }
    });

    it("should extract worker index and start time", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      const testsWithWorkerInfo = result.tests.filter(
        (t) => t.worker_index !== undefined,
      );

      if (testsWithWorkerInfo.length > 0) {
        const test = testsWithWorkerInfo[0];
        expect(typeof test.worker_index).toBe("number");
      }

      const testsWithStartTime = result.tests.filter((t) => t.started_at);

      if (testsWithStartTime.length > 0) {
        const test = testsWithStartTime[0];
        expect(typeof test.started_at).toBe("string");
        // Should be a valid ISO date string
        expect(() => new Date(test.started_at!)).not.toThrow();
      }
    });

    it("should extract CI metadata if available", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      // Metadata is optional
      if (result.metadata) {
        expect(typeof result.metadata).toBe("object");
      }
    });

    it("should handle retry results with attachments", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      const testsWithRetries = result.tests.filter(
        (t) => t.attempts && t.attempts.length > 0,
      );

      if (testsWithRetries.length > 0) {
        const test = testsWithRetries[0];
        const retry = test.attempts![0];

        expect(retry).toHaveProperty("screenshots");
        expect(Array.isArray(retry.screenshots)).toBe(true);

        if (retry.attachments) {
          expect(Array.isArray(retry.attachments)).toBe(true);

          if (retry.attachments.length > 0) {
            const attachment = retry.attachments[0];
            expect(attachment).toHaveProperty("name");
            expect(attachment).toHaveProperty("contentType");
            expect(attachment).toHaveProperty("content");
          }
        }
      }
    });

    it("should throw ReportProcessingError for invalid files", async () => {
      const invalidFile = new File(["invalid content"], "invalid.zip", {
        type: "application/zip",
      });

      await expect(processPlaywrightReportFile(invalidFile)).rejects.toThrow();
    });

    it("should handle invalid report format", async () => {
      // Create a ZIP with invalid structure (no index.html or report.json)
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file("empty.json", JSON.stringify({ tests: [] }));

      const buffer = await zip.generateAsync({ type: "nodebuffer" });
      const invalidFile = new File([buffer], "invalid.zip", {
        type: "application/zip",
      });

      // Should throw error for invalid format
      await expect(processPlaywrightReportFile(invalidFile)).rejects.toThrow(
        "No report.json found in ZIP",
      );
    });
  });

  describe("Test result structure validation", () => {
    it("should have consistent test result structure", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      result.tests.forEach((test) => {
        // Required fields
        expect(test.id).toBeDefined();
        expect(test.name).toBeDefined();
        expect(test.status).toBeDefined();
        expect(typeof test.duration).toBe("number");
        expect(test.file).toBeDefined();
        expect(Array.isArray(test.screenshots)).toBe(true);

        // Optional fields should have correct types if present
        if (test.error !== undefined) {
          expect(typeof test.error).toBe("string");
        }

        if (test.errorStack !== undefined) {
          expect(typeof test.errorStack).toBe("string");
        }

        if (test.attempts !== undefined) {
          expect(Array.isArray(test.attempts)).toBe(true);
        }

        if (test.worker_index !== undefined) {
          expect(typeof test.worker_index).toBe("number");
        }

        if (test.started_at !== undefined) {
          expect(typeof test.started_at).toBe("string");
        }
      });
    });

    it("should calculate duration as sum of all retry attempts", async () => {
      const result = await processPlaywrightReportFile(testReportFile);

      // Find a flaky test (which has multiple attempts)
      const flakyTests = result.tests.filter((t) => t.status === "flaky");

      if (flakyTests.length > 0) {
        const flakyTest = flakyTests[0];

        // If test has retry results, duration should be sum of all attempts
        if (flakyTest.attempts && flakyTest.attempts.length > 0) {
          const sumOfRetries = flakyTest.attempts.reduce(
            (sum, retry) => sum + retry.duration,
            0,
          );

          console.log("Flaky test:", flakyTest.name);
          console.log("Test duration:", flakyTest.duration);
          console.log("Sum of retry durations:", sumOfRetries);
          console.log("Number of retries:", flakyTest.attempts.length);

          // Duration should equal the sum of all retry attempts
          expect(flakyTest.duration).toBe(sumOfRetries);
        }
      }
    });
  });

  describe("ReportProcessingError", () => {
    it("should create error with code", () => {
      const error = new ReportProcessingError("Test error", "TEST_CODE");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.name).toBe("ReportProcessingError");
      expect(error instanceof Error).toBe(true);
    });
  });
});
