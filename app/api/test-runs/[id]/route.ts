import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured");
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    // Get user authentication
    const { userId } = await auth();

    if (!userId) {
      console.log("[API] User not authenticated");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      return NextResponse.json(
        { error: "No accessible organizations" },
        { status: 403 },
      );
    }

    // Get accessible project IDs based on user's organizations
    const { data: orgProjects, error: orgProjectsError } = await supabase
      .from("organization_projects")
      .select("project_id, organization_id")
      .in("organization_id", userOrgIds);

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

    if (accessibleProjectIds.length === 0) {
      console.log("[API] User has no accessible projects");
      return NextResponse.json(
        { error: "No accessible projects" },
        { status: 403 },
      );
    }

    // Fetch test run with joined project, environment and trigger
    const { data: testRun, error: runError } = await supabase
      .from("test_runs")
      .select(
        `
        *,
        project:projects(name, display_name, color),
        environment:environments(name, display_name, color),
        trigger:test_triggers(name, display_name, icon)
      `,
      )
      .eq("id", id)
      .single();

    if (runError) {
      console.error("[API] Error fetching test run:", runError);
      if (runError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Test run not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ error: runError.message }, { status: 500 });
    }

    // Verify user has access to this test run's project
    if (!accessibleProjectIds.includes(testRun.project_id)) {
      console.log("[API] User attempting to access unauthorized test run");
      return NextResponse.json(
        { error: "Test run not found" },
        { status: 404 },
      );
    }

    // Fetch associated tests with suite_test information (name and file)
    const { data: tests, error: testsError } = await supabase
      .from("tests")
      .select(
        `
        *,
        suite_test:suite_tests(id, name, file)
      `,
      )
      .eq("test_run_id", id)
      .order("created_at", { ascending: true });

    if (testsError) {
      console.error("[API] Error fetching tests:", testsError);
      return NextResponse.json({ error: testsError.message }, { status: 500 });
    }

    // Fetch retry results for all tests
    const testIds = tests.map((t) => t.id);
    console.log(`[API] Fetching retry results for ${testIds.length} tests`);

    const { data: retryResults, error: retryError } = await supabase
      .from("test_results")
      .select("*")
      .in("test_id", testIds)
      .order("retry_index", { ascending: true });

    if (retryError) {
      console.error("[API] Error fetching retry results:", retryError);
      console.error(
        "[API] This might mean the test_results table doesn't exist yet. Run the updated schema.sql",
      );
      // Don't fail the request, just log the error
    } else {
      console.log(`[API] Found ${retryResults?.length || 0} retry results`);
    }

    // Group retry results by test_id
    const retryResultsByTestId = new Map();
    if (retryResults && retryResults.length > 0) {
      for (const result of retryResults) {
        if (!retryResultsByTestId.has(result.test_id)) {
          retryResultsByTestId.set(result.test_id, []);
        }
        retryResultsByTestId.get(result.test_id).push(result);
      }
    }

    // Transform data to match frontend format
    const response = {
      id: testRun.id,
      timestamp: testRun.timestamp,
      project: (testRun as any).project?.name || "default",
      project_display:
        (testRun as any).project?.display_name || "Default Project",
      project_color: (testRun as any).project?.color || "#3b82f6",
      environment: (testRun as any).environment?.name || "unknown",
      environment_display:
        (testRun as any).environment?.display_name || "Unknown",
      environment_color: (testRun as any).environment?.color || "#3b82f6",
      trigger: (testRun as any).trigger?.name || "unknown",
      trigger_display: (testRun as any).trigger?.display_name || "Unknown",
      trigger_icon: (testRun as any).trigger?.icon || "▶️",
      branch: testRun.branch,
      commit: testRun.commit,
      total: testRun.total,
      passed: testRun.passed,
      failed: testRun.failed,
      flaky: testRun.flaky,
      skipped: testRun.skipped,
      duration: formatDuration(testRun.duration),
      ci_metadata: testRun.ci_metadata || {},
      tests: tests.map((test) => ({
        id: test.id, // UUID - primary key in tests table (this specific execution instance)
        suite_test_id: test.suite_test_id, // UUID - foreign key to suite_tests table (the canonical test definition)
        name: (test as any).suite_test?.name || "Unknown Test", // Joined from suite_tests
        file: (test as any).suite_test?.file || "unknown", // Joined from suite_tests
        status: test.status,
        duration: test.duration,
        worker_index: test.worker_index,
        started_at: test.started_at,
        error: test.error,
        screenshots: test.screenshots || [],
        retryResults: retryResultsByTestId.get(test.id) || [],
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[API] Error fetching test run:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch test run",
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
