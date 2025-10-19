import { createClient } from "@supabase/supabase-js";
import type { TestRun } from "./mock-data";

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Fetch a test run by ID without authorization check
 * Use this only after authorization has been verified (e.g., in middleware)
 * @param id - Test run ID
 * @returns Test run data or null if not found
 */
export async function getTestRunById(id: string): Promise<TestRun | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Database not configured");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Fetch test run with joined project, environment and trigger
  const { data: testRun, error: runError } = await supabase
    .from("test_runs")
    .select(
      `
      *,
      project:projects(name, display_name, color),
      environment:environments(name, display_name, color),
      trigger:test_triggers(name, display_name, icon)
    `
    )
    .eq("id", id)
    .single();

  if (runError) {
    if (runError.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(`Error fetching test run: ${runError.message}`);
  }

  // Fetch associated tests with suite_test information (name and file)
  const { data: tests, error: testsError } = await supabase
    .from("tests")
    .select(
      `
      *,
      suite_test:suite_tests(id, name, file)
    `
    )
    .eq("test_run_id", id)
    .order("created_at", { ascending: true });

  if (testsError) {
    throw new Error(`Error fetching tests: ${testsError.message}`);
  }

  // Fetch retry results for all tests
  const testIds = tests.map((t) => t.id);

  const { data: retryResults, error: retryError } = await supabase
    .from("test_results")
    .select("*")
    .in("test_id", testIds)
    .order("retry_index", { ascending: true });

  if (retryError) {
    console.error("[getTestRunById] Error fetching retry results:", retryError);
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
  return {
    id: testRun.id,
    timestamp: testRun.timestamp,
    project: (testRun as any).project?.name || "default",
    project_display: (testRun as any).project?.display_name || "Default Project",
    project_color: (testRun as any).project?.color || "#3b82f6",
    environment: (testRun as any).environment?.name || "unknown",
    environment_display: (testRun as any).environment?.display_name || "Unknown",
    environment_color: (testRun as any).environment?.color || "#3b82f6",
    trigger: (testRun as any).trigger?.name || "unknown",
    trigger_display: (testRun as any).trigger?.display_name || "Unknown",
    trigger_icon: (testRun as any).trigger?.icon || "▶️",
    branch: testRun.branch,
    commit: testRun.commit || "",
    total: testRun.total,
    passed: testRun.passed,
    failed: testRun.failed,
    flaky: testRun.flaky,
    skipped: testRun.skipped,
    duration: formatDuration(testRun.duration),
    ci_metadata: testRun.ci_metadata || {},
    tests: tests.map((test) => ({
      id: test.id,
      suite_test_id: test.suite_test_id,
      name: (test as any).suite_test?.name || "Unknown Test",
      file: (test as any).suite_test?.file || "unknown",
      status: test.status as "passed" | "failed" | "flaky" | "skipped" | "timedOut",
      duration: test.duration,
      worker_index: test.worker_index,
      started_at: test.started_at,
      error: test.error,
      screenshots: test.screenshots || [],
      retryResults: retryResultsByTestId.get(test.id) || [],
    })),
  };
}

/**
 * Fetch a test run by ID with authorization check
 * @param id - Test run ID
 * @param userId - User ID for authorization
 * @returns Test run data or null if not found/unauthorized
 */
export async function getTestRun(
  id: string,
  userId: string
): Promise<TestRun | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Database not configured");
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  // Get user's custom organization memberships
  const { data: userOrgs, error: userOrgsError } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);

  if (userOrgsError) {
    throw new Error(`Error fetching user organizations: ${userOrgsError.message}`);
  }

  const userOrgIds = userOrgs?.map((uo) => uo.organization_id) || [];

  if (userOrgIds.length === 0) {
    return null; // User has no organization memberships
  }

  // Get accessible project IDs based on user's organizations
  const { data: orgProjects, error: orgProjectsError } = await supabase
    .from("organization_projects")
    .select("project_id, organization_id")
    .in("organization_id", userOrgIds);

  if (orgProjectsError) {
    throw new Error(`Error fetching organization projects: ${orgProjectsError.message}`);
  }

  const accessibleProjectIds = orgProjects?.map((op) => op.project_id) || [];

  if (accessibleProjectIds.length === 0) {
    return null; // User has no accessible projects
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
    `
    )
    .eq("id", id)
    .single();

  if (runError) {
    if (runError.code === "PGRST116") {
      return null; // Not found
    }
    throw new Error(`Error fetching test run: ${runError.message}`);
  }

  // Verify user has access to this test run's project
  if (!accessibleProjectIds.includes(testRun.project_id)) {
    return null; // Unauthorized
  }

  // Fetch associated tests with suite_test information (name and file)
  const { data: tests, error: testsError } = await supabase
    .from("tests")
    .select(
      `
      *,
      suite_test:suite_tests(id, name, file)
    `
    )
    .eq("test_run_id", id)
    .order("created_at", { ascending: true });

  if (testsError) {
    throw new Error(`Error fetching tests: ${testsError.message}`);
  }

  // Fetch retry results for all tests
  const testIds = tests.map((t) => t.id);

  const { data: retryResults, error: retryError } = await supabase
    .from("test_results")
    .select("*")
    .in("test_id", testIds)
    .order("retry_index", { ascending: true });

  if (retryError) {
    console.error("[getTestRun] Error fetching retry results:", retryError);
    // Don't fail the request, just log the error
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
  return {
    id: testRun.id,
    timestamp: testRun.timestamp,
    project: (testRun as any).project?.name || "default",
    project_display: (testRun as any).project?.display_name || "Default Project",
    project_color: (testRun as any).project?.color || "#3b82f6",
    environment: (testRun as any).environment?.name || "unknown",
    environment_display: (testRun as any).environment?.display_name || "Unknown",
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
      id: test.id,
      suite_test_id: test.suite_test_id,
      name: (test as any).suite_test?.name || "Unknown Test",
      file: (test as any).suite_test?.file || "unknown",
      status: test.status,
      duration: test.duration,
      worker_index: test.worker_index,
      started_at: test.started_at,
      error: test.error,
      screenshots: test.screenshots || [],
      retryResults: retryResultsByTestId.get(test.id) || [],
    })),
  };
}
