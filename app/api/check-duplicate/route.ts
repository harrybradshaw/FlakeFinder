import { type NextRequest, NextResponse } from "next/server";
import {
  processPlaywrightReportFile,
  ReportProcessingError,
  calculateContentHash,
} from "@/lib/playwright-report-utils";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";
import { type ExtractedTest } from "@/types/extracted-test";

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const environment = formData.get("environment") as string | null;
    const trigger = formData.get("trigger") as string | null;
    const branch = formData.get("branch") as string | null;
    const commit = formData.get("commit") as string | null;
    const preCalculatedHash = formData.get("contentHash") as string | null;
    const suite = formData.get("suite") as string | null;

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
    let tests: ExtractedTest[] | undefined;
    let metadata: Record<string, any> | undefined;

    if (preCalculatedHash && !file) {
      contentHash = preCalculatedHash;
    } else if (preCalculatedHash && file) {
      contentHash = preCalculatedHash;
      const processed = await processPlaywrightReportFile(file);
      tests = processed.tests;
      metadata = processed.metadata;
    } else {
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

    const duplicateCheck = await checkForDuplicateRun(contentHash, suite);

    const result: DuplicateCheckResult = {
      success: true,
      testCount: tests?.length,
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

async function checkForDuplicateRun(
  contentHash: string,
  suite: string | null,
): Promise<{
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
    const repos = createRepositories(supabase);

    let projectId: string | null = null;
    if (suite && suite !== "all") {
      projectId = await repos.lookups.getSuiteProjectId(suite);
    }

    const existingRun = await repos.testRuns.findDuplicateByContentHash(
      contentHash,
      projectId,
    );

    if (existingRun) {
      console.log("[Duplicate Check] Duplicate found:", existingRun);
      return {
        isDuplicate: true,
        existingRun: {
          id: existingRun.id,
          timestamp: existingRun.timestamp,
        },
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error("[Duplicate Check] Error:", error);
    return { isDuplicate: false };
  }
}
