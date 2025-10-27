import { type NextRequest, NextResponse } from "next/server";
import { type Database } from "@/types/supabase";
import { type TestDetailsResponse } from "@/types/api";
import { createRepositories } from "@/lib/repositories";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> },
) {
  try {
    const { id: testRunId, testId: suiteTestId } = await params;

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const repos = createRepositories(supabase);

    // Fetch the specific test from this run with suite_test details
    const test = await repos.testRuns.getTestWithSuiteDetails(
      testRunId,
      suiteTestId,
    );

    if (!test) {
      console.error("[API] Test not found");
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    const testAttempts = await repos.testRuns.getTestResults(test.id);
    const response: TestDetailsResponse = {
      test: {
        id: test.id,
        suite_test_id: test.suite_test_id ?? undefined,
        name: test.suite_test?.name || "Unknown Test",
        file: test.suite_test?.file || "unknown",
        status: test.status as
          | "passed"
          | "failed"
          | "flaky"
          | "skipped"
          | "timedOut",
        duration: test.duration,
        error: test.error ?? undefined,
        screenshots: Array.isArray(test.screenshots)
          ? (test.screenshots as string[])
          : [],
        started_at: test.started_at ?? undefined,
        attempts: (testAttempts || []).map((attempt) => ({
          attemptIndex: attempt.retry_index,
          retry_index: attempt.retry_index,
          retryIndex: attempt.retry_index,
          id: attempt.id,
          testResultId: attempt.id,
          status: attempt.status,
          duration: attempt.duration,
          error: attempt.error ?? undefined,
          error_stack: attempt.error_stack ?? undefined,
          errorStack: attempt.error_stack ?? undefined,
          screenshots: Array.isArray(attempt.screenshots)
            ? (attempt.screenshots as string[])
            : [],
          attachments: Array.isArray(attempt.attachments)
            ? (attempt.attachments as Array<{
                name: string;
                contentType: string;
                content: string;
              }>)
            : [],
          started_at: attempt.started_at ?? undefined,
          startTime: attempt.started_at ?? undefined,
          stepsUrl: attempt.steps_url ?? undefined,
          hasSteps: !!attempt.steps_url, // Hint: steps are available if stepsUrl exists
          lastFailedStep: attempt.last_failed_step
            ? (attempt.last_failed_step as unknown as {
                title: string;
                duration: number;
                error: string;
              })
            : undefined,
        })),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error in test details endpoint:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch test details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
