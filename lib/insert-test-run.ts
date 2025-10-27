import { calculateWallClockDuration } from "@/lib/utils/wall-clock-duration";
import {
  type DatabaseIds,
  type ProcessedUpload,
  processTestSteps,
} from "@/lib/upload/upload-processing";
import type { TestRunRepository } from "@/lib/repositories";

export async function insertTestRun(params: {
  testRunRepo: TestRunRepository;
  databaseIds: DatabaseIds;
  processedData: ProcessedUpload;
  commit: string;
  filename: string;
  logPrefix?: string;
}): Promise<{
  success: boolean;
  testRunId?: string;
  error?: string;
}> {
  const {
    testRunRepo,
    databaseIds,
    processedData,
    commit,
    filename,
    logPrefix = "[Upload]",
  } = params;

  try {
    const wallClockDuration = calculateWallClockDuration(
      processedData.tests.map((t) => ({
        started_at: t.started_at || new Date().toISOString(),
        duration: t.duration,
      })),
    );

    const runData = await testRunRepo.createTestRun({
      project_id: databaseIds.projectId,
      suite_id: databaseIds.suiteId,
      environment_id: databaseIds.environmentId,
      trigger_id: databaseIds.triggerId,
      branch: processedData.branch,
      commit,
      total: processedData.stats.total,
      passed: processedData.stats.passed,
      failed: processedData.stats.failed,
      flaky: processedData.stats.flaky,
      skipped: processedData.stats.skipped,
      duration: processedData.totalDuration,
      wall_clock_duration: wallClockDuration,
      timestamp: processedData.timestamp,
      ci_metadata: processedData.ciMetadata as any, // Type cast for JSON field
      environment_data: processedData.environmentData as any, // Type cast for JSON field
      content_hash: processedData.contentHash,
      uploaded_filename: filename,
    });

    const suiteTestsToUpsert = processedData.tests.map((test) => ({
      project_id: databaseIds.projectId,
      suite_id: databaseIds.suiteId,
      file: test.file,
      name: test.name,
    }));

    const suiteTests = await testRunRepo.upsertSuiteTests(suiteTestsToUpsert);

    const suiteTestMap = new Map<string, string>();
    for (const st of suiteTests || []) {
      suiteTestMap.set(`${st.file}::${st.name}`, st.id);
    }

    const testsToInsert = processedData.tests.map((test) => {
      const startedAt = test.started_at
        ? new Date(test.started_at).toISOString()
        : null;
      const suiteTestId = suiteTestMap.get(`${test.file}::${test.name}`);
      return {
        test_run_id: runData.id,
        suite_test_id: suiteTestId,
        status: test.status,
        duration: test.duration,
        worker_index: test.worker_index,
        started_at: startedAt,
        error: test.error,
        screenshots: test.screenshots,
        metadata: test.metadata || {},
      };
    });

    const insertedTests = await testRunRepo.insertTests(testsToInsert);

    const testResultsToInsert = [];
    for (let i = 0; i < processedData.tests.length; i++) {
      const test = processedData.tests[i];
      const insertedTest = insertedTests?.[i];

      if (insertedTest && test.attempts && test.attempts.length > 0) {
        for (const attempt of test.attempts) {
          const { stepsUrl, lastFailedStep } = await processTestSteps(
            attempt.steps,
            runData.id,
            insertedTest.id,
            attempt.retryIndex ?? 0,
            logPrefix,
          );

          testResultsToInsert.push({
            test_id: insertedTest.id,
            retry_index: attempt.retryIndex,
            status: attempt.status,
            duration: attempt.duration,
            error: attempt.error,
            error_stack: attempt.errorStack,
            screenshots: attempt.screenshots,
            attachments: attempt.attachments || [],
            started_at: attempt.startTime,
            steps_url: stepsUrl,
            last_failed_step: lastFailedStep,
          });
        }
      }
    }

    if (testResultsToInsert.length > 0) {
      await testRunRepo.insertTestResults(testResultsToInsert);
    }

    return {
      success: true,
      testRunId: runData.id,
    };
  } catch (error) {
    console.error(`${logPrefix} Error inserting test run:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
