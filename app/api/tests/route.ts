import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  aggregateTestMetrics,
  transformTestMetrics,
  sortTestsByHealth,
} from "@/lib/test-aggregation-utils";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");
    const timeRange = searchParams.get("timeRange") || "30d";
    const projectFilter = searchParams.get("project");

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured, returning empty array");
      return NextResponse.json({ tests: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Get user's organizations
    const organizationIds = await repos.lookups.getUserOrganizations(userId);

    if (organizationIds.length === 0) {
      return NextResponse.json({ tests: [] });
    }

    // Get projects accessible to user's organizations
    const accessibleProjectIds =
      await repos.lookups.getAccessibleProjectIds(organizationIds);

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json({ tests: [] });
    }

    // Apply project filter if specified
    let filteredProjectIds = accessibleProjectIds;
    if (projectFilter && projectFilter !== "all") {
      // Only include the selected project if user has access to it
      if (accessibleProjectIds.includes(projectFilter)) {
        filteredProjectIds = [projectFilter];
      } else {
        // User doesn't have access to this project
        return NextResponse.json({ tests: [] });
      }
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

    // Get test runs with filters (including project filter)
    const runs = await repos.testRuns.getTestRunsByProjects(
      filteredProjectIds,
      startDate,
      environmentId,
      triggerId,
    );

    if (runs.length === 0) {
      return NextResponse.json({ tests: [] });
    }

    const runIds = runs.map((r) => r.id);

    // Fetch all test executions for these runs with suite_test information
    const tests = await repos.testRuns.getTestsForAggregation(runIds);

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
