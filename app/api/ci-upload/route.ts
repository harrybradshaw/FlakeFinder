import { type NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { optimizePlaywrightReport } from "@/lib/upload/report-optimization";
import { processUpload } from "@/lib/upload/shared-upload-handler";

// Helper to convert Buffer to Uint8Array for JSZip (TS 5.9 compatibility)
const toUint8Array = (buffer: Buffer): Uint8Array => new Uint8Array(buffer);

const LOG_PREFIX = "[CI Upload]";

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateApiKey();

    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.error || "Authentication failed" },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const initialEnvironment = formData.get("environment") as string;
    const trigger = formData.get("trigger") as string;
    const initialBranch = (formData.get("branch") as string) || "unknown";
    const commit = (formData.get("commit") as string) || "unknown";
    const shouldOptimize = formData.get("optimize") !== "false";

    if (!file || !initialEnvironment || !trigger) {
      return NextResponse.json(
        {
          error: "Missing required fields: file, environment, trigger",
        },
        { status: 400 },
      );
    }

    const projectId = authResult.projectId;
    const suiteId = authResult.suiteId;

    if (!projectId) {
      return NextResponse.json(
        { error: "API key is not associated with a project" },
        { status: 400 },
      );
    }

    if (!suiteId) {
      return NextResponse.json(
        { error: "API key is not associated with a suite" },
        { status: 400 },
      );
    }

    console.log(`${LOG_PREFIX} Processing upload for project:`, projectId);

    let fileBuffer = Buffer.from(await file.arrayBuffer());

    if (shouldOptimize) {
      console.log(`${LOG_PREFIX} Optimizing report...`);
      const { buffer: optimizedBuffer } = await optimizePlaywrightReport(
        fileBuffer,
        { verbose: true },
      );
      fileBuffer = optimizedBuffer;
    }

    const zip = await JSZip.loadAsync(toUint8Array(fileBuffer));

    const result = await processUpload(
      zip,
      {
        environment: initialEnvironment,
        trigger: trigger,
        suite: suiteId,
        branch: initialBranch,
        commit,
      },
      projectId,
      file.name,
      LOG_PREFIX,
    );

    if (!result.success) {
      const status = result.isDuplicate ? 409 : 500;
      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
          details: result.details,
          isDuplicate: result.isDuplicate,
          existingRunId: result.existingRunId,
        },
        { status },
      );
    }

    return NextResponse.json({
      success: true,
      testRunId: result.testRunId,
      testRun: result.testRun,
      message: result.message,
      optimized: shouldOptimize,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing upload:`, error);
    return NextResponse.json(
      {
        error: "Failed to process upload",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
