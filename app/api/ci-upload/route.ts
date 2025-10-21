import { type NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { optimizePlaywrightReport } from "@/lib/report-optimization";
import {
  processScreenshots,
  processTestsFromZip,
  lookupDatabaseIds,
  checkDuplicate,
  insertTestRun,
} from "@/lib/upload-processing";
import { mapScreenshotPaths } from "@/lib/zip-extraction-utils";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";

const LOG_PREFIX = "[CI Upload]";

/**
 * CI/CD Upload Endpoint
 *
 * This endpoint is designed for automated uploads from CI/CD pipelines.
 * It uses API key authentication instead of user authentication.
 *
 * Authentication: Bearer token (API key) in Authorization header
 *
 * Required fields:
 * - file: Playwright HTML report ZIP
 * - environment: Environment name (e.g., "production", "staging")
 * - trigger: Trigger type (e.g., "merge_queue", "pull_request")
 * - suite: Test suite name
 *
 * Optional fields:
 * - branch: Git branch name (will be auto-detected from CI metadata if not provided)
 * - commit: Git commit SHA
 * - project: Project name (defaults to project associated with API key)
 * - optimize: Whether to optimize the report (default: true)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate API key
    const authResult = await authenticateApiKey();

    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.error || "Authentication failed" },
        { status: 401 },
      );
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const initialEnvironment = formData.get("environment") as string;
    const trigger = formData.get("trigger") as string;
    const suite = formData.get("suite") as string;
    const initialBranch = (formData.get("branch") as string) || "unknown";
    const commit = (formData.get("commit") as string) || "unknown";
    const shouldOptimize = formData.get("optimize") !== "false"; // Default to true

    // Validate required fields
    if (!file || !initialEnvironment || !trigger || !suite) {
      return NextResponse.json(
        {
          error: "Missing required fields: file, environment, trigger, suite",
        },
        { status: 400 },
      );
    }

    // 3. Get project ID from API key
    const projectId = authResult.projectId;

    if (!projectId) {
      return NextResponse.json(
        { error: "API key is not associated with a project" },
        { status: 400 },
      );
    }

    console.log(`${LOG_PREFIX} Processing upload for project:`, projectId);
    console.log(
      `${LOG_PREFIX} File size:`,
      (file.size / 1024 / 1024).toFixed(2),
      "MB",
    );

    // 4. Optional server-side optimization (client should already optimize)
    let fileBuffer = Buffer.from(await file.arrayBuffer());

    if (shouldOptimize) {
      console.log(`${LOG_PREFIX} Optimizing report...`);
      const { buffer: optimizedBuffer, stats } = await optimizePlaywrightReport(
        fileBuffer,
        { verbose: true },
      );
      fileBuffer = optimizedBuffer;
      console.log(
        `${LOG_PREFIX} Optimization complete: ${(stats.originalSize / 1024 / 1024).toFixed(2)} MB -> ${(stats.optimizedSize / 1024 / 1024).toFixed(2)} MB (${stats.compressionRatio.toFixed(1)}% reduction)`,
      );
    }

    // 5. Load ZIP and process tests
    const zip = await JSZip.loadAsync(fileBuffer);
    const processedData = await processTestsFromZip(
      zip,
      initialBranch,
      initialEnvironment,
      undefined, // No pre-calculated hash
      LOG_PREFIX,
    );

    // 6. Process screenshots
    const { screenshotUrls, screenshotCount } = await processScreenshots(
      zip,
      LOG_PREFIX,
    );
    mapScreenshotPaths(processedData.tests, screenshotUrls);

    console.log(`${LOG_PREFIX} Final upload parameters:`, {
      environment: processedData.environment,
      trigger,
      suite,
      branch: processedData.branch,
      commit,
    });

    // 7. Store in database
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log(`${LOG_PREFIX} Supabase not configured, skipping database storage`);
      return NextResponse.json({
        success: true,
        testRun: {
          id: crypto.randomUUID(),
          timestamp: processedData.timestamp,
          environment: processedData.environment,
          trigger,
          suite,
          branch: processedData.branch,
          commit,
          ...processedData.stats,
          duration: processedData.durationFormatted,
        },
        message: `Processed ${processedData.tests.length} tests with ${screenshotCount} screenshots`,
        warning: "Database not configured - results not persisted",
      });
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // 8. Look up database IDs
    const idsResult = await lookupDatabaseIds({
      supabase,
      projectId,
      environment: processedData.environment,
      trigger,
      suite,
      logPrefix: LOG_PREFIX,
    });

    if (!idsResult.success || !idsResult.data) {
      return NextResponse.json(
        { error: idsResult.error!.message },
        { status: idsResult.error!.status },
      );
    }

    const databaseIds = idsResult.data;

    // 9. Check for duplicate
    const duplicateResult = await checkDuplicate({
      supabase,
      contentHash: processedData.contentHash,
      projectId,
      logPrefix: LOG_PREFIX,
    });

    if (duplicateResult.isDuplicate && duplicateResult.existingRun) {
      const existingTime = new Date(
        duplicateResult.existingRun.timestamp,
      ).toLocaleString();
      return NextResponse.json(
        {
          error: "Duplicate upload detected",
          message: `This exact test run was already uploaded on ${existingTime}.`,
          existingRunId: duplicateResult.existingRun.id,
          isDuplicate: true,
        },
        { status: 409 },
      );
    }

    // 10. Insert test run and all related data
    const insertResult = await insertTestRun({
      supabase,
      databaseIds,
      processedData,
      commit,
      filename: file.name,
      logPrefix: LOG_PREFIX,
    });

    if (!insertResult.success || !insertResult.testRunId) {
      return NextResponse.json(
        {
          error: "Failed to store test results",
          details: insertResult.error,
        },
        { status: 500 },
      );
    }

    // 11. Return success response
    return NextResponse.json({
      success: true,
      testRunId: insertResult.testRunId,
      testRun: {
        id: insertResult.testRunId,
        timestamp: processedData.timestamp,
        environment: processedData.environment,
        trigger,
        suite,
        branch: processedData.branch,
        commit,
        ...processedData.stats,
        duration: processedData.durationFormatted,
      },
      message: `Successfully uploaded ${processedData.tests.length} tests (${processedData.stats.passed} passed, ${processedData.stats.failed} failed)`,
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
