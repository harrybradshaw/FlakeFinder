import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
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

    const { data: aggregatedTests, error: aggregationError } =
      await supabase.rpc("aggregate_test_metrics", {
        p_project_ids: filteredProjectIds,
        p_start_date: startDate.toISOString(),
        p_environment_id: environmentId ?? undefined,
        p_trigger_id: triggerId ?? undefined,
      });

    if (aggregationError) {
      console.error("[API] Error aggregating tests:", aggregationError);
      throw new Error(`Failed to aggregate tests: ${aggregationError.message}`);
    }

    if (!aggregatedTests || aggregatedTests.length === 0) {
      return NextResponse.json({ tests: [] });
    }

    // Transform the aggregated data to match the expected format
    const testsResponse = aggregatedTests.map((test) => {
      // Parse the JSONB recent_statuses into the expected format
      const recentStatuses = Array.isArray(test.recent_statuses)
        ? test.recent_statuses.map((rs: any) => ({
            status: rs.status,
            started_at: rs.started_at,
          }))
        : [];

      const metrics = {
        suite_test_id: test.suite_test_id,
        name: test.name,
        file: test.file,
        totalRuns: test.total_runs,
        passed: test.passed,
        failed: test.failed,
        flaky: test.flaky,
        skipped: test.skipped,
        totalDuration: test.total_duration,
        recentStatuses,
      };

      return transformTestMetrics(metrics);
    });

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
