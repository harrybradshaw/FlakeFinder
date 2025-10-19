import { type NextRequest, NextResponse } from "next/server";

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
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // Fetch the specific test from this run
    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("*")
      .eq("test_run_id", testRunId)
      .eq("suite_test_id", suiteTestId)
      .single();

    if (testError || !test) {
      console.error("[API] Error fetching test:", testError);
      return NextResponse.json(
        { error: "Test not found in this run" },
        { status: 404 },
      );
    }

    // Fetch retry results for this test
    const { data: retryResults, error: retryError } = await supabase
      .from("test_results")
      .select("*")
      .eq("test_id", test.id)
      .order("retry_index", { ascending: true });

    if (retryError) {
      console.error("[API] Error fetching retry results:", retryError);
    }

    // Transform to match frontend format
    const testCase = {
      id: test.id,
      suite_test_id: test.suite_test_id,
      name: test.name,
      file: test.file,
      status: test.status,
      duration: test.duration,
      error: test.error,
      screenshots: test.screenshots || [],
      retryResults: (retryResults || []).map((retry) => ({
        retry_index: retry.retry_index,
        retryIndex: retry.retry_index,
        status: retry.status,
        duration: retry.duration,
        error: retry.error,
        error_stack: retry.error_stack,
        errorStack: retry.error_stack,
        screenshots: retry.screenshots || [],
        attachments: retry.attachments || [],
        started_at: retry.started_at,
        startTime: retry.started_at,
      })),
    };

    return NextResponse.json({ test: testCase });
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
