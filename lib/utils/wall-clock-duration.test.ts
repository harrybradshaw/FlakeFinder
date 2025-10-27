import { describe, it, expect } from "vitest";
import {
  calculateWallClockDuration,
  type TestTiming,
} from "./wall-clock-duration";

describe("calculateWallClockDuration", () => {
  it("should calculate wall-clock duration for sequential tests", () => {
    const tests: TestTiming[] = [
      { started_at: "2024-10-24T10:00:00.000Z", duration: 1000 }, // 1s
      { started_at: "2024-10-24T10:00:01.000Z", duration: 2000 }, // 2s
      { started_at: "2024-10-24T10:00:03.000Z", duration: 1500 }, // 1.5s
    ];

    const result = calculateWallClockDuration(tests);

    // First test starts at 0s, last test ends at 3s + 1.5s = 4.5s
    expect(result).toBe(4500);
  });

  it("should calculate wall-clock duration for parallel tests", () => {
    const tests: TestTiming[] = [
      { started_at: "2024-10-24T10:00:00.000Z", duration: 5000 }, // Lane 1: 0-5s
      { started_at: "2024-10-24T10:00:00.500Z", duration: 3000 }, // Lane 2: 0.5-3.5s
      { started_at: "2024-10-24T10:00:01.000Z", duration: 2000 }, // Lane 3: 1-3s
    ];

    const result = calculateWallClockDuration(tests);

    // Tests run in parallel, wall-clock is from 0s to 5s
    expect(result).toBe(5000);
  });

  it("should handle the example from the timeline (1m 43s)", () => {
    const tests: TestTiming[] = [
      { started_at: "2024-10-24T10:00:00.000Z", duration: 50000 }, // Lane 1
      { started_at: "2024-10-24T10:00:05.000Z", duration: 45000 }, // Lane 2
      { started_at: "2024-10-24T10:00:10.000Z", duration: 60000 }, // Lane 3
      { started_at: "2024-10-24T10:00:15.000Z", duration: 88000 }, // Lane 4
    ];

    const result = calculateWallClockDuration(tests);

    // Lane 4 starts at 15s and runs for 88s = ends at 103s = 1m 43s
    expect(result).toBe(103000);
  });

  it("should return null for empty array", () => {
    const result = calculateWallClockDuration([]);
    expect(result).toBeNull();
  });

  it("should return null when no tests have timing info", () => {
    const tests: TestTiming[] = [
      { started_at: "", duration: 1000 },
      { started_at: "2024-10-24T10:00:00.000Z", duration: -1 },
    ];

    const result = calculateWallClockDuration(tests);
    expect(result).toBeNull();
  });

  it("should handle single test", () => {
    const tests: TestTiming[] = [
      { started_at: "2024-10-24T10:00:00.000Z", duration: 5000 },
    ];

    const result = calculateWallClockDuration(tests);
    expect(result).toBe(5000);
  });

  it("should handle tests with Date objects", () => {
    const tests: TestTiming[] = [
      { started_at: new Date("2024-10-24T10:00:00.000Z"), duration: 2000 },
      { started_at: new Date("2024-10-24T10:00:01.000Z"), duration: 3000 },
    ];

    const result = calculateWallClockDuration(tests);

    // First starts at 0s, second ends at 1s + 3s = 4s
    expect(result).toBe(4000);
  });

  it("should ignore tests with missing or invalid timing", () => {
    const tests: TestTiming[] = [
      { started_at: "2024-10-24T10:00:00.000Z", duration: 2000 },
      { started_at: "", duration: 5000 }, // Invalid - no start time
      { started_at: "2024-10-24T10:00:01.000Z", duration: 3000 },
    ];

    const result = calculateWallClockDuration(tests);

    // Should only consider the two valid tests
    // First starts at 0s, second ends at 1s + 3s = 4s
    expect(result).toBe(4000);
  });

  it("should handle tests that start at the same time", () => {
    const tests: TestTiming[] = [
      { started_at: "2024-10-24T10:00:00.000Z", duration: 3000 },
      { started_at: "2024-10-24T10:00:00.000Z", duration: 5000 },
      { started_at: "2024-10-24T10:00:00.000Z", duration: 2000 },
    ];

    const result = calculateWallClockDuration(tests);

    // All start at the same time, longest one takes 5s
    expect(result).toBe(5000);
  });

  it("should handle zero duration tests", () => {
    const tests: TestTiming[] = [
      { started_at: "2024-10-24T10:00:00.000Z", duration: 0 },
      { started_at: "2024-10-24T10:00:01.000Z", duration: 2000 },
    ];

    const result = calculateWallClockDuration(tests);

    // From 0s to 1s + 2s = 3s
    expect(result).toBe(3000);
  });

  it("should handle realistic parallel execution scenario", () => {
    // Simulating 4 workers running tests in parallel
    const tests: TestTiming[] = [
      // Worker 1
      { started_at: "2024-10-24T10:00:00.000Z", duration: 10000 },
      { started_at: "2024-10-24T10:00:10.000Z", duration: 8000 },
      // Worker 2
      { started_at: "2024-10-24T10:00:00.100Z", duration: 12000 },
      { started_at: "2024-10-24T10:00:12.100Z", duration: 6000 },
      // Worker 3
      { started_at: "2024-10-24T10:00:00.200Z", duration: 15000 },
      // Worker 4
      { started_at: "2024-10-24T10:00:00.300Z", duration: 20000 },
    ];

    const result = calculateWallClockDuration(tests);

    // Worker 4 takes the longest: starts at 0.3s, runs for 20s = ends at 20.3s
    expect(result).toBe(20300);
  });
});
