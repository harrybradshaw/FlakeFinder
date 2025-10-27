/**
 * Flakiness and Performance Metrics Aggregation Service
 *
 * This service calculates daily metrics for test flakiness and performance,
 * enabling trend analysis and anomaly detection.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { MetricsRepository } from "@/lib/repositories";

export interface FlakinessMetrics {
  suite_test_id: string;
  date: string;
  total_runs: number;
  flaky_runs: number;
  failed_runs: number;
  passed_runs: number;
  flake_rate: number;
  avg_duration: number;
}

export interface PerformanceMetrics {
  suite_test_id: string;
  date: string;
  avg_duration: number;
  p50_duration: number;
  p90_duration: number;
  p95_duration: number;
  p99_duration: number;
  std_deviation: number;
  sample_size: number;
}

/**
 * Calculate percentile from sorted array
 */
function calculatePercentile(
  sortedValues: number[],
  percentile: number,
): number {
  if (sortedValues.length === 0) return 0;

  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sortedValues[lower];
  }

  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;

  const squareDiffs = values.map((value) => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;

  return Math.sqrt(avgSquareDiff);
}

/**
 * Aggregate flakiness metrics for a specific date
 * @param metricsRepo Metrics repository
 * @param date Date to aggregate (YYYY-MM-DD format)
 * @returns Number of metrics calculated
 */
export async function aggregateFlakinessMetrics(
  metricsRepo: MetricsRepository,
  date: string,
): Promise<number> {
  console.log(`[Flakiness] Aggregating metrics for ${date}`);

  // Get all test runs for the specified date
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Query all tests for this date using repository
  const tests = await metricsRepo.getTestsForDateRange(startOfDay, endOfDay);

  if (!tests || tests.length === 0) {
    console.log(`[Flakiness] No tests found for ${date}`);
    return 0;
  }

  // Group tests by suite_test_id
  const testsBySuiteTest = new Map<string, typeof tests>();

  for (const test of tests) {
    if (!test.suite_test_id) continue;

    if (!testsBySuiteTest.has(test.suite_test_id)) {
      testsBySuiteTest.set(test.suite_test_id, []);
    }
    testsBySuiteTest.get(test.suite_test_id)!.push(test);
  }

  // Calculate metrics for each suite_test
  const metrics: FlakinessMetrics[] = [];

  for (const [suite_test_id, testRuns] of testsBySuiteTest) {
    const total_runs = testRuns.length;
    const flaky_runs = testRuns.filter((t) => t.status === "flaky").length;
    const failed_runs = testRuns.filter((t) => t.status === "failed").length;
    const passed_runs = testRuns.filter((t) => t.status === "passed").length;

    const flake_rate = total_runs > 0 ? (flaky_runs / total_runs) * 100 : 0;

    const durations = testRuns
      .map((t) => t.duration)
      .filter((d): d is number => d != null && d > 0);

    const avg_duration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    metrics.push({
      suite_test_id,
      date,
      total_runs,
      flaky_runs,
      failed_runs,
      passed_runs,
      flake_rate: Math.round(flake_rate * 100) / 100, // Round to 2 decimals
      avg_duration,
    });
  }

  // Save metrics using repository
  if (metrics.length > 0) {
    await metricsRepo.saveFlakinessMetrics(
      metrics.map((m) => ({
        ...m,
        updated_at: new Date().toISOString(),
      })),
    );
  }

  console.log(`[Flakiness] Calculated ${metrics.length} metrics for ${date}`);
  return metrics.length;
}

/**
 * Aggregate performance metrics for a specific date
 * @param metricsRepo Metrics repository
 * @param date Date to aggregate (YYYY-MM-DD format)
 * @returns Number of metrics calculated
 */
export async function aggregatePerformanceMetrics(
  metricsRepo: MetricsRepository,
  date: string,
): Promise<number> {
  console.log(`[Performance] Aggregating metrics for ${date}`);

  // Get all test runs for the specified date
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // Query all tests for this date using repository
  const allTests = await metricsRepo.getTestsForDateRange(startOfDay, endOfDay);

  // Filter for tests with valid durations
  const tests = allTests.filter(
    (t) => t.suite_test_id && t.duration && t.duration > 0,
  );

  if (!tests || tests.length === 0) {
    console.log(`[Performance] No tests found for ${date}`);
    return 0;
  }

  // Group tests by suite_test_id
  const testsBySuiteTest = new Map<string, number[]>();

  for (const test of tests) {
    if (!test.suite_test_id || !test.duration) continue;

    if (!testsBySuiteTest.has(test.suite_test_id)) {
      testsBySuiteTest.set(test.suite_test_id, []);
    }
    testsBySuiteTest.get(test.suite_test_id)!.push(test.duration);
  }

  // Calculate metrics for each suite_test
  const metrics: PerformanceMetrics[] = [];

  for (const [suite_test_id, durations] of testsBySuiteTest) {
    if (durations.length === 0) continue;

    // Sort durations for percentile calculations
    const sortedDurations = [...durations].sort((a, b) => a - b);

    const avg_duration = Math.round(
      durations.reduce((a, b) => a + b, 0) / durations.length,
    );

    const p50_duration = Math.round(calculatePercentile(sortedDurations, 50));
    const p90_duration = Math.round(calculatePercentile(sortedDurations, 90));
    const p95_duration = Math.round(calculatePercentile(sortedDurations, 95));
    const p99_duration = Math.round(calculatePercentile(sortedDurations, 99));

    const std_deviation = calculateStdDev(durations, avg_duration);

    metrics.push({
      suite_test_id,
      date,
      avg_duration,
      p50_duration,
      p90_duration,
      p95_duration,
      p99_duration,
      std_deviation: Math.round(std_deviation * 100) / 100, // Round to 2 decimals
      sample_size: durations.length,
    });
  }

  // Save metrics using repository
  if (metrics.length > 0) {
    await metricsRepo.savePerformanceMetrics(
      metrics.map((m) => ({
        ...m,
        updated_at: new Date().toISOString(),
      })),
    );
  }

  console.log(`[Performance] Calculated ${metrics.length} metrics for ${date}`);
  return metrics.length;
}

/**
 * Aggregate metrics for a date range
 * @param startDate Start date (YYYY-MM-DD)
 * @param endDate End date (YYYY-MM-DD)
 */
export async function aggregateMetricsForDateRange(
  startDate: string,
  endDate: string,
): Promise<{ flakinessCount: number; performanceCount: number }> {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error("Supabase credentials not configured");
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
  );

  const { MetricsRepository } = await import("@/lib/repositories");
  const metricsRepo = new MetricsRepository(supabase);

  const start = new Date(startDate);
  const end = new Date(endDate);

  let flakinessCount = 0;
  let performanceCount = 0;

  // Iterate through each date
  for (
    let date = new Date(start);
    date <= end;
    date.setDate(date.getDate() + 1)
  ) {
    const dateStr = date.toISOString().split("T")[0];

    try {
      const flakiness = await aggregateFlakinessMetrics(metricsRepo, dateStr);
      const performance = await aggregatePerformanceMetrics(
        metricsRepo,
        dateStr,
      );

      flakinessCount += flakiness;
      performanceCount += performance;
    } catch (error) {
      console.error(`[Aggregation] Error processing ${dateStr}:`, error);
      // Continue with next date
    }
  }

  return { flakinessCount, performanceCount };
}

/**
 * Aggregate metrics for yesterday (useful for daily cron jobs)
 */
export async function aggregateYesterdayMetrics(): Promise<{
  flakinessCount: number;
  performanceCount: number;
}> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split("T")[0];

  return aggregateMetricsForDateRange(dateStr, dateStr);
}
