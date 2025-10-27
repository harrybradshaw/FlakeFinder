/**
 * Webhook delivery service
 * Handles sending webhooks with retry logic and exponential backoff
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";
import {
  formatTestFailure,
  formatFlakinessAlert,
  formatPerformanceAlert,
  formatRunFailure,
  type TestFailureEvent,
  type FlakinessAlertEvent,
  type PerformanceAlertEvent,
  type RunFailureEvent,
} from "./slack-formatter";

export type WebhookType = "slack" | "teams" | "discord" | "generic";
export type TriggerType =
  | "test_failed"
  | "test_flaky"
  | "performance_regression"
  | "flakiness_threshold"
  | "run_failed";

export interface WebhookConfig {
  id: string;
  webhook_type: WebhookType | string; // Can be string from database
  webhook_url: string;
  secret_key?: string | null;
  webhook_triggers?: Array<{
    id: string;
    trigger_type: string;
    conditions?: any;
  }>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  deliveryId: string;
  statusCode?: number;
  error?: string;
}

/**
 * Send a webhook notification
 */
export async function sendWebhook(
  config: WebhookConfig,
  triggerType: TriggerType,
  payload: object,
): Promise<WebhookDeliveryResult> {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
  const repos = createRepositories(supabase);

  // Create delivery record
  const delivery = await repos.webhooks.createWebhookDelivery({
    webhook_configuration_id: config.id,
    webhook_trigger_id: config.webhook_triggers?.[0]?.id ?? null,
    payload: payload as any,
    status: "pending",
    attempt_count: 0,
  });

  // Attempt delivery
  const result = await attemptDelivery(config, payload, delivery.id);

  // Update delivery record
  await repos.webhooks.updateWebhookDelivery(delivery.id, {
    status: result.success ? "delivered" : "failed",
    response_code: result.statusCode,
    response_body: result.responseBody?.substring(0, 1000), // Limit size
    error_message: result.error,
    attempt_count: 1,
    delivered_at: result.success ? new Date().toISOString() : null,
    next_retry_at: result.success ? null : calculateNextRetry(1),
  });

  return {
    success: result.success,
    deliveryId: delivery.id,
    statusCode: result.statusCode,
    error: result.error,
  };
}

/**
 * Attempt to deliver a webhook
 */
async function attemptDelivery(
  config: WebhookConfig,
  payload: object,
  deliveryId: string,
): Promise<{
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
}> {
  try {
    console.log(`[Webhook] Delivering to ${config.webhook_url}`);

    const response = await fetch(config.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TestViewer-Webhook/1.0",
        ...(config.secret_key && {
          "X-Webhook-Signature": await generateSignature(
            payload,
            config.secret_key,
          ),
        }),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseBody = await response.text().catch(() => "");

    if (response.ok) {
      console.log(`[Webhook] Delivery ${deliveryId} successful`);
      return {
        success: true,
        statusCode: response.status,
        responseBody,
      };
    } else {
      console.error(
        `[Webhook] Delivery ${deliveryId} failed: ${response.status}`,
      );
      return {
        success: false,
        statusCode: response.status,
        responseBody,
        error: `HTTP ${response.status}: ${responseBody}`,
      };
    }
  } catch (error) {
    console.error(`[Webhook] Delivery ${deliveryId} error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate HMAC signature for webhook payload
 */
async function generateSignature(
  payload: object,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Calculate next retry time with exponential backoff
 */
function calculateNextRetry(attemptCount: number): string {
  // Exponential backoff: 1min, 5min, 15min
  const delays = [60, 300, 900]; // seconds
  const delay = delays[Math.min(attemptCount - 1, delays.length - 1)];
  const nextRetry = new Date(Date.now() + delay * 1000);
  return nextRetry.toISOString();
}

/**
 * Retry failed webhook deliveries
 */
export async function retryFailedDeliveries(): Promise<number> {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
  const repos = createRepositories(supabase);

  // Get deliveries ready for retry
  const deliveries = await repos.webhooks.getDeliveriesForRetry(3);

  console.log(`[Webhook] Retrying ${deliveries.length} failed deliveries`);

  let successCount = 0;

  for (const delivery of deliveries) {
    const config = (delivery as any).webhook_configurations;
    const result = await attemptDelivery(
      config,
      delivery.payload as object,
      delivery.id,
    );

    const newAttemptCount = (delivery.attempt_count ?? 0) + 1;

    await repos.webhooks.updateWebhookDelivery(delivery.id, {
      status: result.success
        ? "delivered"
        : newAttemptCount >= 3
          ? "failed"
          : "retrying",
      response_code: result.statusCode,
      response_body: result.responseBody?.substring(0, 1000),
      error_message: result.error,
      attempt_count: newAttemptCount,
      delivered_at: result.success ? new Date().toISOString() : null,
      next_retry_at:
        result.success || newAttemptCount >= 3
          ? null
          : calculateNextRetry(newAttemptCount),
    });

    if (result.success) {
      successCount++;
    }
  }

  console.log(
    `[Webhook] Retry complete: ${successCount}/${deliveries.length} succeeded`,
  );
  return successCount;
}

/**
 * Trigger webhooks for test failure
 */
export async function triggerTestFailureWebhooks(
  event: TestFailureEvent,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const webhooks = await getMatchingWebhooks(
    "test_failed",
    projectId,
    organizationId,
    { branch: event.branch },
  );

  for (const webhook of webhooks) {
    const payload = formatWebhookPayload(
      webhook.webhook_type as WebhookType,
      "test_failed",
      event,
    );
    await sendWebhook(webhook, "test_failed", payload);
  }
}

/**
 * Trigger webhooks for flakiness alert
 */
export async function triggerFlakinessWebhooks(
  event: FlakinessAlertEvent,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const webhooks = await getMatchingWebhooks(
    "flakiness_threshold",
    projectId,
    organizationId,
  );

  for (const webhook of webhooks) {
    const payload = formatWebhookPayload(
      webhook.webhook_type as WebhookType,
      "flakiness_threshold",
      event,
    );
    await sendWebhook(webhook, "flakiness_threshold", payload);
  }
}

/**
 * Trigger webhooks for performance alert
 */
export async function triggerPerformanceWebhooks(
  event: PerformanceAlertEvent,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const webhooks = await getMatchingWebhooks(
    "performance_regression",
    projectId,
    organizationId,
  );

  for (const webhook of webhooks) {
    const payload = formatWebhookPayload(
      webhook.webhook_type as WebhookType,
      "performance_regression",
      event,
    );
    await sendWebhook(webhook, "performance_regression", payload);
  }
}

/**
 * Trigger webhooks for run failure
 */
export async function triggerRunFailureWebhooks(
  event: RunFailureEvent,
  projectId: string,
  organizationId: string,
): Promise<void> {
  const webhooks = await getMatchingWebhooks(
    "run_failed",
    projectId,
    organizationId,
    { branch: event.branch },
  );

  for (const webhook of webhooks) {
    const payload = formatWebhookPayload(
      webhook.webhook_type as WebhookType,
      "run_failed",
      event,
    );
    await sendWebhook(webhook, "run_failed", payload);
  }
}

/**
 * Get webhooks matching trigger type and conditions
 */
async function getMatchingWebhooks(
  triggerType: TriggerType,
  projectId: string,
  organizationId: string,
  context?: { branch?: string },
): Promise<WebhookConfig[]> {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
  const repos = createRepositories(supabase);

  // Get enabled webhooks for this org/project
  const webhooks = await repos.webhooks.getWebhooksForTrigger(
    triggerType,
    organizationId,
    projectId,
  );

  // Filter by conditions and cast to WebhookConfig
  return webhooks.filter((webhook: any) => {
    const trigger = webhook.webhook_triggers;
    if (!trigger.conditions) return true;

    const conditions = trigger.conditions;

    // Check branch filter
    if (conditions.branches && context?.branch) {
      if (!conditions.branches.includes(context.branch)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Format payload based on webhook type
 */
function formatWebhookPayload(
  webhookType: WebhookType,
  triggerType: TriggerType,
  event:
    | TestFailureEvent
    | FlakinessAlertEvent
    | PerformanceAlertEvent
    | RunFailureEvent,
): object {
  // For Slack, use Block Kit format
  if (webhookType === "slack") {
    switch (triggerType) {
      case "test_failed":
        return formatTestFailure(event as TestFailureEvent);
      case "flakiness_threshold":
        return formatFlakinessAlert(event as FlakinessAlertEvent);
      case "performance_regression":
        return formatPerformanceAlert(event as PerformanceAlertEvent);
      case "run_failed":
        return formatRunFailure(event as RunFailureEvent);
      default:
        return { text: "Unknown event type", event };
    }
  }

  // For Teams/Discord/Generic, use simple format
  return {
    type: triggerType,
    event,
    timestamp: new Date().toISOString(),
  };
}
