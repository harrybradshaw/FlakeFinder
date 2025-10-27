import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get("project");
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");
    const suite = searchParams.get("suite");
    const timeRange = searchParams.get("timeRange") || "7d";

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json({
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      });
    }

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      });
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
      return NextResponse.json({
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      });
    }

    // Get accessible projects
    const accessibleProjectIds =
      await repos.lookups.getAccessibleProjectIds(userOrgIds);

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json({
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      });
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
    // Project is already an ID (not a name)
    const projectId = project && project !== "all" ? project : null;
    let environmentId = null;
    let triggerId = null;
    let suiteId = null;

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
      return NextResponse.json({
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      });
    }

    // Handle suite filter
    let testRunIds: string[] | null = null;
    if (suiteId) {
      const suiteTestIds = await repos.testRuns.getSuiteTestIdsBySuite(suiteId);

      if (suiteTestIds.length === 0) {
        return NextResponse.json({
          totalTests: 0,
          passed: 0,
          failed: 0,
          flaky: 0,
        });
      }

      testRunIds = await repos.testRuns.getTestRunIdsBySuiteTests(suiteTestIds);

      if (testRunIds.length === 0) {
        return NextResponse.json({
          totalTests: 0,
          passed: 0,
          failed: 0,
          flaky: 0,
        });
      }
    }

    // Get test run stats
    const runs = await repos.testRuns.getTestRunStats(
      accessibleProjectIds,
      startDate,
      projectId,
      environmentId,
      triggerId,
      testRunIds,
    );

    // Aggregate stats
    const stats = (runs || []).reduce(
      (acc, run) => ({
        totalTests: acc.totalTests + run.total,
        passed: acc.passed + run.passed,
        failed: acc.failed + run.failed,
        flaky: acc.flaky + run.flaky,
      }),
      { totalTests: 0, passed: 0, failed: 0, flaky: 0 },
    );

    return NextResponse.json(stats);
  } catch (error) {
    console.error("[API] Error fetching stats:", error);
    return NextResponse.json(
      {
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      },
      { status: 500 },
    );
  }
}
