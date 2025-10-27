/**
 * API endpoint to retry failed webhook deliveries
 * Should be called by a cron job periodically
 */

import { type NextRequest, NextResponse } from "next/server";
import { retryFailedDeliveries } from "@/lib/webhooks/webhook-service";

export async function POST(request: NextRequest) {
  try {
    // Check for authorization
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET || process.env.API_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Webhook Retry] Starting retry process");

    const successCount = await retryFailedDeliveries();

    return NextResponse.json({
      success: true,
      retriedCount: successCount,
      message: `Retried failed webhooks, ${successCount} succeeded`,
    });
  } catch (error) {
    console.error("[Webhook Retry] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to retry webhooks",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Allow GET for manual testing
export async function GET() {
  return NextResponse.json({
    message: "Webhook retry endpoint",
    usage: {
      method: "POST",
      headers: {
        Authorization: "Bearer YOUR_CRON_SECRET",
      },
    },
  });
}
