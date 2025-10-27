/**
 * Utility functions for processing trends data
 */

export interface TrendRun {
  timestamp: string;
  passed: number;
  failed: number;
  flaky: number;
  total: number;
  wall_clock_duration?: number | null;
  duration?: number | null;
}

export interface DailyTrend {
  date: string;
  timestamp: string;
  passed: number;
  failed: number;
  flaky: number;
  total: number;
  runsCount: number;
  avgDuration: number;
}

/**
 * Groups test runs by day and calculates aggregated statistics
 * @param runs Array of test runs to group
 * @returns Array of daily aggregated trends, sorted chronologically
 */
export function groupRunsByDay(runs: TrendRun[]): DailyTrend[] {
  const dailyMap = new Map<
    string,
    {
      date: string;
      timestamp: string;
      passed: number;
      failed: number;
      flaky: number;
      total: number;
      count: number;
      totalDuration: number;
    }
  >();

  runs.forEach((run) => {
    // Use UTC date to avoid timezone issues
    const date = new Date(run.timestamp);
    const dateKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        timestamp: dateKey + "T00:00:00Z",
        passed: 0,
        failed: 0,
        flaky: 0,
        total: 0,
        count: 0,
        totalDuration: 0,
      });
    }

    const day = dailyMap.get(dateKey)!;
    day.passed += run.passed;
    day.failed += run.failed;
    day.flaky += run.flaky;
    day.total += run.total;
    day.count += 1;
    // Use duration if available, fallback to wall_clock_duration
    day.totalDuration += run.duration || run.wall_clock_duration || 0;
  });

  return Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      date: day.date,
      timestamp: day.timestamp,
      passed: day.passed,
      failed: day.failed,
      flaky: day.flaky,
      total: day.total,
      runsCount: day.count,
      avgDuration:
        day.count > 0 ? Math.round(day.totalDuration / day.count / 60000) : 0, // Convert ms to minutes
    }));
}
