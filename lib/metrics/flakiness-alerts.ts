/**
 * Flakiness Alert Detection Service
 *
 * Evaluates test metrics and triggers alerts when thresholds are exceeded.
 * Integrates with webhook system to notify external services.
 */

import {
  triggerFlakinessWebhooks,
  triggerPerformanceWebhooks,
} from "@/lib/webhooks/webhook-service";
import type { MetricsRepository } from "@/lib/repositories";

export interface AlertThresholds {
  flakinessRate?: number; // Percentage (0-100)
  consecutiveFlaky?: number; // Number of consecutive flaky runs
  performanceDeviation?: number; // Percentage deviation from baseline
}

export interface AlertResult {
  alertsTriggered: number;
  webhooksTriggered: number;
  errors: string[];
}

const DEFAULT_THRESHOLDS: Required<AlertThresholds> = {
  flakinessRate: 20,
  consecutiveFlaky: 3,
  performanceDeviation: 50,
};

/**
 * Check flakiness metrics and create alerts
 */
export async function detectFlakinessAlerts(
  metricsRepo: MetricsRepository,
  date: string,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
): Promise<number> {
  const threshold =
    thresholds.flakinessRate ?? DEFAULT_THRESHOLDS.flakinessRate;

  // Find tests that exceeded the flakiness threshold today
  const allMetrics = await metricsRepo.getFlakinessMetricsForDate(date);
  const metrics = allMetrics.filter(
    (m) => m.flake_rate && m.flake_rate > threshold,
  );

  if (!metrics || metrics.length === 0) {
    console.log(`[Alerts] No flakiness alerts for ${date}`);
    return 0;
  }

  // Check if these tests already have recent alerts (avoid duplicate alerts)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existingAlerts = await metricsRepo.getRecentFlakinessAlerts(
    metrics.map((m) => m.suite_test_id),
    yesterday,
  );

  const existingAlertIds = new Set(existingAlerts.map((a) => a.suite_test_id));

  // Create alerts for tests that don't have recent alerts
  const newAlerts = metrics
    .filter((m) => !existingAlertIds.has(m.suite_test_id))
    .map((m) => ({
      suite_test_id: m.suite_test_id,
      alert_type: "threshold_exceeded" as const,
      flake_rate: m.flake_rate,
      threshold,
      metadata: {
        date,
        total_runs: m.total_runs,
        flaky_runs: m.flaky_runs,
      },
    }));

  if (newAlerts.length === 0) {
    console.log(`[Alerts] All flaky tests already have recent alerts`);
    return 0;
  }

  // Insert alerts
  await metricsRepo.saveFlakinessAlerts(newAlerts);

  console.log(`[Alerts] Created ${newAlerts.length} flakiness alerts`);
  return newAlerts.length;
}

/**
 * Check performance metrics and create alerts
 */
export async function detectPerformanceAlerts(
  metricsRepo: MetricsRepository,
  date: string,
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
): Promise<number> {
  console.log(`[Alerts] Detecting performance alerts for ${date}`);

  const threshold =
    thresholds.performanceDeviation ?? DEFAULT_THRESHOLDS.performanceDeviation;

  // Get today's performance metrics
  const todayMetrics = await metricsRepo.getPerformanceMetricsForDate(date);

  if (!todayMetrics || todayMetrics.length === 0) {
    console.log(`[Alerts] No performance data for ${date}`);
    return 0;
  }

  // Get baseline (7-day average before today)
  const sevenDaysAgo = new Date(date);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const baselineMetrics = await metricsRepo.getPerformanceBaseline(
    todayMetrics.map((m) => m.suite_test_id),
    sevenDaysAgo.toISOString().split("T")[0],
    date,
  );

  // Calculate baseline averages
  const baselineMap = new Map<string, number[]>();
  baselineMetrics?.forEach((m) => {
    if (!baselineMap.has(m.suite_test_id)) {
      baselineMap.set(m.suite_test_id, []);
    }
    if (m.avg_duration) {
      baselineMap.get(m.suite_test_id)!.push(m.avg_duration);
    }
  });

  // Find tests with significant performance degradation
  const alerts: Array<{
    suite_test_id: string;
    alert_type: "duration_spike" | "duration_regression";
    current_duration: number;
    baseline_duration: number;
    deviation_percent: number;
    metadata: any;
  }> = [];

  for (const metric of todayMetrics) {
    const baselineDurations = baselineMap.get(metric.suite_test_id);

    if (!baselineDurations || baselineDurations.length < 3) {
      // Need at least 3 days of baseline data
      continue;
    }

    const baselineAvg =
      baselineDurations.reduce((a, b) => a + b, 0) / baselineDurations.length;
    const currentDuration = metric.avg_duration || 0;

    if (currentDuration === 0 || baselineAvg === 0) continue;

    const deviationPercent =
      ((currentDuration - baselineAvg) / baselineAvg) * 100;

    if (deviationPercent > threshold) {
      alerts.push({
        suite_test_id: metric.suite_test_id,
        alert_type: "duration_regression",
        current_duration: currentDuration,
        baseline_duration: Math.round(baselineAvg),
        deviation_percent: Math.round(deviationPercent * 100) / 100,
        metadata: {
          date,
          baseline_days: baselineDurations.length,
          p95_duration: metric.p95_duration,
        },
      });
    }
  }

  if (alerts.length === 0) {
    console.log(`[Alerts] No performance alerts for ${date}`);
    return 0;
  }

  // Insert alerts
  await metricsRepo.savePerformanceAlerts(alerts);

  console.log(`[Alerts] Created ${alerts.length} performance alerts`);
  return alerts.length;
}

/**
 * Detect all alerts for a date and trigger webhooks
 */
export async function detectAndNotifyAlerts(
  metricsRepo: MetricsRepository,
  date: string,
  thresholds?: AlertThresholds,
): Promise<AlertResult> {
  const result: AlertResult = {
    alertsTriggered: 0,
    webhooksTriggered: 0,
    errors: [],
  };

  try {
    // Detect flakiness alerts
    const flakinessAlerts = await detectFlakinessAlerts(
      metricsRepo,
      date,
      thresholds,
    );
    result.alertsTriggered += flakinessAlerts;

    // Detect performance alerts
    const performanceAlerts = await detectPerformanceAlerts(
      metricsRepo,
      date,
      thresholds,
    );
    result.alertsTriggered += performanceAlerts;

    // Trigger webhooks if any alerts were created
    if (result.alertsTriggered > 0) {
      console.log(
        `[Alerts] ${result.alertsTriggered} alerts triggered for ${date}`,
      );

      // Fetch flakiness alert details with test information for webhooks
      const flakinessAlertsWithTests =
        await metricsRepo.getFlakinessAlertsWithDetails(date);

      if (flakinessAlertsWithTests && flakinessAlertsWithTests.length > 0) {
        // Group alerts by project to trigger webhooks efficiently
        const alertsByProject = new Map<string, any[]>();

        for (const alert of flakinessAlertsWithTests) {
          const test = (alert as any).suite_tests;
          const project = test?.projects;
          if (project) {
            if (!alertsByProject.has(project.id)) {
              alertsByProject.set(project.id, []);
            }
            alertsByProject.get(project.id)!.push({ alert, test, project });
          }
        }

        // Trigger webhooks for each project
        for (const [projectId, alerts] of alertsByProject) {
          const project = alerts[0].project;

          for (const { alert, test } of alerts) {
            try {
              await triggerFlakinessWebhooks(
                {
                  testName: test.test_name,
                  testFile: test.file_path || "unknown",
                  projectName: project.name,
                  flakyRate: alert.flake_rate || 0,
                  threshold: alert.threshold || 20,
                  totalRuns: (alert.metadata as any)?.total_runs || 0,
                  flakyRuns: (alert.metadata as any)?.flaky_runs || 0,
                  trend: "stable" as const,
                  testUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/tests/${test.id}`,
                  timestamp: alert.triggered_at,
                },
                projectId,
                project.organization_id,
              );
              result.webhooksTriggered++;
            } catch (webhookError) {
              const errorMsg =
                webhookError instanceof Error
                  ? webhookError.message
                  : "Unknown error";
              result.errors.push(
                `Webhook failed for test ${test.test_name}: ${errorMsg}`,
              );
            }
          }
        }
      }

      // Fetch performance alert details and trigger performance webhooks
      const performanceAlertsWithTests =
        await metricsRepo.getPerformanceAlertsWithDetails(date);

      if (performanceAlertsWithTests && performanceAlertsWithTests.length > 0) {
        const perfAlertsByProject = new Map<string, any[]>();

        for (const alert of performanceAlertsWithTests) {
          const test = (alert as any).suite_tests;
          const project = test?.projects;
          if (project) {
            if (!perfAlertsByProject.has(project.id)) {
              perfAlertsByProject.set(project.id, []);
            }
            perfAlertsByProject.get(project.id)!.push({ alert, test, project });
          }
        }

        // Trigger performance webhooks for each project
        for (const [projectId, alerts] of perfAlertsByProject) {
          const project = alerts[0].project;

          for (const { alert, test } of alerts) {
            try {
              await triggerPerformanceWebhooks(
                {
                  testName: test.test_name,
                  testFile: test.file_path || "unknown",
                  projectName: project.name,
                  currentDuration: alert.current_duration || 0,
                  baselineDuration: alert.baseline_duration || 0,
                  deviationPercent: alert.deviation_percent || 0,
                  testUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/tests/${test.id}`,
                  runUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/runs`,
                  timestamp: alert.triggered_at,
                },
                projectId,
                project.organization_id,
              );
              result.webhooksTriggered++;
            } catch (webhookError) {
              const errorMsg =
                webhookError instanceof Error
                  ? webhookError.message
                  : "Unknown error";
              result.errors.push(
                `Performance webhook failed for test ${test.test_name}: ${errorMsg}`,
              );
            }
          }
        }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Alert detection failed: ${errorMsg}`);
  }

  return result;
}
