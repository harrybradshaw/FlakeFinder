import { type NextRequest, NextResponse } from "next/server";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

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
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const repos = createRepositories(supabase);

    // First, get the suite_test definition
    const suiteTest = await repos.testRuns.getSuiteTestById(suiteTestId);

    if (!suiteTest) {
      console.error("[API] Suite test not found");
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
    let environmentId: string | null = null;
    let triggerId: string | null = null;

    if (environment && environment !== "all") {
      const envData = await repos.lookups.getEnvironmentByName(environment);
      if (envData) environmentId = envData.id;
    }

    if (trigger && trigger !== "all") {
      const trigData = await repos.lookups.getTriggerByName(trigger);
      if (trigData) triggerId = trigData.id;
    }

    const testData = await repos.testRuns.getTestHistoryOptimized(
      suiteTestId,
      startDate,
      environmentId,
      triggerId,
    );

    if (!testData || testData.length === 0) {
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

    // Build history with run context
    const history = testData.map((test) => {
      return {
        timestamp: test.started_at,
        status: test.status,
        duration: test.duration,
        attempts: test.attempts || 1,
        branch: test.test_runs?.branch,
        testRunId: test.test_runs?.id,
        environment: test.test_runs?.environments?.name || null,
        trigger: test.test_runs?.test_triggers?.name || null,
      };
    });

    // Calculate summary
    const totalRuns = testData.length;
    const passed = testData.filter((t) => t.status === "passed").length;
    const failed = testData.filter((t) => t.status === "failed").length;
    const flaky = testData.filter((t) => t.status === "flaky").length;

    // Calculate average duration per attempt (not total duration)
    const totalDuration =
      testData.reduce((sum, t) => {
        const attempts = t.attempts || 1;
        return sum + (t.duration || 0) / attempts;
      }, 0) || 0;

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
