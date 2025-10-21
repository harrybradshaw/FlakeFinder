/**
 * Utility functions for aggregating and calculating test metrics
 */

export interface TestMetrics {
  suite_test_id: string;
  name: string;
  file: string;
  totalRuns: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  totalDuration: number;
  recentStatuses: { status: string; started_at: string }[];
}

export interface TestResponse {
  suite_test_id: string;
  name: string;
  file: string;
  totalRuns: number;
  passRate: string;
  failRate: string;
  flakyRate: string;
  avgDuration: number;
  recentStatuses: string[];
  health: number;
}

/**
 * Calculate health score for a test based on its metrics
 * @param metrics - Test metrics including pass/fail/flaky counts
 * @returns Health score from 0-100 (100 = perfect, 0 = terrible)
 */
export function calculateHealth(metrics: {
  totalRuns: number;
  passed: number;
  failed: number;
  flaky: number;
}): number {
  if (metrics.totalRuns === 0) return 100;

  const failRate = (metrics.failed / metrics.totalRuns) * 100;
  const flakyRate = (metrics.flaky / metrics.totalRuns) * 100;

  // Health score: 100 = perfect, 0 = terrible
  // Penalize failures more than flakiness
  return Math.max(0, 100 - failRate * 2 - flakyRate);
}

/**
 * Transform test metrics into response format
 * @param metrics - Raw test metrics
 * @returns Formatted test response with calculated rates and health
 */
export function transformTestMetrics(metrics: TestMetrics): TestResponse {
  // Sort statuses by timestamp descending (most recent first) and limit to 10
  const sortedStatuses = [...metrics.recentStatuses]
    .sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )
    .slice(0, 10);

  return {
    suite_test_id: metrics.suite_test_id,
    name: metrics.name,
    file: metrics.file,
    totalRuns: metrics.totalRuns,
    passRate:
      metrics.totalRuns > 0
        ? ((metrics.passed / metrics.totalRuns) * 100).toFixed(1)
        : "0.0",
    failRate:
      metrics.totalRuns > 0
        ? ((metrics.failed / metrics.totalRuns) * 100).toFixed(1)
        : "0.0",
    flakyRate:
      metrics.totalRuns > 0
        ? ((metrics.flaky / metrics.totalRuns) * 100).toFixed(1)
        : "0.0",
    avgDuration:
      metrics.totalRuns > 0
        ? Math.round(metrics.totalDuration / metrics.totalRuns)
        : 0,
    recentStatuses: sortedStatuses.map((rs) => rs.status),
    health: calculateHealth(metrics),
  };
}

/**
 * Sort tests by health score (worst first)
 * @param tests - Array of test responses
 * @returns Sorted array with unhealthiest tests first
 */
export function sortTestsByHealth(tests: TestResponse[]): TestResponse[] {
  return [...tests].sort((a, b) => a.health - b.health);
}

/**
 * Calculate the most recent status from a list of statuses
 * Assumes statuses are already sorted by started_at descending
 * @param statuses - Array of status objects with started_at timestamps
 * @returns The most recent status or 'unknown' if empty
 */
export function getMostRecentStatus(
  statuses: { status: string; started_at: string }[],
): string {
  if (statuses.length === 0) return "unknown";
  return statuses[0].status;
}

/**
 * Aggregate test executions by suite_test_id
 * @param tests - Raw test execution data from database
 * @returns Map of suite_test_id to aggregated metrics
 */
export function aggregateTestMetrics(
  tests: Array<{
    suite_test_id: string;
    status: string;
    duration: number | null;
    test_run_id: string;
    started_at: string;
    suite_test: {
      id: string;
      name: string;
      file: string;
    } | null;
  }>,
): Map<string, TestMetrics> {
  const testMetrics = new Map<string, TestMetrics>();

  for (const test of tests) {
    const suiteTestId = test.suite_test_id;
    const suiteTest = test.suite_test;

    // Skip tests without suite_test reference
    if (!suiteTestId || !suiteTest) {
      continue;
    }

    if (!testMetrics.has(suiteTestId)) {
      testMetrics.set(suiteTestId, {
        suite_test_id: suiteTestId,
        name: suiteTest.name,
        file: suiteTest.file,
        totalRuns: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
        totalDuration: 0,
        recentStatuses: [],
      });
    }

    const metrics = testMetrics.get(suiteTestId)!;
    metrics.totalRuns++;
    metrics.totalDuration += test.duration || 0;

    // Track status counts
    switch (test.status) {
      case "passed":
        metrics.passed++;
        break;
      case "failed":
        metrics.failed++;
        break;
      case "flaky":
        metrics.flaky++;
        break;
      case "skipped":
        metrics.skipped++;
        break;
    }

    metrics.recentStatuses.push({
      status: test.status,
      started_at: test.started_at,
    });
  }

  return testMetrics;
}
