import JSZip from "jszip";
import { extractTestsFromZip as extractFromZip } from "./upload/zip-extraction-utils";
import { type ExtractedTest } from "@/types/extracted-test";

export interface ProcessedReport {
  tests: ExtractedTest[];
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

export async function calculateContentHash(
  tests: ExtractedTest[],
): Promise<string> {
  const hashContent = {
    tests: tests
      .map((test) => ({
        name: test.name,
        file: test.file,
        status: test.status,
        duration: test.duration,
        started_at: test.started_at,
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
