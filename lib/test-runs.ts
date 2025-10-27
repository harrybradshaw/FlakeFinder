import { createClient } from "@supabase/supabase-js";
import type { TestRunDetails } from "@/types/api";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";
import {
  type TestRunWithDetails,
  type TestsWithSuiteDetails,
} from "@/types/repository";

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export async function getTestRunById(
  id: string,
): Promise<TestRunDetails | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Database not configured");
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  const repos = createRepositories(supabase);

  const testRun = await repos.testRuns.getTestRunWithFullDetails(id);

  if (!testRun) {
    return null;
  }

  const tests = await repos.testRuns.getTestsWithSuiteDetails(id);

  const testIds = tests.map((t) => t.id);
  const testAttempts = await repos.testRuns.getTestResultsForTests(testIds);
  const attemptsByTestId = new Map();
  if (testAttempts && testAttempts.length > 0) {
    for (const attempt of testAttempts) {
      if (!attemptsByTestId.has(attempt.test_id)) {
        attemptsByTestId.set(attempt.test_id, []);
      }
      attemptsByTestId.get(attempt.test_id).push(attempt);
    }
  }

  return mapTestRunToDTO(testRun, tests, attemptsByTestId);
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
): Promise<TestRunDetails | null> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Database not configured");
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  const repos = createRepositories(supabase);

  const userOrgIds = await repos.lookups.getUserOrganizations(userId);

  if (userOrgIds.length === 0) {
    return null;
  }

  const accessibleProjectIds =
    await repos.lookups.getAccessibleProjectIds(userOrgIds);

  if (accessibleProjectIds.length === 0) {
    return null;
  }

  const testRun = await repos.testRuns.getTestRunWithFullDetails(id);

  if (!testRun) {
    return null;
  }

  if (!accessibleProjectIds.includes(testRun.project_id)) {
    return null;
  }

  const tests = await repos.testRuns.getTestsWithSuiteDetails(id);

  const testIds = tests.map((t) => t.id);
  const testResults = await repos.testRuns.getTestResultsForTests(testIds);
  const resultsByTestId = new Map();
  if (testResults && testResults.length > 0) {
    for (const attempt of testResults) {
      if (!resultsByTestId.has(attempt.test_id)) {
        resultsByTestId.set(attempt.test_id, []);
      }
      resultsByTestId.get(attempt.test_id).push(attempt);
    }
  }

  return mapTestRunToDTO(testRun, tests, resultsByTestId);
}

function mapTestRunToDTO(
  testRun: TestRunWithDetails,
  tests: TestsWithSuiteDetails,
  resultsByTestId: Map<
    string,
    Database["public"]["Tables"]["test_results"]["Row"][]
  >,
): TestRunDetails {
  return {
    id: testRun.id,
    timestamp: testRun.timestamp,
    project: testRun.project?.name || "default",
    project_display: testRun.project?.display_name || "Default Project",
    project_color: testRun.project?.color || "#3b82f6",
    environmentName: testRun.environment?.name || "unknown",
    environment_display: testRun.environment?.display_name || "Unknown",
    environment_color: testRun.environment?.color || "#3b82f6",
    triggerName: testRun.trigger?.name || "unknown",
    trigger_display: testRun.trigger?.display_name || "Unknown",
    trigger_icon: testRun.trigger?.icon || "▶️",
    branch: testRun.branch,
    commit: testRun.commit,
    total: testRun.total,
    passed: testRun.passed,
    failed: testRun.failed,
    flaky: testRun.flaky,
    skipped: testRun.skipped,
    duration: formatDuration(testRun.wall_clock_duration || testRun.duration),
    ci_metadata:
      typeof testRun.ci_metadata === "object" &&
      testRun.ci_metadata !== null &&
      !Array.isArray(testRun.ci_metadata)
        ? (testRun.ci_metadata as Record<string, any>)
        : {},
    environment_data:
      typeof testRun.environment_data === "object" &&
      testRun.environment_data !== null &&
      !Array.isArray(testRun.environment_data)
        ? (testRun.environment_data as Record<string, any>)
        : undefined,
    // @ts-expect-error FIXME.
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
      screenshots: Array.isArray(test.screenshots)
        ? (test.screenshots as string[])
        : [],
      metadata:
        typeof test.metadata === "object" &&
        test.metadata !== null &&
        !Array.isArray(test.metadata)
          ? test.metadata
          : undefined,
      attempts: (resultsByTestId.get(test.id) || []).map((attempt) => ({
        attemptIndex: attempt.retry_index,
        testResultId: attempt.id,
        status: attempt.status,
        duration: attempt.duration,
        error: attempt.error,
        errorStack: attempt.error_stack,
        screenshots: Array.isArray(attempt.screenshots)
          ? attempt.screenshots
          : [],
        attachments: Array.isArray(attempt.attachments)
          ? attempt.attachments
          : [],
        startTime: attempt.started_at,
        stepsUrl: attempt.steps_url ?? undefined,
        lastFailedStep: attempt.last_failed_step ?? undefined,
      })),
    })),
  };
}
