/**
 * Test Webhook API
 * Sends a test payload to a webhook endpoint
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

export async function POST(request: NextRequest) {
  try {
    // Get user authentication
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    const body = await request.json();
    const { webhookId } = body;

    if (!webhookId) {
      return NextResponse.json(
        { error: "Webhook ID is required" },
        { status: 400 },
      );
    }

    // Fetch webhook configuration
    const webhook = await repos.webhooks.getWebhookById(webhookId);

    if (!webhook) {
      return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
    }

    // Create test payload based on webhook type
    let testPayload: any;

    if (webhook.webhook_type === "slack") {
      // Slack-compatible format
      testPayload = {
        text: `🔍 FlakeFinder Test Notification`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🔍 FlakeFinder Test Notification",
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "✅ *Webhook connection successful!*\n\nYour webhook is configured correctly and ready to receive notifications about test failures, flakiness alerts, and performance regressions.",
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Webhook Name:*\n${webhook.name}`,
              },
              {
                type: "mrkdwn",
                text: `*Type:*\n${webhook.webhook_type}`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `🕐 ${new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} | Powered by FlakeFinder`,
              },
            ],
          },
        ],
      };
    } else if (webhook.webhook_type === "discord") {
      // Discord-compatible format
      testPayload = {
        content: `🧪 Test notification from ${webhook.name}`,
        embeds: [
          {
            title: "Test Webhook Notification",
            description:
              "This is a test message to verify your webhook is working correctly.",
            color: 5814783,
            timestamp: new Date().toISOString(),
            footer: {
              text: `${webhook.name} | ${webhook.webhook_type}`,
            },
          },
        ],
      };
    } else {
      // Generic format
      testPayload = {
        event: "webhook.test",
        timestamp: new Date().toISOString(),
        data: {
          message: "This is a test webhook notification",
          test: true,
          webhook_name: webhook.name,
          webhook_type: webhook.webhook_type,
        },
      };
    }

    // Send test webhook
    const response = await fetch(webhook.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Test-Viewer-Webhook/1.0",
      },
      body: JSON.stringify(testPayload),
    });

    const responseText = await response.text();

    // Log the test delivery
    await repos.webhooks.logWebhookDelivery({
      webhook_configuration_id: webhook.id,
      webhook_trigger_id: null,
      payload: testPayload,
      status: response.ok ? "delivered" : "failed",
      response_code: response.status,
      response_body: responseText.substring(0, 1000), // Limit response body size
      error_message: response.ok
        ? null
        : `HTTP ${response.status}: ${response.statusText}`,
      attempt_count: 1,
      max_attempts: 1,
      delivered_at: response.ok ? new Date().toISOString() : null,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Webhook returned ${response.status}: ${response.statusText}`,
          statusCode: response.status,
          response: responseText.substring(0, 500),
        },
        { status: 200 }, // Return 200 so client can handle the webhook failure
      );
    }

    return NextResponse.json({
      success: true,
      message: "Test webhook sent successfully",
      statusCode: response.status,
      response: responseText.substring(0, 500),
    });
  } catch (error) {
    console.error("Error testing webhook:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send test webhook",
      },
      { status: 500 },
    );
  }
}
