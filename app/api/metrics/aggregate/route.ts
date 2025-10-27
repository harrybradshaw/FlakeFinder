/**
 * API endpoint to trigger metrics aggregation
 * This can be called manually or by a cron job
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  aggregateYesterdayMetrics,
  aggregateMetricsForDateRange,
} from "@/lib/metrics/flakiness-aggregation";

export async function POST(request: NextRequest) {
  try {
    // Check for authorization (you might want to add API key auth here)
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { startDate, endDate, mode = "yesterday" } = body;

    let result;

    if (mode === "range" && startDate && endDate) {
      // Aggregate for a specific date range
      console.log(
        `[Metrics] Aggregating for range: ${startDate} to ${endDate}`,
      );
      result = await aggregateMetricsForDateRange(startDate, endDate);
    } else {
      // Default: aggregate yesterday's metrics
      console.log("[Metrics] Aggregating yesterday's metrics");
      result = await aggregateYesterdayMetrics();
    }

    return NextResponse.json({
      success: true,
      flakinessMetrics: result.flakinessCount,
      performanceMetrics: result.performanceCount,
      message: `Aggregated ${result.flakinessCount} flakiness metrics and ${result.performanceCount} performance metrics`,
    });
  } catch (error) {
    console.error("[Metrics] Aggregation error:", error);
    return NextResponse.json(
      {
        error: "Failed to aggregate metrics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Allow GET for manual testing
export async function GET() {
  return NextResponse.json({
    message: "Metrics aggregation endpoint",
    usage: {
      method: "POST",
      body: {
        mode: "'yesterday' (default) or 'range'",
        startDate: "YYYY-MM-DD (required for range mode)",
        endDate: "YYYY-MM-DD (required for range mode)",
      },
      example: {
        yesterday: { mode: "yesterday" },
        range: {
          mode: "range",
          startDate: "2025-01-01",
          endDate: "2025-01-31",
        },
      },
    },
  });
}
