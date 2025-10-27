import { type NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import {
  verifyUserProjectAccess,
  lookupDatabaseIds,
} from "@/lib/upload/upload-processing";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { processUpload } from "@/lib/upload/shared-upload-handler";
import { uploadZipFormDataFields } from "@/lib/upload/upload-constants";
import { createRepositories } from "@/lib/repositories";

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
    const file = formData.get(uploadZipFormDataFields.file) as File;
    const initialEnvironment = formData.get(
      uploadZipFormDataFields.environmentName,
    ) as string;
    const trigger = formData.get(uploadZipFormDataFields.triggerName) as string;
    const suite = formData.get(uploadZipFormDataFields.suiteId) as string;
    const initialBranch =
      (formData.get(uploadZipFormDataFields.branch) as string) || "unknown";
    const commit =
      (formData.get(uploadZipFormDataFields.commit) as string) || "unknown";
    const preCalculatedHash = formData.get(
      uploadZipFormDataFields.contentHash,
    ) as string | null;

    // Validate required fields
    if (!file || !initialEnvironment || !trigger || !suite) {
      return NextResponse.json(
        {
          error: "Missing required fields: file, environment, trigger, suite",
        },
        { status: 400 },
      );
    }

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

    const repos = createRepositories(supabase);

    const idsResult = await lookupDatabaseIds({
      lookupRepo: repos.lookups,
      environmentName: initialEnvironment,
      triggerName: trigger,
      suiteId: suite,
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
      lookupRepo: repos.lookups,
      userId,
      projectId: databaseIds.projectId,
      logPrefix: LOG_PREFIX,
    });

    if (!accessResult.success) {
      return NextResponse.json(
        { error: accessResult.error!.message },
        { status: accessResult.error!.status },
      );
    }

    // 6. Load ZIP and process upload using shared handler
    // Note: No server-side optimization - client already optimized
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const result = await processUpload(
      zip,
      {
        environment: initialEnvironment,
        trigger: trigger,
        suite: suite,
        branch: initialBranch,
        commit,
        preCalculatedHash: preCalculatedHash || undefined,
      },
      databaseIds.projectId,
      file.name,
      LOG_PREFIX,
    );

    // 7. Handle result
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

    // 8. Return success response
    return NextResponse.json({
      success: true,
      testRun: result.testRun,
      message: result.message,
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
