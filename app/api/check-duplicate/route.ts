import { type NextRequest, NextResponse } from "next/server";
import { 
  processPlaywrightReportFile,
  ReportProcessingError,
  type TestResult 
} from "@/lib/playwright-report-utils";

// Configure route to accept larger payloads (up to 100MB)
export const maxDuration = 60; // 60 seconds timeout
export const dynamic = 'force-dynamic';

interface DuplicateCheckResult {
  success: boolean;
  testCount: number;
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
 * Checks for duplicate test runs by processing the uploaded test report
 * and comparing it with existing runs in the database.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const environment = formData.get("environment") as string | null;
    const trigger = formData.get("trigger") as string | null;
    const branch = formData.get("branch") as string | null;
    const commit = formData.get("commit") as string | null;

    // Validate required fields
    if (!file || !environment || !trigger || !branch) {
      const missingFields = [
        !file && "file",
        !environment && "environment",
        !trigger && "trigger",
        !branch && "branch"
      ].filter(Boolean);
      
      return NextResponse.json(
        { 
          error: "Missing required fields",
          details: `Missing: ${missingFields.join(", ")}`
        },
        { status: 400 },
      );
    }

    // Process the uploaded file using our shared utility
    const { tests, metadata } = await processPlaywrightReportFile(file);
    
    if (tests.length === 0) {
      return NextResponse.json(
        { error: "No tests found in the uploaded report" },
        { status: 400 }
      );
    }
    
    // Calculate a unique hash for this test run
    const contentHash = await calculateTestRunHash({
      environment,
      trigger,
      branch,
      commit: commit || "unknown",
      tests
    });

    // Check for duplicates in the database
    const duplicateCheck = await checkForDuplicateRun(contentHash);
    
    const result: DuplicateCheckResult = {
      success: true,
      testCount: tests.length,
      hasDuplicates: duplicateCheck.isDuplicate,
      duplicateCount: duplicateCheck.isDuplicate ? 1 : 0,
      metadata: {
        environment,
        trigger,
        branch,
        commit,
        ...metadata
      }
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
          code: error.code
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

/**
 * Calculates a unique hash for a test run based on its content
 */
async function calculateTestRunHash(params: {
  environment: string | null;
  trigger: string | null;
  branch: string | null;
  commit: string;
  tests: TestResult[];
}): Promise<string> {
  const { environment, trigger, branch, commit, tests } = params;
  
  const hashContent = {
    environment,
    trigger,
    branch,
    commit,
    tests: tests
      .map((test) => ({
        name: test.name,
        file: test.file,
        status: test.status,
      }))
      .sort((a, b) =>
        `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
      ),
  };

  const buffer = await crypto.subtle.digest(
    "SHA-256", 
    new TextEncoder().encode(JSON.stringify(hashContent))
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    const supabase = createClient(
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
