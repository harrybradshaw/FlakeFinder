import { type NextRequest, NextResponse } from "next/server";
import {
  aggregateTestMetrics,
  transformTestMetrics,
  sortTestsByHealth,
} from "@/lib/test-aggregation-utils";
import { type Database } from "@/types/supabase";

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
    const supabase = createClient<Database>(
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

    // Fetch all test executions for these runs with suite_test information
    const { data: tests, error: testsError } = await supabase
      .from("tests")
      .select(
        `
        suite_test_id,
        status,
        duration,
        test_run_id,
        started_at,
        suite_test:suite_tests(id, name, file)
      `,
      )
      .in("test_run_id", runIds)
      .order("started_at", { ascending: false });

    if (testsError) {
      console.error("[API] Error fetching tests:", testsError);
      return NextResponse.json({ error: testsError.message }, { status: 500 });
    }

    // Aggregate metrics by suite_test_id (canonical test identifier)
    const testMetrics = aggregateTestMetrics(
      (tests || []).map((test) => ({
        suite_test_id: test.suite_test_id!,
        status: test.status,
        duration: test.duration,
        test_run_id: test.test_run_id,
        started_at: test.started_at!,
        suite_test: test.suite_test,
      })),
    );

    // Transform to response format
    const testsResponse = Array.from(testMetrics.values()).map(
      transformTestMetrics,
    );

    // Sort by health (worst first)
    const sortedTests = sortTestsByHealth(testsResponse);

    return NextResponse.json({ tests: sortedTests });
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
