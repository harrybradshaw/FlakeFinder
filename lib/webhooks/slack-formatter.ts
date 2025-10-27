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

  return {
    text: `${emoji} Test Failed: ${event.testName}`,
    blocks: [
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
            text: `*Test:*\n\`${event.testName}\``,
          },
          {
            type: "mrkdwn",
            text: `*Project:*\n${event.projectName}`,
          },
          {
            type: "mrkdwn",
            text: `*Environment:*\n${event.environment}`,
          },
          {
            type: "mrkdwn",
            text: `*Branch:*\n\`${event.branch}\``,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*File:*\n\`${event.testFile}\``,
          },
          {
            type: "mrkdwn",
            text: `*Commit:*\n\`${event.commit.substring(0, 7)}\``,
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
    ],
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

  return {
    text: `${emoji} Flaky Test Alert: ${event.testName}`,
    blocks: [
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
            text: `*Test:*\n\`${event.testName}\``,
          },
          {
            type: "mrkdwn",
            text: `*Project:*\n${event.projectName}`,
          },
          {
            type: "mrkdwn",
            text: `*Flake Rate:*\n${event.flakyRate.toFixed(1)}% (${event.flakyRuns}/${event.totalRuns} runs)`,
          },
          {
            type: "mrkdwn",
            text: `*Threshold:*\n${event.threshold}%`,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*File:*\n\`${event.testFile}\``,
          },
          {
            type: "mrkdwn",
            text: `*Trend:*\n${trendEmoji} ${event.trend.charAt(0).toUpperCase() + event.trend.slice(1)}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `This test has exceeded the flakiness threshold of ${event.threshold}%. Consider investigating and fixing the flakiness or quarantining the test.`,
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
    ],
  };
}

/**
 * Format performance alert for Slack
 */
export function formatPerformanceAlert(event: PerformanceAlertEvent): object {
  const emoji = event.deviationPercent > 100 ? "🚨" : "⚡";

  return {
    text: `${emoji} Performance Regression: ${event.testName}`,
    blocks: [
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
            text: `*Test:*\n\`${event.testName}\``,
          },
          {
            type: "mrkdwn",
            text: `*Project:*\n${event.projectName}`,
          },
          {
            type: "mrkdwn",
            text: `*Current Duration:*\n${formatDuration(event.currentDuration)}`,
          },
          {
            type: "mrkdwn",
            text: `*Baseline:*\n${formatDuration(event.baselineDuration)}`,
          },
        ],
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*File:*\n\`${event.testFile}\``,
          },
          {
            type: "mrkdwn",
            text: `*Slowdown:*\n+${event.deviationPercent.toFixed(1)}%`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `This test is running ${event.deviationPercent.toFixed(0)}% slower than the baseline. This may indicate a performance regression.`,
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
    ],
  };
}

/**
 * Format run failure for Slack
 */
export function formatRunFailure(event: RunFailureEvent): object {
  const emoji = event.passRate < 50 ? "🚨" : event.passRate < 80 ? "⚠️" : "🔴";

  return {
    text: `${emoji} Test Run Failed: ${event.projectName}`,
    blocks: [
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
          text: `*${event.projectName}* • ${event.environment} • \`${event.branch}\` @ \`${event.commit.substring(0, 7)}\``,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${event.failedTests}/${event.totalTests} failed${event.flakyTests > 0 ? ` • ${event.flakyTests} flaky` : ""} • *${event.passRate.toFixed(1)}% pass rate*`,
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
    ],
  };
}

/**
 * Helper: Convert relative URL to absolute URL
 */
function toAbsoluteUrl(url: string): string {
  // If already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Get base URL from environment variable
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  // Remove trailing slash from base URL and ensure path starts with slash
  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  
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
