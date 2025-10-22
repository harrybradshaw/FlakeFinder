import { type NextRequest, NextResponse } from "next/server";
import { type Database } from "@/types/supabase";
import { type TestDetailsResponse } from "@/types/api";

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

    // Fetch the specific test from this run with suite_test details
    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("*, suite_test:suite_tests(name, file)")
      .eq("test_run_id", testRunId)
      .eq("suite_test_id", suiteTestId)
      .single();

    if (testError || !test) {
      console.error("[API] Error fetching test:", testError);
      return NextResponse.json(
        { error: "Test not found" },
        { status: 404 },
      );
    }

    // Fetch test attempts (including retries) for this test
    const { data: testAttempts, error: attemptsError } = await supabase
      .from("test_results")
      .select("*")
      .eq("test_id", test.id)
      .order("retry_index", { ascending: true });

    if (attemptsError) {
      console.error("[getTestDetails] Error fetching test attempts:", attemptsError);
    }
    
    // Debug logging
    console.log('[API] Test attempts:', testAttempts?.map(a => ({ 
      id: a.id, 
      steps_url: a.steps_url,
      hasSteps: !!a.steps_url 
    })));

    const response: TestDetailsResponse = {
      test: {
        id: test.id,
        suite_test_id: test.suite_test_id ?? undefined,
        name: test.suite_test?.name || "Unknown Test",
        file: test.suite_test?.file || "unknown",
        status: test.status as "passed" | "failed" | "flaky" | "skipped" | "timedOut",
        duration: test.duration,
        error: test.error ?? undefined,
        screenshots: Array.isArray(test.screenshots) ? (test.screenshots as string[]) : [],
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
          screenshots: Array.isArray(attempt.screenshots) ? (attempt.screenshots as string[]) : [],
          attachments: Array.isArray(attempt.attachments) ? (attempt.attachments as Array<{
            name: string;
            contentType: string;
            content: string;
          }>) : [],
          started_at: attempt.started_at ?? undefined,
          startTime: attempt.started_at ?? undefined,
          stepsUrl: attempt.steps_url ?? undefined,
          hasSteps: !!attempt.steps_url, // Hint: steps are available if stepsUrl exists
          lastFailedStep: attempt.last_failed_step ? (attempt.last_failed_step as unknown as { title: string; duration: number; error: string }) : undefined,
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
