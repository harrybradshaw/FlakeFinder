import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";

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

    // Get user's organizations
    const { data: userOrgs } = await supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", userId);

    const userOrgIds = userOrgs?.map((uo) => uo.organization_id) || [];

    if (userOrgIds.length === 0) {
      return NextResponse.json({
        totalTests: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
      });
    }

    // Get accessible projects
    const { data: orgProjects } = await supabase
      .from("organization_projects")
      .select("project_id")
      .in("organization_id", userOrgIds);

    const accessibleProjectIds = orgProjects?.map((op) => op.project_id) || [];

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
    let projectId = null;
    let environmentId = null;
    let triggerId = null;
    let suiteId = null;

    if (project && project !== "all") {
      const { data: projData } = await supabase
        .from("projects")
        .select("id")
        .eq("name", project)
        .eq("active", true)
        .single();
      if (projData) projectId = projData.id;
    }

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

    if (suite && suite !== "all") {
      const { data: suiteData } = await supabase
        .from("suites")
        .select("id")
        .eq("name", suite)
        .eq("active", true)
        .single();
      if (suiteData) suiteId = suiteData.id;
    }

    // Build query
    let query = supabase
      .from("test_runs")
      .select("total, passed, failed, flaky")
      .in("project_id", accessibleProjectIds)
      .gte("timestamp", startDate.toISOString());

    if (projectId) {
      if (!accessibleProjectIds.includes(projectId)) {
        return NextResponse.json({
          totalTests: 0,
          passed: 0,
          failed: 0,
          flaky: 0,
        });
      }
      query = query.eq("project_id", projectId);
    }
    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId);
    }

    // Handle suite filter
    if (suiteId) {
      const { data: suiteTestIds } = await supabase
        .from("suite_tests")
        .select("id")
        .eq("suite_id", suiteId);

      const suiteTestIdList = suiteTestIds?.map((st) => st.id) || [];

      if (suiteTestIdList.length === 0) {
        return NextResponse.json({
          totalTests: 0,
          passed: 0,
          failed: 0,
          flaky: 0,
        });
      }

      const { data: testsInSuite } = await supabase
        .from("tests")
        .select("test_run_id")
        .in("suite_test_id", suiteTestIdList);

      const testRunIdsInSuite = [
        ...new Set(testsInSuite?.map((t) => t.test_run_id) || []),
      ];

      if (testRunIdsInSuite.length === 0) {
        return NextResponse.json({
          totalTests: 0,
          passed: 0,
          failed: 0,
          flaky: 0,
        });
      }

      query = query.in("id", testRunIdsInSuite);
    }

    // Execute query
    const { data: runs } = await query;

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
