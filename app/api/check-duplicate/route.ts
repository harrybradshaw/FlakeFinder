import { type NextRequest, NextResponse } from "next/server";
import {
  processPlaywrightReportFile,
  ReportProcessingError,
  calculateContentHash,
  type TestResult,
} from "@/lib/playwright-report-utils";
import { type Database } from "@/types/supabase";

// Configure route to accept larger payloads (up to 100MB)
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = "force-dynamic";

interface DuplicateCheckResult {
  success: boolean;
  testCount?: number; // Optional since we might not have the file
  hasDuplicates: boolean;
  duplicateCount: number;
  metadata: {
    environment: string | null;
    trigger: string | null;
    branch: string | null;
    commit: string | null;
    [key: string]: any;
  };
  existingRun?: {
    id: string;
    timestamp: string;
  };
}

/**
 * POST /api/check-duplicate
 *
 * Checks for duplicate test runs by comparing a content hash
 * with existing runs in the database.
 *
 * Accepts either:
 * 1. Hash-only mode (efficient): contentHash + metadata only
 * 2. Legacy mode (wasteful): Full file upload
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const environment = formData.get("environment") as string | null;
    const trigger = formData.get("trigger") as string | null;
    const branch = formData.get("branch") as string | null;
    const commit = formData.get("commit") as string | null;
    const preCalculatedHash = formData.get("contentHash") as string | null;

    // Validate required fields - file is now optional if hash is provided
    if (!environment || !trigger || !branch) {
      const missingFields = [
        !environment && "environment",
        !trigger && "trigger",
        !branch && "branch",
      ].filter(Boolean);

      return NextResponse.json(
        {
          error: "Missing required fields",
          details: `Missing: ${missingFields.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Must have either a hash or a file
    if (!preCalculatedHash && !file) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          details: "Must provide either contentHash or file",
        },
        { status: 400 },
      );
    }

    let contentHash: string;
    let tests: TestResult[] | undefined;
    let metadata: Record<string, any> | undefined;

    // Efficient path: hash-only check (no file processing needed)
    if (preCalculatedHash && !file) {
      console.log(
        "[Duplicate Check] Hash-only mode (efficient):",
        preCalculatedHash,
      );
      contentHash = preCalculatedHash;
      // No test count available in hash-only mode
    } else if (preCalculatedHash && file) {
      // Hybrid mode: hash provided but also have file (legacy compatibility)
      console.log(
        "[Duplicate Check] Hybrid mode - using pre-calculated hash:",
        preCalculatedHash,
      );
      contentHash = preCalculatedHash;
      // Still process file to get test count for backwards compatibility
      const processed = await processPlaywrightReportFile(file);
      tests = processed.tests;
      metadata = processed.metadata;
    } else {
      // Legacy path: calculate hash from file (wasteful)
      console.log(
        "[Duplicate Check] Legacy mode - calculating hash from file (wasteful)",
      );
      const processed = await processPlaywrightReportFile(file!);
      tests = processed.tests;
      metadata = processed.metadata;

      if (tests.length === 0) {
        return NextResponse.json(
          { error: "No tests found in the uploaded report" },
          { status: 400 },
        );
      }

      contentHash = await calculateContentHash(tests);
    }

    // Check for duplicates in the database
    const duplicateCheck = await checkForDuplicateRun(contentHash);

    const result: DuplicateCheckResult = {
      success: true,
      testCount: tests?.length, // Optional in hash-only mode
      hasDuplicates: duplicateCheck.isDuplicate,
      duplicateCount: duplicateCheck.isDuplicate ? 1 : 0,
      metadata: {
        environment,
        trigger,
        branch,
        commit,
        ...metadata,
      },
    };

    if (duplicateCheck.existingRun) {
      result.existingRun = duplicateCheck.existingRun;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error processing duplicate check:", error);

    if (error instanceof ReportProcessingError) {
      return NextResponse.json(
        {
          error: "Failed to process test report",
          details: error.message,
          code: error.code,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Checks if a test run with the given hash already exists in the database
 */
async function checkForDuplicateRun(contentHash: string): Promise<{
  isDuplicate: boolean;
  existingRun?: {
    id: string;
    timestamp: string;
  };
}> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn("Supabase environment variables not configured");
    return { isDuplicate: false };
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const { data: existingRuns, error } = await supabase
      .from("test_runs")
      .select("id, timestamp")
      .eq("content_hash", contentHash)
      .order("timestamp", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[Duplicate Check] Database error:", error);
      throw error;
    }

    if (existingRuns && existingRuns.length > 0) {
      console.log("[Duplicate Check] Duplicate found:", existingRuns[0]);
      return {
        isDuplicate: true,
        existingRun: {
          id: existingRuns[0].id,
          timestamp: existingRuns[0].timestamp,
        },
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error("[Duplicate Check] Error:", error);
    // If there's an error checking for duplicates, we'll assume it's not a duplicate
    // rather than failing the entire operation
    return { isDuplicate: false };
  }
}
