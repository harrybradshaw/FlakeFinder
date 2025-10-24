import { describe, it, expect } from "vitest";
import { groupRunsByDay } from "./trends-utils";

describe("groupRunsByDay - Date Grouping", () => {
  it("should group multiple runs on the same day into one entry", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 10,
        failed: 2,
        flaky: 1,
        total: 13,
      },
      {
        timestamp: "2024-10-24T14:00:00Z",
        passed: 15,
        failed: 1,
        flaky: 0,
        total: 16,
      },
      {
        timestamp: "2024-10-24T18:00:00Z",
        passed: 12,
        failed: 3,
        flaky: 2,
        total: 17,
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: "2024-10-24",
      timestamp: "2024-10-24T00:00:00Z",
      passed: 37, // 10 + 15 + 12
      failed: 6, // 2 + 1 + 3
      flaky: 3, // 1 + 0 + 2
      total: 46, // 13 + 16 + 17
      runsCount: 3,
      avgDuration: 0,
    });
  });

  it("should create separate entries for different days", () => {
    const runs = [
      {
        timestamp: "2024-10-22T10:00:00Z",
        passed: 10,
        failed: 2,
        flaky: 1,
        total: 13,
      },
      {
        timestamp: "2024-10-23T14:00:00Z",
        passed: 15,
        failed: 1,
        flaky: 0,
        total: 16,
      },
      {
        timestamp: "2024-10-24T18:00:00Z",
        passed: 12,
        failed: 3,
        flaky: 2,
        total: 17,
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2024-10-22");
    expect(result[1].date).toBe("2024-10-23");
    expect(result[2].date).toBe("2024-10-24");
  });

  it("should handle runs across midnight in different timezones", () => {
    const runs = [
      {
        timestamp: "2024-10-24T23:30:00Z", // Late evening UTC
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
      },
      {
        timestamp: "2024-10-25T00:30:00Z", // Early morning UTC next day
        passed: 15,
        failed: 0,
        flaky: 0,
        total: 15,
      },
    ];

    const result = groupRunsByDay(runs);

    // Should be 2 separate days in UTC
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2024-10-24");
    expect(result[0].passed).toBe(10);
    expect(result[1].date).toBe("2024-10-25");
    expect(result[1].passed).toBe(15);
  });

  it("should sort results chronologically", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
      },
      {
        timestamp: "2024-10-22T10:00:00Z",
        passed: 15,
        failed: 0,
        flaky: 0,
        total: 15,
      },
      {
        timestamp: "2024-10-23T10:00:00Z",
        passed: 12,
        failed: 0,
        flaky: 0,
        total: 12,
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(3);
    expect(result[0].date).toBe("2024-10-22");
    expect(result[1].date).toBe("2024-10-23");
    expect(result[2].date).toBe("2024-10-24");
  });

  it("should handle runs with different times on the same UTC day", () => {
    const runs = [
      {
        timestamp: "2024-10-24T00:00:01Z", // Just after midnight
        passed: 5,
        failed: 0,
        flaky: 0,
        total: 5,
      },
      {
        timestamp: "2024-10-24T12:00:00Z", // Noon
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
      },
      {
        timestamp: "2024-10-24T23:59:59Z", // Just before midnight
        passed: 8,
        failed: 0,
        flaky: 0,
        total: 8,
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2024-10-24");
    expect(result[0].passed).toBe(23); // 5 + 10 + 8
    expect(result[0].runsCount).toBe(3);
  });

  it("should handle empty runs array", () => {
    const runs: Array<{
      timestamp: string;
      passed: number;
      failed: number;
      flaky: number;
      total: number;
    }> = [];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(0);
  });

  it("should preserve all test counts correctly", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 100,
        failed: 5,
        flaky: 3,
        total: 108,
      },
      {
        timestamp: "2024-10-24T14:00:00Z",
        passed: 95,
        failed: 10,
        flaky: 5,
        total: 110,
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(195);
    expect(result[0].failed).toBe(15);
    expect(result[0].flaky).toBe(8);
    expect(result[0].total).toBe(218);
  });
});

describe("groupRunsByDay - Duration Calculations", () => {
  it("should convert milliseconds to seconds correctly", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 60000, // 60 seconds in milliseconds
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    expect(result[0].avgDuration).toBe(60); // Should be 60 seconds
  });

  it("should calculate average duration across multiple runs", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 60000, // 60 seconds
      },
      {
        timestamp: "2024-10-24T14:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 120000, // 120 seconds
      },
      {
        timestamp: "2024-10-24T18:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 90000, // 90 seconds
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    // Average: (60000 + 120000 + 90000) / 3 / 1000 = 270000 / 3 / 1000 = 90 seconds
    expect(result[0].avgDuration).toBe(90);
  });

  it("should handle runs with no duration", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    expect(result[0].avgDuration).toBe(0);
  });

  it("should round duration to nearest second", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 65499, // 65.499 seconds, should round to 65
      },
      {
        timestamp: "2024-10-24T14:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 65500, // 65.5 seconds, should round to 66
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    // Average: (65499 + 65500) / 2 / 1000 = 130999 / 2 / 1000 = 65.4995, rounds to 65
    expect(result[0].avgDuration).toBe(65);
  });

  it("should handle realistic test suite durations", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 100,
        failed: 2,
        flaky: 3,
        total: 105,
        duration: 4186000, // ~70 minutes in milliseconds
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    // 4186000 / 1000 = 4186 seconds = 69 minutes 46 seconds
    expect(result[0].avgDuration).toBe(4186);
  });

  it("should calculate separate averages for different days", () => {
    const runs = [
      {
        timestamp: "2024-10-22T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 60000, // 60 seconds
      },
      {
        timestamp: "2024-10-23T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 120000, // 120 seconds
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(2);
    expect(result[0].avgDuration).toBe(60);
    expect(result[1].avgDuration).toBe(120);
  });

  it("should handle mixed runs with and without duration", () => {
    const runs = [
      {
        timestamp: "2024-10-24T10:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 60000,
      },
      {
        timestamp: "2024-10-24T14:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        // No duration
      },
      {
        timestamp: "2024-10-24T18:00:00Z",
        passed: 10,
        failed: 0,
        flaky: 0,
        total: 10,
        duration: 90000,
      },
    ];

    const result = groupRunsByDay(runs);

    expect(result).toHaveLength(1);
    // Average: (60000 + 0 + 90000) / 3 / 1000 = 50 seconds
    expect(result[0].avgDuration).toBe(50);
  });
});
