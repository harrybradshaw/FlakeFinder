import type JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  processScreenshots,
  processTestsFromZip,
  lookupDatabaseIds,
  checkDuplicate,
} from "@/lib/upload/upload-processing";
import { mapScreenshotPaths } from "@/lib/upload/zip-extraction-utils";
import {
  aggregateFlakinessMetrics,
  aggregatePerformanceMetrics,
} from "@/lib/metrics/flakiness-aggregation";
import { detectAndNotifyAlerts } from "@/lib/metrics/flakiness-alerts";
import { triggerRunFailureWebhooks } from "@/lib/webhooks/webhook-service";
import { insertTestRun } from "@/lib/insert-test-run";
import { createRepositories } from "@/lib/repositories";

export interface UploadParams {
  environment: string;
  trigger: string;
  suite: string;
  branch: string;
  commit: string;
  preCalculatedHash?: string;
}

export interface UploadResult {
  success: boolean;
  testRunId?: string;
  testRun?: {
    id: string;
    timestamp: string;
    environment: string;
    trigger: string;
    suite?: string;
    branch: string;
    commit: string;
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped?: number;
    duration: string;
    contentHash?: string;
    tests?: unknown[];
  };
  message?: string;
  error?: string;
  details?: string;
  isDuplicate?: boolean;
  existingRunId?: string;
}

/**
 * Shared upload processing logic for both CI and user uploads
 */
export async function processUpload(
  zip: JSZip,
  params: UploadParams,
  projectId: string,
  filename: string,
  logPrefix: string,
): Promise<UploadResult> {
  try {
    // 1. Check Supabase configuration
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log(`${logPrefix} Supabase not configured`);
      return {
        success: false,
        error: "Database not configured",
      };
    }

    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );

    const repos = createRepositories(supabase);

    // 2. Look up database IDs
    const idsResult = await lookupDatabaseIds({
      lookupRepo: repos.lookups,
      environmentName: params.environment,
      triggerName: params.trigger,
      suiteId: params.suite,
      logPrefix,
    });

    if (!idsResult.success || !idsResult.data) {
      return {
        success: false,
        error: idsResult.error!.message,
      };
    }

    const databaseIds = idsResult.data;

    // 3. Process tests from ZIP
    const processedData = await processTestsFromZip(
      zip,
      params.branch,
      params.environment,
      params.preCalculatedHash,
      logPrefix,
    );

    // 4. Process screenshots
    const { screenshotUrls } = await processScreenshots(zip, logPrefix);
    mapScreenshotPaths(processedData.tests, screenshotUrls);

    console.log(`${logPrefix} Final upload parameters:`, {
      environment: processedData.environment,
      trigger: params.trigger,
      suite: params.suite,
      branch: processedData.branch,
      commit: params.commit,
    });

    // 5. Check for duplicate
    const duplicateResult = await checkDuplicate({
      testRunRepo: repos.testRuns,
      contentHash: processedData.contentHash,
      projectId,
      logPrefix,
    });

    if (duplicateResult.isDuplicate && duplicateResult.existingRun) {
      const existingTime = new Date(
        duplicateResult.existingRun.timestamp,
      ).toLocaleString();
      return {
        success: false,
        error: "Duplicate upload detected",
        message: `This exact test run was already uploaded on ${existingTime}.`,
        existingRunId: duplicateResult.existingRun.id,
        isDuplicate: true,
      };
    }

    // 6. Insert test run and all related data
    const insertResult = await insertTestRun({
      testRunRepo: repos.testRuns,
      databaseIds,
      processedData,
      commit: params.commit,
      filename,
      logPrefix,
    });

    if (!insertResult.success || !insertResult.testRunId) {
      return {
        success: false,
        error: "Failed to store test results",
        details: insertResult.error,
      };
    }

    // 7. Check for run failure and trigger webhooks
    const passRate =
      processedData.stats.total > 0
        ? (processedData.stats.passed / processedData.stats.total) * 100
        : 100;

    // Trigger run failure webhook if there are any failures
    if (processedData.stats.failed > 0 && processedData.stats.total > 0) {
      try {
        console.log(
          `${logPrefix} Run failure detected (${passRate.toFixed(1)}% pass rate), triggering webhooks...`,
        );

        // Get project info via repository
        const project =
          await repos.projects.getProjectWithOrganization(projectId);

        if (project) {
          await triggerRunFailureWebhooks(
            {
              projectName: project.name,
              environment: processedData.environment,
              branch: processedData.branch,
              commit: params.commit,
              totalTests: processedData.stats.total,
              failedTests: processedData.stats.failed,
              flakyTests: processedData.stats.flaky || 0,
              passRate,
              runUrl: `${process.env.NEXT_PUBLIC_APP_URL || ""}/runs/${insertResult.testRunId}`,
              timestamp: processedData.timestamp,
            },
            projectId,
            project.organization_id,
          );
          console.log(`${logPrefix} Run failure webhooks triggered`);
        }
      } catch (webhookError) {
        console.error(
          `${logPrefix} Failed to trigger run failure webhooks:`,
          webhookError,
        );
      }
    }

    // 8. Aggregate flakiness and performance metrics
    const uploadDate = new Date(processedData.timestamp)
      .toISOString()
      .split("T")[0];
    try {
      console.log(`${logPrefix} Aggregating metrics for ${uploadDate}...`);

      await Promise.all([
        aggregateFlakinessMetrics(repos.metrics, uploadDate),
        aggregatePerformanceMetrics(repos.metrics, uploadDate),
      ]);
      console.log(`${logPrefix} Metrics aggregation complete`);

      // Detect alerts and trigger webhooks
      const alertResult = await detectAndNotifyAlerts(
        repos.metrics,
        uploadDate,
      );
      if (alertResult.alertsTriggered > 0) {
        console.log(
          `${logPrefix} Triggered ${alertResult.alertsTriggered} alerts, ${alertResult.webhooksTriggered} webhooks sent`,
        );
      }
    } catch (metricsError) {
      // Log but don't fail the upload if metrics aggregation fails
      console.error(`${logPrefix} Failed to aggregate metrics:`, metricsError);
    }

    // 9. Return success response
    return {
      success: true,
      testRunId: insertResult.testRunId,
      testRun: {
        id: insertResult.testRunId,
        timestamp: processedData.timestamp,
        environment: processedData.environment,
        trigger: params.trigger,
        suite: params.suite,
        branch: processedData.branch,
        commit: params.commit,
        ...processedData.stats,
        duration: processedData.durationFormatted,
        contentHash: processedData.contentHash,
        tests: processedData.tests,
      },
      message: `Successfully uploaded ${processedData.tests.length} tests (${processedData.stats.passed} passed, ${processedData.stats.failed} failed)`,
    };
  } catch (error) {
    console.error(`${logPrefix} Error in shared upload handler:`, error);
    return {
      success: false,
      error: "Failed to process upload",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
