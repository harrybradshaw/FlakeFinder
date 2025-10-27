import type JSZip from "jszip";
import {
  PlaywrightReportSchema,
  type PlaywrightReport,
} from "@/lib/playwright-schema";
import { ZodError } from "zod";
import { extractTestsFromHtmlReport } from "@/lib/upload/extract-tests-from-html-report";
import { type ExtractedTest } from "@/types/extracted-test";

/**
 * Test status type
 */
export type TestStatus = "passed" | "failed" | "flaky" | "skipped" | "timedOut";

export interface CIMetadata {
  branch?: string;
  commit?: string;
  prTitle?: string;
  prHref?: string;
  [key: string]: any;
}

export interface EnvironmentData {
  tramVersion?: string;
  tramInfraVersion?: string;
  paymentsVersion?: string;
  authVersion?: string;
  nodeVersion?: string;
  playwrightVersion?: string;
  environment?: string;
  branch?: string;
  commit?: string;
  [key: string]: any;
}

/**
 * Report extraction result
 */
export interface ExtractionResult {
  tests: ExtractedTest[];
  ciMetadata?: CIMetadata;
  testExecutionTime?: string;
  environmentData?: EnvironmentData;
}

/**
 * Environment mapping configuration
 */
export const ENVIRONMENT_MAPPING: Record<string, string> = {
  preview: "development",
  dev: "development",
  prod: "production",
  stage: "staging",
  test: "testing",
};

/**
 * Determines test status based on outcome and result
 */
export function determineTestStatus(
  outcome: string,
  lastResultStatus: string,
): TestStatus {
  if (lastResultStatus === "skipped") {
    return "skipped";
  } else if (outcome === "expected") {
    return lastResultStatus as TestStatus;
  } else if (outcome === "flaky") {
    return "flaky";
  } else {
    return "failed";
  }
}

/**
 * Extracts branch from CI metadata with fallback strategies
 */
export function extractBranchFromCI(
  ciMetadata: CIMetadata,
  fallbackBranch: string = "unknown",
): string {
  const MAX_BRANCH_LENGTH = 60;

  // Helper to sanitize and truncate branch names
  const sanitizeBranch = (branch: string): string => {
    // Remove special characters that might cause issues
    const sanitized = branch.replace(/[^a-zA-Z0-9-_/]/g, "-");
    // Truncate if too long
    return sanitized.length > MAX_BRANCH_LENGTH
      ? sanitized.substring(0, MAX_BRANCH_LENGTH) + "..."
      : sanitized;
  };

  // If user explicitly provided a branch (not "unknown"), respect it
  if (fallbackBranch && fallbackBranch !== "unknown") {
    return sanitizeBranch(fallbackBranch);
  }

  // Try standard CI environment variables
  let detectedBranch =
    ciMetadata.GITHUB_HEAD_REF || // GitHub PR branch
    ciMetadata.GITHUB_REF_NAME || // GitHub branch/tag name
    ciMetadata.BRANCH ||
    ciMetadata.GIT_BRANCH ||
    ciMetadata.CI_COMMIT_BRANCH ||
    null;

  // If we have PR metadata but no branch, extract from PR title
  if (!detectedBranch && ciMetadata.prTitle) {
    // Try to extract ticket/issue key from PR title (e.g., "WS-2938: Fix something" -> "WS-2938")
    const ticketMatch = ciMetadata.prTitle.match(/^([A-Z]+-\d+)/);
    if (ticketMatch) {
      detectedBranch = ticketMatch[1];
    } else {
      // Use the PR title directly (sanitized)
      // Remove the colon and everything after for cleaner names
      const titlePart = ciMetadata.prTitle.split(":")[0].trim();
      if (titlePart) {
        detectedBranch = titlePart;
      } else {
        // Last resort: use PR number from URL
        const prMatch = ciMetadata.prHref?.match(/\/pull\/(\d+)$/);
        if (prMatch) {
          detectedBranch = `pr-${prMatch[1]}`;
        }
      }
    }
  }

  return detectedBranch ? sanitizeBranch(detectedBranch) : fallbackBranch;
}

/**
 * Normalizes environment name using mapping
 */
export function normalizeEnvironment(environment: string): string {
  const normalizedEnv = environment.toLowerCase();
  return ENVIRONMENT_MAPPING[normalizedEnv] || environment;
}

/**
 * Extracts environment data from environment.json in a ZIP
 */
export async function extractEnvironmentData(
  zip: JSZip,
): Promise<EnvironmentData | undefined> {
  const environmentFile = zip.file("environment.json");
  if (!environmentFile) {
    return undefined;
  }

  try {
    const content = await environmentFile.async("string");
    const data = JSON.parse(content);
    return data as EnvironmentData;
  } catch (e) {
    console.warn("Failed to parse environment.json:", e);
    return undefined;
  }
}

/**
 * Extracts metadata from .dat files in a ZIP
 */
export async function extractMetadataFromDatFiles(
  zip: JSZip,
): Promise<Map<string, any>> {
  const metadataMap = new Map<string, any>();

  for (const fileName of Object.keys(zip.files)) {
    // Skip macOS metadata files
    if (fileName.startsWith("__MACOSX/")) {
      continue;
    }

    if (fileName.endsWith(".dat")) {
      const datContent = await zip.file(fileName)?.async("string");
      if (datContent) {
        try {
          const datData = JSON.parse(datContent);
          if (datData.type === "metadata" && datData.data) {
            // Use file hash as key (remove .dat extension)
            const fileHash = fileName.replace(".dat", "");
            metadataMap.set(fileHash, datData.data);
          }
        } catch (e) {
          // Skip invalid JSON
          console.warn(`Failed to parse metadata file ${fileName}:`, e);
        }
      }
    }
  }

  return metadataMap;
}

export async function extractTestsFromJsonReport(
  zip: JSZip,
): Promise<ExtractionResult> {
  const tests: ExtractedTest[] = [];

  // Extract environment data
  const environmentData = await extractEnvironmentData(zip);

  const reportFile =
    zip.file(/data\/.*\.json$/)?.[0] || zip.file("report.json");

  if (!reportFile) {
    throw new Error("No report.json found in ZIP");
  }

  const reportContent = await reportFile.async("string");
  const parsedReport = JSON.parse(reportContent);

  let reportData: PlaywrightReport;
  try {
    reportData = PlaywrightReportSchema.parse(parsedReport);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(
        `Invalid Playwright report format: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
      );
    }
    throw error;
  }

  if (reportData && reportData.suites) {
    // Flatten all tests from all suites
    const extractTests = (suites: PlaywrightReport["suites"]): void => {
      for (const suite of suites) {
        for (const spec of suite.specs ?? []) {
          const result = spec.results[spec.results.length - 1];
          const screenshots: string[] = [];

          // Extract screenshot paths from attachments
          for (const attachment of result.attachments || []) {
            if (
              attachment.contentType.startsWith("image/") &&
              attachment.path
            ) {
              screenshots.push(attachment.path);
            }
          }

          // Calculate total duration as sum of all attempts (retries)
          const totalDuration = spec.results.reduce(
            (sum: number, r) => sum + (r.duration || 0),
            0,
          );

          // Extract tags from annotations
          const tags =
            spec.annotations
              ?.filter((a) => a.type === "tag")
              ?.map((a) => a.description!)
              ?.filter(Boolean) || [];

          tests.push({
            id: spec.testId,
            name: spec.title,
            status: determineTestStatus(spec.outcome, result.status),
            duration: totalDuration,
            file: spec.location?.file ?? "unknown",
            error: result.error?.message,
            attempts: [],
            screenshots,
            metadata: {
              browser: spec.projectName,
              tags: tags,
              annotations: spec.annotations || [],
            },
          });
        }

        // Recursively process nested suites
        if (suite.suites) {
          extractTests(suite.suites);
        }
      }
    };

    extractTests(reportData.suites);
  }

  return { tests, environmentData };
}

export async function extractTestsFromZip(
  zip: JSZip,
): Promise<ExtractionResult> {
  // Check if this is an HTML report format
  const htmlFile = zip.file("index.html");
  if (htmlFile) {
    return extractTestsFromHtmlReport(zip);
  }

  return extractTestsFromJsonReport(zip);
}

export function findScreenshotFiles(zip: JSZip): string[] {
  return Object.keys(zip.files).filter(
    (path) =>
      !path.startsWith("__MACOSX/") &&
      path.startsWith("data/") &&
      (path.endsWith(".png") ||
        path.endsWith(".jpg") ||
        path.endsWith(".jpeg")),
  );
}

export function mapScreenshotPaths(
  tests: ExtractedTest[],
  screenshotUrls: Record<string, string>,
): void {
  for (const test of tests) {
    const originalScreenshotCount = test.screenshots.length;
    test.screenshots = test.screenshots
      .map((path) => {
        // Try original path first, then try with .jpg extension (for compressed images)
        const url =
          screenshotUrls[path] ||
          screenshotUrls[path.replace(/\.png$/, ".jpg")];
        if (!url) {
          console.warn(
            `Screenshot not found: ${path} (tried .jpg variant too)`,
          );
        }
        return url;
      })
      .filter(Boolean);

    if (originalScreenshotCount > 0 && test.screenshots.length === 0) {
      console.error(
        `Test "${test.name}" lost all ${originalScreenshotCount} screenshots!`,
      );
    }

    // Also map attempt screenshots
    if (test.attempts) {
      for (const attempt of test.attempts) {
        attempt.screenshots = attempt.screenshots
          .map((path) => {
            return (
              screenshotUrls[path] ||
              screenshotUrls[path.replace(/\.png$/, ".jpg")]
            );
          })
          .filter(Boolean);
      }
    }
  }
}

/**
 * Calculates test run statistics
 */
export function calculateTestStats(tests: ExtractedTest[]) {
  return {
    total: tests.filter((t) => t.status !== "skipped").length,
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed").length,
    flaky: tests.filter((t) => t.status === "flaky").length,
    skipped: tests.filter((t) => t.status === "skipped").length,
  };
}

/**
 * Formats duration from milliseconds to "Xm Ys" format
 */
export function formatDuration(durationMs: number): string {
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.floor((durationMs % 60000) / 1000);
  return `${durationMinutes}m ${durationSeconds}s`;
}
