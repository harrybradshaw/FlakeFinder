import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get("project");
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");
    const suite = searchParams.get("suite");
    const timeRange = searchParams.get("timeRange") || "7d";
    const contentHash = searchParams.get("contentHash");

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured, returning empty array");
      return NextResponse.json({ runs: [] });
    }

    // Get user authentication
    const { userId } = await auth();

    if (!userId) {
      console.log("[API] User not authenticated, returning empty array");
      return NextResponse.json({ runs: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    // Get user's custom organization memberships
    const { data: userOrgs, error: userOrgsError } = await supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", userId);

    if (userOrgsError) {
      console.error("[API] Error fetching user organizations:", userOrgsError);
      return NextResponse.json(
        { error: userOrgsError.message },
        { status: 500 },
      );
    }

    const userOrgIds = userOrgs?.map((uo) => uo.organization_id) || [];

    if (userOrgIds.length === 0) {
      console.log("[API] User has no organization memberships");
      return NextResponse.json({ runs: [] });
    }

    // Get accessible project IDs based on user's organizations
    const { data: orgProjects, error: orgProjectsError } = await supabase
      .from("organization_projects")
      .select("project_id, organization_id")
      .in("organization_id", userOrgIds);

    console.log("[API] Organization projects query result:", {
      data: orgProjects,
      error: orgProjectsError,
      userOrgIds,
    });

    if (orgProjectsError) {
      console.error(
        "[API] Error fetching organization projects:",
        orgProjectsError,
      );
      return NextResponse.json(
        { error: orgProjectsError.message },
        { status: 500 },
      );
    }

    const accessibleProjectIds = orgProjects?.map((op) => op.project_id) || [];

    console.log("[API] Accessible project IDs:", accessibleProjectIds);

    if (accessibleProjectIds.length === 0) {
      console.log("[API] User has no accessible projects");
      return NextResponse.json({ runs: [] });
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

    // Look up project/environment/trigger/suite IDs if filters are provided
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

    // Fetch test runs from database with filters (join with projects, environments and triggers)
    let query = supabase
      .from("test_runs")
      .select(
        `
        *,
        project:projects(name, display_name, color),
        environment:environments(name, display_name, color),
        trigger:test_triggers(name, display_name, icon)
      `,
      )
      .in("project_id", accessibleProjectIds) // Only show test runs for accessible projects
      .order("timestamp", { ascending: false });

    // Apply filters by ID
    if (projectId) {
      // Verify the requested project is accessible
      if (!accessibleProjectIds.includes(projectId)) {
        console.log("[API] User attempting to access unauthorized project");
        return NextResponse.json({ runs: [] });
      }
      query = query.eq("project_id", projectId);
    }
    if (environmentId) {
      query = query.eq("environment_id", environmentId);
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId);
    }

    // If contentHash is provided, search for that specific hash (for duplicate detection)
    if (contentHash) {
      query = query.eq("content_hash", contentHash).limit(1);
    } else {
      // Only apply time range filter if not searching by hash
      query = query.gte("timestamp", startDate.toISOString());
    }

    let data = null;
    let error = null;

    // If suite filter is applied, we need to filter test runs that have tests in that suite
    if (suiteId) {
      // First, get suite_test_ids for this suite
      const { data: suiteTestIds, error: suiteTestError } = await supabase
        .from("suite_tests")
        .select("id")
        .eq("suite_id", suiteId);

      if (suiteTestError) {
        console.error("[API] Error fetching suite tests:", suiteTestError);
        return NextResponse.json(
          { error: suiteTestError.message },
          { status: 500 },
        );
      }

      const suiteTestIdList = suiteTestIds?.map((st) => st.id) || [];

      if (suiteTestIdList.length === 0) {
        // No tests in this suite, return empty
        return NextResponse.json({ runs: [] });
      }

      // Get test_run_ids that have tests with these suite_test_ids
      const { data: testsInSuite, error: testsError } = await supabase
        .from("tests")
        .select("test_run_id")
        .in("suite_test_id", suiteTestIdList);

      if (testsError) {
        console.error("[API] Error fetching tests in suite:", testsError);
        return NextResponse.json({ error: testsError.message }, { status: 500 });
      }

      const testRunIdsInSuite = [
        ...new Set(testsInSuite?.map((t) => t.test_run_id) || []),
      ];

      if (testRunIdsInSuite.length === 0) {
        // No test runs with tests in this suite
        return NextResponse.json({ runs: [] });
      }

      // Add suite filter to query
      query = query.in("id", testRunIdsInSuite);
    }

    // Execute query
    const queryResult = await query;
    data = queryResult.data;
    error = queryResult.error;

    if (error) {
      console.error("[API] Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform data to match frontend format
    const runs = (data || []).map((run: any) => ({
      id: run.id,
      timestamp: run.timestamp,
      project: run.project?.name || "default",
      project_display: run.project?.display_name || "Default Project",
      project_color: run.project?.color || "#3b82f6",
      environment: run.environment?.name || "unknown",
      environment_display: run.environment?.display_name || "Unknown",
      environment_color: run.environment?.color || "#3b82f6",
      trigger: run.trigger?.name || "unknown",
      trigger_display: run.trigger?.display_name || "Unknown",
      trigger_icon: run.trigger?.icon || "▶️",
      branch: run.branch,
      commit: run.commit,
      total: run.total,
      passed: run.passed,
      failed: run.failed,
      flaky: run.flaky,
      skipped: run.skipped,
      duration: formatDuration(run.duration),
      uploaded_filename: run.uploaded_filename,
    }));

    return NextResponse.json({ runs });
  } catch (error) {
    console.error("[API] Error fetching test runs:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch test runs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
