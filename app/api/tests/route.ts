import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");
    const timeRange = searchParams.get("timeRange") || "30d";

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured, returning empty array");
      return NextResponse.json({ tests: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

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

    // Build query for test_runs with filters
    let runsQuery = supabase
      .from("test_runs")
      .select("id")
      .gte("timestamp", startDate.toISOString());

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
      return NextResponse.json({ tests: [] });
    }

    const runIds = runs.map((r) => r.id);

    // Fetch all tests for these runs
    const { data: tests, error: testsError } = await supabase
      .from("tests")
      .select("name, file, status, duration, test_run_id")
      .in("test_run_id", runIds);

    if (testsError) {
      console.error("[API] Error fetching tests:", testsError);
      return NextResponse.json({ error: testsError.message }, { status: 500 });
    }

    // Aggregate metrics by test name + file (unique test identifier)
    const testMetrics = new Map<
      string,
      {
        name: string;
        file: string;
        totalRuns: number;
        passed: number;
        failed: number;
        flaky: number;
        skipped: number;
        totalDuration: number;
        recentStatuses: string[];
      }
    >();

    for (const test of tests || []) {
      const key = `${test.name}::${test.file}`;

      if (!testMetrics.has(key)) {
        testMetrics.set(key, {
          name: test.name,
          file: test.file,
          totalRuns: 0,
          passed: 0,
          failed: 0,
          flaky: 0,
          skipped: 0,
          totalDuration: 0,
          recentStatuses: [],
        });
      }

      const metrics = testMetrics.get(key)!;
      metrics.totalRuns++;
      metrics.totalDuration += test.duration || 0;

      // Track status counts
      switch (test.status) {
        case "passed":
          metrics.passed++;
          break;
        case "failed":
          metrics.failed++;
          break;
        case "flaky":
          metrics.flaky++;
          break;
        case "skipped":
          metrics.skipped++;
          break;
      }

      // Keep last 10 statuses for trend
      metrics.recentStatuses.push(test.status);
      if (metrics.recentStatuses.length > 10) {
        metrics.recentStatuses.shift();
      }
    }

    // Transform to response format
    const testsResponse = Array.from(testMetrics.values()).map((metrics) => ({
      name: metrics.name,
      file: metrics.file,
      totalRuns: metrics.totalRuns,
      passRate:
        metrics.totalRuns > 0
          ? ((metrics.passed / metrics.totalRuns) * 100).toFixed(1)
          : "0.0",
      failRate:
        metrics.totalRuns > 0
          ? ((metrics.failed / metrics.totalRuns) * 100).toFixed(1)
          : "0.0",
      flakyRate:
        metrics.totalRuns > 0
          ? ((metrics.flaky / metrics.totalRuns) * 100).toFixed(1)
          : "0.0",
      avgDuration:
        metrics.totalRuns > 0
          ? Math.round(metrics.totalDuration / metrics.totalRuns)
          : 0,
      recentStatuses: metrics.recentStatuses,
      health: calculateHealth(metrics),
    }));

    // Sort by health (worst first)
    testsResponse.sort((a, b) => a.health - b.health);

    return NextResponse.json({ tests: testsResponse });
  } catch (error) {
    console.error("[API] Error aggregating tests:", error);
    return NextResponse.json(
      {
        error: "Failed to aggregate tests",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

function calculateHealth(metrics: {
  totalRuns: number;
  passed: number;
  failed: number;
  flaky: number;
}): number {
  if (metrics.totalRuns === 0) return 100;

  const passRate = (metrics.passed / metrics.totalRuns) * 100;
  const failRate = (metrics.failed / metrics.totalRuns) * 100;
  const flakyRate = (metrics.flaky / metrics.totalRuns) * 100;

  // Health score: 100 = perfect, 0 = terrible
  // Penalize failures more than flakiness
  return Math.max(0, 100 - failRate * 2 - flakyRate);
}
