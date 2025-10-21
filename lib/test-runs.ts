import { createClient } from "@supabase/supabase-js";
import type { TestRun } from "./mock-data";
import { type Database } from "@/types/supabase";

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

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
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
    `,
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
    `,
    )
    .eq("test_run_id", id)
    .order("created_at", { ascending: true });

  if (testsError) {
    throw new Error(`Error fetching tests: ${testsError.message}`);
  }

  // Fetch test attempts (including retries) for all tests
  const testIds = tests.map((t) => t.id);

  const { data: testAttempts, error: attemptsError } = await supabase
    .from("test_results")
    .select("*")
    .in("test_id", testIds)
    .order("retry_index", { ascending: true });

  if (attemptsError) {
    console.error("[getTestRunById] Error fetching test attempts:", attemptsError);
  }

  // Group test attempts by test_id
  const attemptsByTestId = new Map();
  if (testAttempts && testAttempts.length > 0) {
    for (const attempt of testAttempts) {
      if (!attemptsByTestId.has(attempt.test_id)) {
        attemptsByTestId.set(attempt.test_id, []);
      }
      attemptsByTestId.get(attempt.test_id).push(attempt);
    }
  }

  // Transform data to match frontend format
  return {
    id: testRun.id,
    timestamp: testRun.timestamp,
    project: (testRun).project?.name || "default",
    project_display:
      (testRun).project?.display_name || "Default Project",
    project_color: (testRun).project?.color || "#3b82f6",
    environment: (testRun as any).environment?.name || "unknown",
    environment_display:
      (testRun as any).environment?.display_name || "Unknown",
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
    ci_metadata: (typeof testRun.ci_metadata === 'object' && testRun.ci_metadata !== null && !Array.isArray(testRun.ci_metadata)) ? (testRun.ci_metadata as Record<string, any>) : {},
    tests: tests.map((test) => ({
      id: test.id,
      suite_test_id: test.suite_test_id ?? undefined,
      name: test.suite_test?.name || "Unknown Test",
      file: test.suite_test?.file || "unknown",
      status: test.status as
        | "passed"
        | "failed"
        | "flaky"
        | "skipped"
        | "timedOut",
      duration: test.duration,
      worker_index: test.worker_index ?? undefined,
      started_at: test.started_at ?? undefined,
      error: test.error ?? undefined,
      screenshots: Array.isArray(test.screenshots) ? (test.screenshots as string[]) : [],
      metadata: (typeof test.metadata === 'object' && test.metadata !== null && !Array.isArray(test.metadata)) ? test.metadata : undefined,
      attempts: (attemptsByTestId.get(test.id) || []).map((attempt: any) => ({
        attemptIndex: attempt.retry_index,
        status: attempt.status,
        duration: attempt.duration,
        error: attempt.error,
        errorStack: attempt.error_stack,
        screenshots: Array.isArray(attempt.screenshots) ? attempt.screenshots : [],
        attachments: Array.isArray(attempt.attachments) ? attempt.attachments : [],
        startTime: attempt.started_at,
      })),
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
  userId: string,
): Promise<TestRun | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Database not configured");
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  // Get user's custom organization memberships
  const { data: userOrgs, error: userOrgsError } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);

  if (userOrgsError) {
    throw new Error(
      `Error fetching user organizations: ${userOrgsError.message}`,
    );
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
    throw new Error(
      `Error fetching organization projects: ${orgProjectsError.message}`,
    );
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
    `,
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
    `,
    )
    .eq("test_run_id", id)
    .order("created_at", { ascending: true });

  if (testsError) {
    throw new Error(`Error fetching tests: ${testsError.message}`);
  }

  // Fetch test attempts (including retries) for all tests
  const testIds = tests.map((t) => t.id);

  const { data: testAttempts, error: attemptsError } = await supabase
    .from("test_results")
    .select("*")
    .in("test_id", testIds)
    .order("retry_index", { ascending: true });

  if (attemptsError) {
    console.error(
      "[getTestRunByIdWithAuth] Error fetching test attempts:",
      attemptsError,
    );
  }

  // Group test attempts by test_id
  const attemptsByTestId = new Map();
  if (testAttempts && testAttempts.length > 0) {
    for (const attempt of testAttempts) {
      if (!attemptsByTestId.has(attempt.test_id)) {
        attemptsByTestId.set(attempt.test_id, []);
      }
      attemptsByTestId.get(attempt.test_id).push(attempt);
    }
  }

  // Transform data to match frontend format
  return {
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
    ci_metadata: (typeof testRun.ci_metadata === 'object' && testRun.ci_metadata !== null && !Array.isArray(testRun.ci_metadata)) ? (testRun.ci_metadata as Record<string, any>) : {},
    tests: tests.map((test) => ({
      id: test.id,
      suite_test_id: test.suite_test_id ?? undefined,
      name: test.suite_test?.name || "Unknown Test",
      file: test.suite_test?.file || "unknown",
      status: test.status as
        | "passed"
        | "failed"
        | "flaky"
        | "skipped"
        | "timedOut",
      duration: test.duration,
      worker_index: test.worker_index ?? undefined,
      started_at: test.started_at ?? undefined,
      error: test.error ?? undefined,
      screenshots: Array.isArray(test.screenshots) ? (test.screenshots as string[]) : [],
      metadata: (typeof test.metadata === 'object' && test.metadata !== null && !Array.isArray(test.metadata)) ? test.metadata : undefined,
      attempts: (attemptsByTestId.get(test.id) || []).map((attempt: any) => ({
        attemptIndex: attempt.retry_index,
        status: attempt.status,
        duration: attempt.duration,
        error: attempt.error,
        errorStack: attempt.error_stack,
        screenshots: Array.isArray(attempt.screenshots) ? attempt.screenshots : [],
        attachments: Array.isArray(attempt.attachments) ? attempt.attachments : [],
        startTime: attempt.started_at,
      })),
    })),
  };
}
