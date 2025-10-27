/**
 * Test webhook delivery
 * Usage: npx tsx scripts/test-webhook.ts <webhook-url>
 */

import { formatRunFailure } from "../lib/webhooks/slack-formatter";

async function testWebhook(webhookUrl: string) {
  console.log("Testing webhook delivery...");
  console.log("URL:", webhookUrl);

  // Create a test payload
  const testEvent = {
    projectName: "Test Project",
    environment: "production",
    branch: "main",
    commit: "abc123def456",
    totalTests: 100,
    failedTests: 25,
    flakyTests: 5,
    passRate: 75.0,
    runUrl: "https://example.com/runs/123",
    timestamp: new Date().toISOString(),
  };

  const payload = formatRunFailure(testEvent);

  console.log("\nPayload:");
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TestViewer-Webhook/1.0",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    console.log("\nResponse:");
    console.log("Status:", response.status, response.statusText);
    console.log("Body:", responseText);

    if (response.ok) {
      console.log("\n✅ Webhook delivery successful!");
    } else {
      console.log("\n❌ Webhook delivery failed!");

      // Common Slack errors
      if (response.status === 400) {
        console.log("\nPossible causes for 400 error:");
        console.log("- Invalid webhook URL");
        console.log("- Webhook has been deleted or revoked in Slack");
        console.log(
          "- Invalid payload format (though Block Kit looks correct)",
        );
      } else if (response.status === 404) {
        console.log(
          "\nThe webhook URL was not found. It may have been deleted.",
        );
      }
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

// Get webhook URL from command line
const webhookUrl = process.argv[2];

if (!webhookUrl) {
  console.error("Usage: npx tsx scripts/test-webhook.ts <webhook-url>");
  process.exit(1);
}

testWebhook(webhookUrl);
