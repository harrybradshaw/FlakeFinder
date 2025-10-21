import { type NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  processScreenshots,
  processTestsFromZip,
  lookupDatabaseIds,
  verifyUserProjectAccess,
  checkDuplicate,
  insertTestRun,
} from "@/lib/upload-processing";
import { mapScreenshotPaths } from "@/lib/zip-extraction-utils";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";

const LOG_PREFIX = "[Upload]";

/**
 * User Upload Endpoint
 *
 * This endpoint handles uploads from authenticated users via the web UI.
 * It uses Clerk for user authentication and verifies organization access.
 *
 * Required fields:
 * - file: Playwright HTML report ZIP
 * - environment: Environment name (e.g., "production", "staging")
 * - trigger: Trigger type (e.g., "manual", "ci")
 * - suite: Test suite name
 *
 * Optional fields:
 * - branch: Git branch name (auto-detected from CI metadata if available)
 * - commit: Git commit SHA
 * - project: Project name (defaults to "default")
 * - contentHash: Pre-calculated content hash (from client-side optimization)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via Clerk
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 },
      );
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectName = (formData.get("project") as string) || "default";
    const initialEnvironment = formData.get("environment") as string;
    const trigger = formData.get("trigger") as string;
    const suite = formData.get("suite") as string;
    const initialBranch = (formData.get("branch") as string) || "unknown";
    const commit = (formData.get("commit") as string) || "unknown";
    const preCalculatedHash = formData.get("contentHash") as string | null;

    // Validate required fields
    if (!file || !initialEnvironment || !trigger || !suite) {
      return NextResponse.json(
        {
          error: "Missing required fields: file, environment, trigger, suite",
        },
        { status: 400 },
      );
    }

    console.log(`${LOG_PREFIX} Processing upload for user:`, userId);
    console.log(`${LOG_PREFIX} Project:`, projectName);

    // 3. Set up Supabase client
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log(`${LOG_PREFIX} Supabase not configured`);
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // 4. Look up project and get database IDs
    const idsResult = await lookupDatabaseIds({
      supabase,
      projectName,
      environment: initialEnvironment,
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

    // 5. Verify user has access to this project
    const accessResult = await verifyUserProjectAccess({
      supabase,
      userId,
      projectId: databaseIds.projectId,
      projectName,
      logPrefix: LOG_PREFIX,
    });

    if (!accessResult.success) {
      return NextResponse.json(
        { error: accessResult.error!.message },
        { status: accessResult.error!.status },
      );
    }

    // 6. Load ZIP and process tests
    // Note: No server-side optimization - client already optimized
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const processedData = await processTestsFromZip(
      zip,
      initialBranch,
      initialEnvironment,
      preCalculatedHash || undefined,
      LOG_PREFIX,
    );

    // 7. Process screenshots
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

    // 8. Check for duplicate
    const duplicateResult = await checkDuplicate({
      supabase,
      contentHash: processedData.contentHash,
      projectId: databaseIds.projectId,
      logPrefix: LOG_PREFIX,
    });

    if (duplicateResult.isDuplicate && duplicateResult.existingRun) {
      const existingTime = new Date(
        duplicateResult.existingRun.timestamp,
      ).toLocaleString();
      return NextResponse.json(
        {
          error: "Duplicate upload detected",
          message: `This exact test run was already uploaded on ${existingTime}. If you want to re-upload, please modify the tests or wait for different results.`,
          existingRunId: duplicateResult.existingRun.id,
          isDuplicate: true,
        },
        { status: 409 },
      );
    }

    // 9. Insert test run and all related data
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

    // 10. Return success response
    return NextResponse.json({
      success: true,
      testRun: {
        id: insertResult.testRunId,
        timestamp: processedData.timestamp,
        environment: processedData.environment,
        trigger,
        branch: processedData.branch,
        commit,
        ...processedData.stats,
        duration: processedData.durationFormatted,
        contentHash: processedData.contentHash,
        tests: processedData.tests,
      },
      message: `Processed ${processedData.tests.length} tests with ${screenshotCount} screenshots`,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing ZIP file:`, error);
    return NextResponse.json(
      {
        error: "Failed to process ZIP file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
