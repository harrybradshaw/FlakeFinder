/**
 * Slack message formatter for webhook notifications
 * Formats test failure and flakiness alerts into Slack Block Kit format
 */

export interface TestFailureEvent {
  testName: string;
  testFile: string;
  projectName: string;
  environment: string;
  branch: string;
  commit: string;
  error?: string;
  errorStack?: string;
  runUrl: string;
  testUrl: string;
  timestamp: string;
}

export interface FlakinessAlertEvent {
  testName: string;
  testFile: string;
  projectName: string;
  flakyRate: number;
  threshold: number;
  totalRuns: number;
  flakyRuns: number;
  trend: "increasing" | "decreasing" | "stable";
  testUrl: string;
  timestamp: string;
}

export interface PerformanceAlertEvent {
  testName: string;
  testFile: string;
  projectName: string;
  currentDuration: number;
  baselineDuration: number;
  deviationPercent: number;
  runUrl: string;
  testUrl: string;
  timestamp: string;
}

export interface RunFailureEvent {
  projectName: string;
  environment: string;
  branch: string;
  commit: string;
  totalTests: number;
  failedTests: number;
  flakyTests: number;
  passRate: number;
  runUrl: string;
  timestamp: string;
}

/**
 * Format test failure for Slack
 */
export function formatTestFailure(event: TestFailureEvent): object {
  const emoji = "🔴";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Test Failed`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Test:*\n\`${safeText(event.testName)}\``,
        },
        {
          type: "mrkdwn",
          text: `*Project:*\n${safeText(event.projectName)}`,
        },
        {
          type: "mrkdwn",
          text: `*Environment:*\n${safeText(event.environment)}`,
        },
        {
          type: "mrkdwn",
          text: `*Branch:*\n\`${safeText(event.branch)}\``,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*File:*\n\`${safeText(event.testFile)}\``,
        },
        {
          type: "mrkdwn",
          text: `*Commit:*\n\`${safeText(event.commit?.substring(0, 7))}\``,
        },
      ],
    },
    ...(event.error
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Error:*\n\`\`\`${truncateText(event.error, 500)}\`\`\``,
            },
          },
        ]
      : []),
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Test Details",
            emoji: true,
          },
          url: toAbsoluteUrl(event.testUrl),
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Run",
            emoji: true,
          },
          url: toAbsoluteUrl(event.runUrl),
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Failed at <!date^${Math.floor(new Date(event.timestamp).getTime() / 1000)}^{date_short_pretty} at {time}|${event.timestamp}>`,
        },
      ],
    },
  ];

  return {
    text: `${emoji} Test Failed: ${safeText(event.testName)}`,
    blocks: validateSlackBlocks(blocks),
  };
}

/**
 * Format flakiness alert for Slack
 */
export function formatFlakinessAlert(event: FlakinessAlertEvent): object {
  const emoji = event.flakyRate > 50 ? "🚨" : "⚠️";
  const trendEmoji =
    event.trend === "increasing"
      ? "📈"
      : event.trend === "decreasing"
        ? "📉"
        : "➡️";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Flaky Test Detected`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Test:*\n\`${safeText(event.testName)}\``,
        },
        {
          type: "mrkdwn",
          text: `*Project:*\n${safeText(event.projectName)}`,
        },
        {
          type: "mrkdwn",
          text: `*Flake Rate:*\n${(event.flakyRate ?? 0).toFixed(1)}% (${event.flakyRuns ?? 0}/${event.totalRuns ?? 0} runs)`,
        },
        {
          type: "mrkdwn",
          text: `*Threshold:*\n${event.threshold ?? 0}%`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*File:*\n\`${safeText(event.testFile)}\``,
        },
        {
          type: "mrkdwn",
          text: `*Trend:*\n${trendEmoji} ${event.trend ? event.trend.charAt(0).toUpperCase() + event.trend.slice(1) : "Unknown"}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `This test has exceeded the flakiness threshold of ${event.threshold ?? 0}%. Consider investigating and fixing the flakiness or quarantining the test.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Test History",
            emoji: true,
          },
          url: toAbsoluteUrl(event.testUrl),
          style: "primary",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Alert triggered at <!date^${Math.floor(new Date(event.timestamp).getTime() / 1000)}^{date_short_pretty} at {time}|${event.timestamp}>`,
        },
      ],
    },
  ];

  return {
    text: `${emoji} Flaky Test Alert: ${safeText(event.testName)}`,
    blocks: validateSlackBlocks(blocks),
  };
}

/**
 * Format performance alert for Slack
 */
export function formatPerformanceAlert(event: PerformanceAlertEvent): object {
  const emoji = event.deviationPercent > 100 ? "🚨" : "⚡";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Performance Regression Detected`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Test:*\n\`${safeText(event.testName)}\``,
        },
        {
          type: "mrkdwn",
          text: `*Project:*\n${safeText(event.projectName)}`,
        },
        {
          type: "mrkdwn",
          text: `*Current Duration:*\n${formatDuration(event.currentDuration ?? 0)}`,
        },
        {
          type: "mrkdwn",
          text: `*Baseline:*\n${formatDuration(event.baselineDuration ?? 0)}`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*File:*\n\`${safeText(event.testFile)}\``,
        },
        {
          type: "mrkdwn",
          text: `*Slowdown:*\n+${(event.deviationPercent ?? 0).toFixed(1)}%`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `This test is running ${(event.deviationPercent ?? 0).toFixed(0)}% slower than the baseline. This may indicate a performance regression.`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Test Details",
            emoji: true,
          },
          url: toAbsoluteUrl(event.testUrl),
          style: "primary",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Run",
            emoji: true,
          },
          url: toAbsoluteUrl(event.runUrl),
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Detected at <!date^${Math.floor(new Date(event.timestamp).getTime() / 1000)}^{date_short_pretty} at {time}|${event.timestamp}>`,
        },
      ],
    },
  ];

  return {
    text: `${emoji} Performance Regression: ${safeText(event.testName)}`,
    blocks: validateSlackBlocks(blocks),
  };
}

/**
 * Format run failure for Slack
 */
export function formatRunFailure(event: RunFailureEvent): object {
  const emoji = event.passRate < 50 ? "🚨" : event.passRate < 80 ? "⚠️" : "🔴";

  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Test Run Failed`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${safeText(event.projectName)}* • ${safeText(event.environment)} • \`${safeText(event.branch)}\` @ \`${safeText(event.commit?.substring(0, 7))}\``,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${event.failedTests ?? 0}/${event.totalTests ?? 0} failed${(event.flakyTests ?? 0) > 0 ? ` • ${event.flakyTests} flaky` : ""} • *${(event.passRate ?? 0).toFixed(1)}% pass rate*`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Test Run",
            emoji: true,
          },
          url: toAbsoluteUrl(event.runUrl),
          style: "danger",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Run completed at <!date^${Math.floor(new Date(event.timestamp).getTime() / 1000)}^{date_short_pretty} at {time}|${event.timestamp}>`,
        },
      ],
    },
  ];

  return {
    text: `${emoji} Test Run Failed: ${safeText(event.projectName)}`,
    blocks: validateSlackBlocks(blocks),
  };
}

/**
 * Helper: Convert relative URL to absolute URL
 */
function toAbsoluteUrl(url: string): string {
  // If already absolute, return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Get base URL from environment variable
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Remove trailing slash from base URL and ensure path starts with slash
  const cleanBase = baseUrl.replace(/\/$/, "");
  const cleanPath = url.startsWith("/") ? url : `/${url}`;

  return `${cleanBase}${cleanPath}`;
}

/**
 * Helper: Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Helper: Truncate text to max length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Helper: Ensure a string is never empty/undefined (Slack rejects empty text fields)
 */
function safeText(value: string | null | undefined, fallback = "(unknown)"): string {
  if (!value || value.trim().length === 0) return fallback;
  return value;
}

/**
 * Helper: Validate and sanitize Slack blocks before sending.
 * Logs warnings for common issues that cause Slack's invalid_blocks error.
 */
function validateSlackBlocks(blocks: any[]): any[] {
  return blocks
    .filter((block) => {
      if (!block || !block.type) {
        console.warn("[SlackFormatter] Dropping block with missing type:", JSON.stringify(block));
        return false;
      }
      return true;
    })
    .map((block) => {
      // Slack limits section fields to 10
      if (block.type === "section" && block.fields && block.fields.length > 10) {
        console.warn(`[SlackFormatter] Section has ${block.fields.length} fields (max 10), truncating`);
        block = { ...block, fields: block.fields.slice(0, 10) };
      }

      // Slack limits text to 3000 chars
      if (block.type === "section" && block.text?.text && block.text.text.length > 3000) {
        console.warn(`[SlackFormatter] Section text is ${block.text.text.length} chars (max 3000), truncating`);
        block = {
          ...block,
          text: { ...block.text, text: block.text.text.substring(0, 2997) + "..." },
        };
      }

      // Validate action button URLs — Slack requires valid absolute URLs
      if (block.type === "actions" && block.elements) {
        block = {
          ...block,
          elements: block.elements.filter((el: any) => {
            if (el.type === "button" && el.url) {
              if (!el.url.startsWith("http://") && !el.url.startsWith("https://")) {
                console.warn(`[SlackFormatter] Dropping button with invalid URL: ${el.url}`);
                return false;
              }
            }
            return true;
          }),
        };
        // Drop empty actions blocks (Slack rejects them)
        if (block.elements.length === 0) {
          console.warn("[SlackFormatter] Dropping empty actions block (all buttons had invalid URLs)");
          return null;
        }
      }

      return block;
    })
    .filter(Boolean);
}
