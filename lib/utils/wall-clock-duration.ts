/**
 * Calculate the wall-clock duration of a test run
 * This accounts for parallel test execution by finding the time from
 * the first test start to the last test end.
 */

export interface TestTiming {
  started_at: string | Date;
  duration: number; // in milliseconds
}

/**
 * Calculates wall-clock duration from test timings
 * @param tests Array of tests with start times and durations
 * @returns Wall-clock duration in milliseconds, or null if no valid test timings
 */
export function calculateWallClockDuration(tests: TestTiming[]): number | null {
  // Filter tests that have timing info
  const timedTests = tests.filter(
    (t) => t.started_at && t.duration != null && t.duration >= 0,
  );

  if (timedTests.length === 0) {
    return null;
  }

  // Convert all start times to timestamps
  const startTimes = timedTests.map((t) => new Date(t.started_at).getTime());

  // Find earliest start time
  const minTime = Math.min(...startTimes);

  // Find latest end time (start + duration)
  const maxTime = Math.max(
    ...timedTests.map((t, i) => startTimes[i] + t.duration),
  );

  // Wall-clock duration is the difference
  return maxTime - minTime;
}
