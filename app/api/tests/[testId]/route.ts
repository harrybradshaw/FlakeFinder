import { type NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> },
) {
  try {
    const { testId } = await params;
    const suiteTestId = testId;

    const searchParams = request.nextUrl.searchParams;
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");
    const timeRange = searchParams.get("timeRange") || "30d";

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured");
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

    // First, get the suite_test definition
    const { data: suiteTest, error: suiteTestError } = await supabase
      .from("suite_tests")
      .select("id, project_id, file, name")
      .eq("id", suiteTestId)
      .single();

    if (suiteTestError || !suiteTest) {
      console.error("[API] Error fetching suite test:", suiteTestError);
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    // Calculate time range
    const now = new Date();
    const startDate = new Date();
    switch (timeRange) {
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Look up environment/trigger IDs if filters are provided
    let environmentId = null;
    let triggerId = null;

    if (environment && environment !== "all") {
      const { data: envData } = await supabase
        .from("environments")
        .select("id")
        .eq("name", environment)
        .eq("active", true)
        .single();

      if (envData) environmentId = envData.id;
    }

    if (trigger && trigger !== "all") {
      const { data: trigData } = await supabase
        .from("test_triggers")
        .select("id")
        .eq("name", trigger)
        .eq("active", true)
        .single();

      if (trigData) triggerId = trigData.id;
    }

    // Build query for test_runs with filters (for this project only)
    let runsQuery = supabase
      .from("test_runs")
      .select("id, timestamp, branch")
      .eq("project_id", suiteTest.project_id)
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: true });

    if (environmentId) {
      runsQuery = runsQuery.eq("environment_id", environmentId);
    }
    if (triggerId) {
      runsQuery = runsQuery.eq("trigger_id", triggerId);
    }

    const { data: runs, error: runsError } = await runsQuery;

    if (runsError) {
      console.error("[API] Error fetching test runs:", runsError);
      return NextResponse.json({ error: runsError.message }, { status: 500 });
    }

    if (!runs || runs.length === 0) {
      return NextResponse.json({
        id: suiteTest.id,
        name: suiteTest.name,
        file: suiteTest.file,
        history: [],
        summary: {
          totalRuns: 0,
          passRate: "0.0",
          failRate: "0.0",
          flakyRate: "0.0",
          avgDuration: 0,
        },
      });
    }

    const runIds = runs.map((r) => r.id);

    const { data: tests, error: testsError } = await supabase
      .from("tests")
      .select("status, duration, test_run_id, created_at, started_at")
      .order("started_at", { ascending: true })
      .in("test_run_id", runIds)
      .eq("suite_test_id", suiteTestId);

    if (testsError) {
      console.error("[API] Error fetching tests:", testsError);
      return NextResponse.json({ error: testsError.message }, { status: 500 });
    }

    // Build history with run context
    const history = (tests || []).map((test) => {
      const run = runs.find((r) => r.id === test.test_run_id);
      return {
        timestamp: test.started_at,
        status: test.status,
        duration: test.duration,
        branch: run?.branch,
        testRunId: run?.id,
      };
    });

    // Calculate summary
    const totalRuns = tests?.length || 0;
    const passed = tests?.filter((t) => t.status === "passed").length || 0;
    const failed = tests?.filter((t) => t.status === "failed").length || 0;
    const flaky = tests?.filter((t) => t.status === "flaky").length || 0;
    const totalDuration =
      tests?.reduce((sum, t) => sum + (t.duration || 0), 0) || 0;

    const summary = {
      totalRuns,
      passRate: totalRuns > 0 ? ((passed / totalRuns) * 100).toFixed(1) : "0.0",
      failRate: totalRuns > 0 ? ((failed / totalRuns) * 100).toFixed(1) : "0.0",
      flakyRate: totalRuns > 0 ? ((flaky / totalRuns) * 100).toFixed(1) : "0.0",
      avgDuration: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
    };

    return NextResponse.json({
      id: suiteTest.id,
      name: suiteTest.name,
      file: suiteTest.file,
      history,
      summary,
    });
  } catch (error) {
    console.error("[API] Error fetching test history:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch test history",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
