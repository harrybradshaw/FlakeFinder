import JSZip from "jszip";
import {
  HTMLReportTestFileSchema,
  PlaywrightReportSchema,
  type PlaywrightReport,
  type TestResult as PlaywrightTestResult,
} from "@/lib/playwright-schema";
import { ZodError } from "zod";
import {
  type TestAttempt,
  type TestResult,
} from "@/lib/playwright-report-utils";

/**
 * Test status type
 */
export type TestStatus = "passed" | "failed" | "flaky" | "skipped" | "timedOut";

/**
 * Extracted test result - extends TestResult from playwright-report-utils
 * with additional fields needed for upload API
 */
export type ExtractedTest = TestResult & {
  metadata?: {
    browser?: string;
    tags?: string[];
    annotations?: any[];
    epic?: string;
    labels?: Array<{ name: string; value: string }>;
    parameters?: Array<{ name: string; value: string }>;
    description?: string;
    descriptionHtml?: string;
  };
};

/**
 * CI metadata extracted from report
 */
export interface CIMetadata {
  branch?: string;
  commit?: string;
  prTitle?: string;
  prHref?: string;
  [key: string]: any;
}

/**
 * Report extraction result
 */
export interface ExtractionResult {
  tests: ExtractedTest[];
  ciMetadata?: CIMetadata;
  testExecutionTime?: string;
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

/**
 * Extracts tests from HTML report format (with embedded ZIP)
 */
export async function extractTestsFromHtmlReport(
  zip: JSZip,
): Promise<ExtractionResult> {
  const htmlFile = zip.file("index.html");
  if (!htmlFile) {
    throw new Error("No index.html found in ZIP");
  }

  const htmlContent = await htmlFile.async("string");

  // Extract base64-encoded zip from HTML
  const match = htmlContent.match(/window\.playwrightReportBase64 = "([^"]+)"/);
  if (!match) {
    throw new Error("No embedded report found in HTML");
  }

  const dataUri = match[1];
  const base64Data = dataUri.replace("data:application/zip;base64,", "");
  const embeddedBuffer = Buffer.from(base64Data, "base64");
  const embeddedZip = await JSZip.loadAsync(new Uint8Array(embeddedBuffer));

  const tests: ExtractedTest[] = [];
  let ciMetadata: CIMetadata | undefined;
  let testExecutionTime: string | undefined;

  // Extract CI metadata and test execution time from report.json
  const reportFile = embeddedZip.file("report.json");
  if (reportFile) {
    const reportContent = await reportFile.async("string");
    const reportData = JSON.parse(reportContent);

    if (reportData.metadata?.ci) {
      ciMetadata = reportData.metadata.ci;
    }

    // Get the test execution start time
    if (reportData.startTime) {
      if (typeof reportData.startTime === "number") {
        testExecutionTime = new Date(reportData.startTime).toISOString();
      } else {
        testExecutionTime = reportData.startTime;
      }
    }
  }

  // Extract metadata from .dat files (from outer ZIP, not embedded)
  const metadataMap = await extractMetadataFromDatFiles(zip);

  // Extract tests from individual test files
  for (const fileName of Object.keys(embeddedZip.files)) {
    // Skip macOS metadata files
    if (fileName.startsWith("__MACOSX/")) continue;

    if (!fileName.endsWith(".json")) continue;

    // Skip report.json - it's metadata, not a test file
    if (fileName === "report.json") continue;

    const fileContent = await embeddedZip.file(fileName)?.async("string");
    if (!fileContent) continue;

    let testFile;
    let parsedFile;
    try {
      parsedFile = JSON.parse(fileContent);
      testFile = HTMLReportTestFileSchema.parse(parsedFile);
    } catch (error) {
      if (error instanceof ZodError) {
        console.warn(
          `Invalid test file structure in ${fileName}:`,
          JSON.stringify(error.errors, null, 2),
        );
        // Try to continue with raw parsed file if it has basic structure
        if (parsedFile && parsedFile.tests) {
          testFile = parsedFile;
        } else {
          continue;
        }
      } else {
        console.warn(`Error parsing file ${fileName}:`, error);
        continue;
      }
    }

    // Process tests from this file
    if (testFile.tests && Array.isArray(testFile.tests)) {
      for (const test of testFile.tests) {
        const testResults: TestAttempt[] =
          test.results?.map((result: PlaywrightTestResult, index: number) => {
            const screenshots: string[] = [];
            const attachments: Array<{
              name: string;
              contentType: string;
              content: string;
            }> = [];

            // Extract all attachments
            if (result.attachments) {
              for (const attachment of result.attachments) {
                if (
                  attachment.contentType?.startsWith("image/") &&
                  attachment.path
                ) {
                  screenshots.push(attachment.path);
                } else if (
                  attachment.body &&
                  !attachment.contentType?.startsWith("image/")
                ) {
                  attachments.push({
                    name: attachment.name || "Attachment",
                    contentType: attachment.contentType || "text/plain",
                    content: attachment.body,
                  });
                }
              }
            }

            let errorMessage = undefined;
            let errorStack = undefined;
            if (result.errors && result.errors.length > 0) {
              errorMessage = result.errors[0];
              errorStack = result.errors.join("\n\n");
            }

            // Extract steps - handle both array format and string references
            let steps: any[] = [];
            if (result.steps && Array.isArray(result.steps)) {
              // Steps are embedded directly
              steps = result.steps;
            }

            return {
              retryIndex: result.retry || index,
              status: result.status,
              duration: result.duration || 0,
              error: errorMessage,
              errorStack: errorStack,
              screenshots,
              attachments,
              startTime: result.startTime,
              steps: steps,
            };
          }) || [];

        const lastResult: PlaywrightTestResult | undefined =
          test.results?.[test.results.length - 1];
        if (lastResult) {
          const screenshots: string[] = [];

          // Extract screenshot paths from final attempt
          if (lastResult.attachments) {
            for (const attachment of lastResult.attachments) {
              if (
                attachment.contentType?.startsWith("image/") &&
                attachment.path
              ) {
                screenshots.push(attachment.path);
              }
            }
          }

          // Extract error from final result
          let finalError: string | undefined = undefined;
          if (lastResult.errors && lastResult.errors.length > 0) {
            finalError = lastResult.errors[0];
          }

          // Calculate total duration as sum of all attempts
          const totalDuration =
            test.results?.reduce(
              (sum: number, result) => sum + (result.duration || 0),
              0,
            ) || 0;

          // Extract tags from annotations
          const tags: string[] =
            test.annotations
              ?.filter((a) => a.type === "tag")
              ?.map((a) => a.description!)
              ?.filter(Boolean) || [];

          // Collect metadata from Allure Metadata attachments (.dat files)
          const allureMetadata: {
            labels: { name: string; value: string }[];
            parameters: { name: string; value: string }[];
            description?: string;
            descriptionHtml?: string;
          } = {
            labels: [],
            parameters: [],
            description: undefined,
            descriptionHtml: undefined,
          };

          if (lastResult.attachments) {
            for (const attachment of lastResult.attachments) {
              if (
                attachment.contentType ===
                  "application/vnd.allure.message+json" &&
                attachment.path
              ) {
                // Extract key from path (e.g., "data/61a9ec8bbb26ef04fe48954a7f61298611bc9428.dat" -> "data/61a9ec8bbb26ef04fe48954a7f61298611bc9428")
                const fileKey = attachment.path.replace(/\.dat$/, "");
                const metadata = metadataMap.get(fileKey);

                if (metadata) {
                  // Merge labels (epic, tags, etc.)
                  if (metadata.labels && Array.isArray(metadata.labels)) {
                    allureMetadata.labels.push(...metadata.labels);
                  }
                  // Merge parameters
                  if (
                    metadata.parameters &&
                    Array.isArray(metadata.parameters)
                  ) {
                    allureMetadata.parameters.push(...metadata.parameters);
                  }
                  // Use first description found
                  if (metadata.description && !allureMetadata.description) {
                    allureMetadata.description = metadata.description;
                  }
                  if (
                    metadata.descriptionHtml &&
                    !allureMetadata.descriptionHtml
                  ) {
                    allureMetadata.descriptionHtml = metadata.descriptionHtml;
                  }
                }
              }
            }
          }

          // Extract epic from labels
          const epic = allureMetadata.labels.find(
            (l) => l.name === "epic",
          )?.value;

          tests.push({
            id: test.testId,
            name: test.title,
            status: determineTestStatus(test.outcome, lastResult.status),
            duration: totalDuration,
            file: test.location?.file || testFile.fileName || "unknown",
            worker_index: lastResult.workerIndex,
            started_at: lastResult.startTime,
            error: finalError,
            screenshots,
            attempts: testResults,
            metadata: {
              browser: test.projectName,
              tags: tags,
              annotations: test.annotations || [],
              epic: epic,
              labels:
                allureMetadata.labels.length > 0
                  ? allureMetadata.labels
                  : undefined,
              parameters:
                allureMetadata.parameters.length > 0
                  ? allureMetadata.parameters
                  : undefined,
              description: allureMetadata.description,
              descriptionHtml: allureMetadata.descriptionHtml,
            },
          });
        }
      }
    }
  }

  return { tests, ciMetadata, testExecutionTime };
}

/**
 * Extracts tests from JSON report format (legacy)
 */
export async function extractTestsFromJsonReport(
  zip: JSZip,
): Promise<ExtractionResult> {
  const tests: ExtractedTest[] = [];

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

  return { tests };
}

/**
 * Main extraction function - detects format and extracts tests
 */
export async function extractTestsFromZip(
  zip: JSZip,
): Promise<ExtractionResult> {
  // Check if this is an HTML report format
  const htmlFile = zip.file("index.html");
  if (htmlFile) {
    return extractTestsFromHtmlReport(zip);
  }

  // Try the old JSON format
  return extractTestsFromJsonReport(zip);
}

/**
 * Finds screenshot files in a ZIP
 */
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

/**
 * Maps screenshot paths to URLs/base64
 */
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
