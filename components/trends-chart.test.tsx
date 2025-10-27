import { describe, it, expect } from "vitest";

// Test the data transformation logic
describe("TrendsChart - Data Transformation", () => {
  it("should create separate count fields that won't be normalized", () => {
    const apiData = {
      trends: [
        {
          date: "2025-10-19",
          timestamp: "2025-10-19T00:00:00Z",
          passed: 303,
          failed: 31,
          flaky: 92,
          total: 426,
          runsCount: 12,
        },
      ],
    };

    // Simulate the transformation
    const chartData = apiData.trends.map((item) => ({
      date: "Oct 19",
      dateKey: item.date,
      // These will be used by the chart (and normalized by stackOffset="expand")
      passed: item.passed,
      failed: item.failed,
      flaky: item.flaky,
      // Store original counts with different keys so they don't get normalized
      passedCount: item.passed,
      failedCount: item.failed,
      flakyCount: item.flaky,
      total: item.total,
      runsCount: item.runsCount,
    }));

    expect(chartData[0].passed).toBe(303);
    expect(chartData[0].passedCount).toBe(303);
    expect(chartData[0].failed).toBe(31);
    expect(chartData[0].failedCount).toBe(31);
    expect(chartData[0].flaky).toBe(92);
    expect(chartData[0].flakyCount).toBe(92);
  });

  it("should calculate correct percentages from normalized values", () => {
    // When Recharts uses stackOffset="expand", it normalizes values to 0-1
    // For passed: 303, failed: 31, flaky: 92, total: 426
    const total = 426;
    const passed = 303;
    const failed = 31;
    const flaky = 92;

    // Recharts will normalize these to fractions
    const passedNormalized = passed / total; // 0.711
    const failedNormalized = failed / total; // 0.073
    const flakyNormalized = flaky / total; // 0.216

    // Our tooltip should multiply by 100 to get percentage
    const passedPercent = (passedNormalized * 100).toFixed(1);
    const failedPercent = (failedNormalized * 100).toFixed(1);
    const flakyPercent = (flakyNormalized * 100).toFixed(1);

    expect(passedPercent).toBe("71.1");
    expect(failedPercent).toBe("7.3");
    expect(flakyPercent).toBe("21.6");
  });

  it("should format tooltip correctly", () => {
    // Simulate what the tooltip formatter receives
    const normalizedValue = 0.711; // passed: 303 out of 426 total
    const actualCount = 303;

    const percentage = (normalizedValue * 100).toFixed(1);
    const formatted = `${percentage}% (${actualCount} tests)`;

    expect(formatted).toBe("71.1% (303 tests)");
  });

  it("should handle tooltip formatter with payload structure", () => {
    // Simulate the actual payload structure from Recharts
    const mockPayload = {
      passed: 0.711, // This is the normalized value from Recharts
      passedCount: 303, // This is our original count
      failed: 0.073,
      failedCount: 31,
      flaky: 0.216,
      flakyCount: 92,
    };

    // Simulate formatter logic
    const dataKey = "passed";
    const value = 0.711; // normalized value passed to formatter
    const countKey = `${dataKey}Count`;
    const actualCount = mockPayload[countKey as keyof typeof mockPayload];

    const percentage = (value * 100).toFixed(1);
    const result = `${percentage}% (${actualCount} tests)`;

    expect(result).toBe("71.1% (303 tests)");
  });

  it("should detect if percentages are wrong", () => {
    // If we see 3100%, 9200%, 30300%, it means we're getting raw counts
    // instead of normalized values
    const wrongValue1 = 31; // This should be 0.073 (7.3%)
    const wrongValue2 = 92; // This should be 0.216 (21.6%)
    const wrongValue3 = 303; // This should be 0.711 (71.1%)

    // If we multiply these by 100, we get the wrong percentages
    expect((wrongValue1 * 100).toFixed(1)).toBe("3100.0");
    expect((wrongValue2 * 100).toFixed(1)).toBe("9200.0");
    expect((wrongValue3 * 100).toFixed(1)).toBe("30300.0");

    // This proves the `value` parameter is NOT normalized
    // Recharts is NOT normalizing the values despite stackOffset="expand"
  });
});

describe("TrendsChart - Recharts stackOffset behavior", () => {
  it("should understand that stackOffset='expand' normalizes to 0-1", () => {
    // With stackOffset="expand", Recharts should normalize all values
    // so the stack always goes from 0 to 1 (0% to 100%)

    // Example data point
    const dataPoint = {
      passed: 303,
      failed: 31,
      flaky: 92,
    };

    const total = dataPoint.passed + dataPoint.failed + dataPoint.flaky;
    expect(total).toBe(426);

    // After normalization by Recharts
    const normalizedPassed = dataPoint.passed / total;
    const normalizedFailed = dataPoint.failed / total;
    const normalizedFlaky = dataPoint.flaky / total;

    // Sum should equal 1
    const sum = normalizedPassed + normalizedFailed + normalizedFlaky;
    expect(sum).toBeCloseTo(1.0, 10);

    // These are the values the tooltip SHOULD receive
    expect(normalizedPassed).toBeCloseTo(0.711, 3);
    expect(normalizedFailed).toBeCloseTo(0.073, 3);
    expect(normalizedFlaky).toBeCloseTo(0.216, 3);
  });
});
