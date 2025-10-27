import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";
import { groupRunsByDay } from "@/lib/utils/trends-utils";
import { createRepositories } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get("project");
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");
    const suite = searchParams.get("suite");
    const timeRange = searchParams.get("timeRange") || "7d";
    const groupBy = searchParams.get("groupBy") || "daily"; // 'daily' or 'individual'

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json({ trends: [] });
    }

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ trends: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Get user's organizations
    const userOrgIds = await repos.lookups.getUserOrganizations(userId);

    if (userOrgIds.length === 0) {
      return NextResponse.json({ trends: [] });
    }

    // Get accessible projects
    const accessibleProjectIds =
      await repos.lookups.getAccessibleProjectIds(userOrgIds);

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json({ trends: [] });
    }

    // Calculate time range
    const now = new Date();
    const startDate = new Date();
    switch (timeRange) {
      case "24h":
        startDate.setHours(now.getHours() - 24);
        break;
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
        startDate.setDate(now.getDate() - 7);
    }

    // Look up filter IDs
    let projectId = null;
    let environmentId = null;
    let triggerId = null;
    let suiteId = null;

    if (project) {
      projectId = project;
    }

    if (environment && environment !== "all") {
      const envData = await repos.lookups.getEnvironmentByName(environment);
      if (envData) environmentId = envData.id;
    }

    if (trigger && trigger !== "all") {
      const trigData = await repos.lookups.getTriggerByName(trigger);
      if (trigData) triggerId = trigData.id;
    }

    if (suite && suite !== "all") {
      const suiteData = await repos.lookups.getSuiteByName(suite);
      if (suiteData) suiteId = suiteData.id;
    }

    // Check project access
    if (projectId && !accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ trends: [] });
    }

    // Handle suite filter
    let testRunIds: string[] | null = null;
    if (suiteId) {
      const suiteTestIds = await repos.testRuns.getSuiteTestIdsBySuite(suiteId);

      if (suiteTestIds.length === 0) {
        return NextResponse.json({ trends: [] });
      }

      testRunIds = await repos.testRuns.getTestRunIdsBySuiteTests(suiteTestIds);

      if (testRunIds.length === 0) {
        return NextResponse.json({ trends: [] });
      }
    }

    // Get test run trends
    const runs = await repos.testRuns.getTestRunTrends(
      accessibleProjectIds,
      startDate,
      projectId,
      environmentId,
      triggerId,
      testRunIds,
    );

    if (!runs || runs.length === 0) {
      return NextResponse.json({ trends: [] });
    }

    // Process data based on groupBy parameter
    let trends;

    if (groupBy === "daily") {
      // Use utility function for grouping and aggregation
      trends = groupRunsByDay(runs);
    } else {
      // Return individual runs
      trends = runs.map((run) => ({
        date: run.timestamp,
        timestamp: run.timestamp,
        passed: run.passed,
        failed: run.failed,
        flaky: run.flaky,
        total: run.total,
      }));
    }

    return NextResponse.json({ trends });
  } catch (error) {
    console.error("[API] Error fetching trends:", error);
    return NextResponse.json({ trends: [] }, { status: 500 });
  }
}
