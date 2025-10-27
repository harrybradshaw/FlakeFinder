import JSZip from "jszip";
import {
  type HTMLReportTestFile,
  HTMLReportTestFileSchema,
  type PlaywrightTestResult,
} from "@/lib/playwright-schema";
import { ZodError } from "zod";
import {
  type CIMetadata,
  determineTestStatus,
  extractEnvironmentData,
  type ExtractionResult,
  extractMetadataFromDatFiles,
} from "@/lib/upload/zip-extraction-utils";
import {
  type ExtractedTest,
  type ExtractedTestAttempt,
} from "@/types/extracted-test";

export async function extractTestsFromHtmlReport(
  zip: JSZip,
): Promise<ExtractionResult> {
  const htmlFile = zip.file("index.html");
  if (!htmlFile) {
    throw new Error("No index.html found in ZIP");
  }

  const htmlContent = await htmlFile.async("string");
  const match = htmlContent.match(/window\.playwrightReportBase64 = "([^"]+)"/);
  if (!match) {
    throw new Error("No embedded report found in HTML");
  }

  const dataUri = match[1];
  const base64Data = dataUri.replace("data:application/zip;base64,", "");
  const embeddedBuffer = Buffer.from(base64Data, "base64");
  const embeddedZip = await JSZip.loadAsync(new Uint8Array(embeddedBuffer));

  let ciMetadata: CIMetadata | undefined;
  let testExecutionTime: string | undefined;

  const environmentData = await extractEnvironmentData(zip);

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

  const metadataMap = await extractMetadataFromDatFiles(zip);
  const tests: ExtractedTest[] = [];

  for (const fileName of Object.keys(embeddedZip.files)) {
    // Skip macOS metadata files
    if (fileName.startsWith("__MACOSX/")) continue;

    if (!fileName.endsWith(".json")) continue;

    // Skip report.json - it's metadata, not a test file
    if (fileName === "report.json") continue;

    const fileContent = await embeddedZip.file(fileName)?.async("string");
    if (!fileContent) continue;

    let testFile: HTMLReportTestFile;
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
        throw new Error("Unable to parse test file");
      }
    }

    const testsFromFile = mapHtmlFileToTests(testFile, metadataMap);
    tests.push(...testsFromFile);
  }

  return { tests, ciMetadata, testExecutionTime, environmentData };
}

function mapTestResultToTestAttempt(
  result: PlaywrightTestResult,
  index: number,
): ExtractedTestAttempt {
  const screenshots: string[] = [];
  const attachments: Array<{
    name: string;
    contentType: string;
    content: string;
  }> = [];

  // Extract all attachments
  if (result.attachments) {
    for (const attachment of result.attachments) {
      if (attachment.contentType?.startsWith("image/") && attachment.path) {
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

  const steps = result.steps && Array.isArray(result.steps) ? result.steps : [];

  return {
    attemptIndex: index,
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
}

export function mapHtmlFileToTests(
  testFile: HTMLReportTestFile,
  metadataMap: Map<string, any>,
): ExtractedTest[] {
  return testFile.tests.map((test) => {
    const testAttempts: ExtractedTestAttempt[] =
      test.results?.map((result: PlaywrightTestResult, index: number) =>
        mapTestResultToTestAttempt(result, index),
      ) || [];

    const lastResult: PlaywrightTestResult | undefined =
      test.results?.[test.results.length - 1];

    const screenshots: string[] = [];

    if (lastResult.attachments) {
      for (const attachment of lastResult.attachments) {
        if (attachment.contentType?.startsWith("image/") && attachment.path) {
          screenshots.push(attachment.path);
        }
      }
    }

    let finalError: string | undefined = undefined;
    if (lastResult.errors && lastResult.errors.length > 0) {
      finalError = lastResult.errors[0];
    }

    const totalDuration =
      test.results?.reduce(
        (sum: number, result: PlaywrightTestResult) =>
          sum + (result.duration || 0),
        0,
      ) || 0;

    const tags: string[] =
      test.annotations
        ?.filter(
          (a: { type: string; description?: string }) => a.type === "tag",
        )
        ?.map((a: { type: string; description?: string }) => a.description!)
        ?.filter(Boolean) || [];

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
          attachment.contentType === "application/vnd.allure.message+json" &&
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
            if (metadata.parameters && Array.isArray(metadata.parameters)) {
              allureMetadata.parameters.push(...metadata.parameters);
            }
            // Use first description found
            if (metadata.description && !allureMetadata.description) {
              allureMetadata.description = metadata.description;
            }
            if (metadata.descriptionHtml && !allureMetadata.descriptionHtml) {
              allureMetadata.descriptionHtml = metadata.descriptionHtml;
            }
          }
        }
      }
    }

    const epic = allureMetadata.labels.find((l) => l.name === "epic")?.value;

    return {
      id: test.testId,
      name: test.title,
      status: determineTestStatus(test.outcome, lastResult.status),
      duration: totalDuration,
      file: test.location?.file || testFile.fileName || "unknown",
      worker_index: lastResult.workerIndex,
      started_at: lastResult.startTime,
      error: finalError,
      location: test.location,
      screenshots,
      attempts: testAttempts,
      metadata: {
        browser: test.projectName,
        tags: tags,
        annotations: test.annotations || [],
        epic: epic,
        labels:
          allureMetadata.labels.length > 0 ? allureMetadata.labels : undefined,
        parameters:
          allureMetadata.parameters.length > 0
            ? allureMetadata.parameters
            : undefined,
        description: allureMetadata.description,
        descriptionHtml: allureMetadata.descriptionHtml,
      },
    };
  });
}
