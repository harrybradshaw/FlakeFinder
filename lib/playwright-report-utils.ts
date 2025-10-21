import JSZip from "jszip";
import { extractTestsFromZip as extractFromZip } from "./zip-extraction-utils";

// Core domain models and types
export interface TestAttempt {
  retryIndex: number;
  status: string;
  duration: number;
  error?: string;
  errorStack?: string;
  screenshots: string[];
  attachments?: Array<{
    name: string;
    contentType: string;
    content: string;
  }>;
  startTime?: string;
}

export interface TestResult {
  id: string;
  name: string;
  status: string;
  duration: number;
  file: string;
  error?: string;
  errorStack?: string;
  screenshots: string[];
  attempts?: TestAttempt[];
  annotations?: TestAnnotation[];
  location?: TestLocation;
  worker_index?: number;
  started_at?: string;
}

export interface TestLocation {
  file: string;
  line: number;
  column: number;
}

export interface TestAnnotation {
  type: string;
  description?: string;
}

export interface ProcessedReport {
  tests: TestResult[];
  metadata?: Record<string, any>;
}

export class ReportProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ReportProcessingError";
  }
}

/**
 * Calculate a content hash for duplicate detection
 * This hash is based ONLY on the intrinsic test execution data,
 * NOT on user-selected metadata like environment, trigger, or branch.
 *
 * @param tests - Array of test results
 * @returns SHA-256 hash as hex string
 */
export async function calculateContentHash(
  tests: TestResult[],
): Promise<string> {
  const hashContent = {
    tests: tests
      .map((test) => ({
        name: test.name,
        file: test.file,
        status: test.status,
        duration: test.duration, // Include duration to detect re-runs
        started_at: test.started_at, // Include timestamp to detect re-runs
      }))
      .sort((a, b) =>
        `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
      ),
  };

  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(hashContent)),
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/**
 * Main function to process a Playwright report file
 * Uses shared extraction logic from zip-extraction-utils for consistency
 */
export async function processPlaywrightReportFile(
  file: File,
): Promise<ProcessedReport> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const result = await extractFromZip(zip);

  return {
    tests: result.tests,
    metadata: result.ciMetadata,
  };
}
