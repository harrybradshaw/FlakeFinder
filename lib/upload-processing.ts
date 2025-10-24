/**
 * Shared upload processing utilities for both user and CI uploads
 * Extracts common logic to avoid duplication between routes
 */

import type JSZip from "jszip";
import { type Database } from "@/types/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractTestsFromZip,
  extractBranchFromCI,
  normalizeEnvironment,
  findScreenshotFiles,
  calculateTestStats,
  formatDuration,
  type ExtractedTest,
  type EnvironmentData,
} from "@/lib/zip-extraction-utils";
import { calculateContentHash } from "@/lib/playwright-report-utils";

export interface ScreenshotUploadResult {
  screenshotUrls: Record<string, string>;
  screenshotCount: number;
}

export interface StepsUploadResult {
  stepsUrl: string | null;
  lastFailedStep: {
    title: string;
    duration: number;
    error: string;
  } | null;
}

export interface ProcessedUpload {
  tests: ExtractedTest[];
  stats: ReturnType<typeof calculateTestStats>;
  contentHash: string;
  branch: string;
  environment: string;
  timestamp: string;
  ciMetadata: Record<string, unknown> | null;
  environmentData: EnvironmentData | null;
  totalDuration: number;
  durationFormatted: string;
}

export interface DatabaseIds {
  projectId: string;
  environmentId: string;
  triggerId: string;
  suiteId: string;
}

/**
 * Process screenshots from a ZIP file and upload to storage
 */
export async function processScreenshots(
  zip: JSZip,
  logPrefix: string = "[Upload]",
): Promise<ScreenshotUploadResult> {
  const screenshotFiles = findScreenshotFiles(zip);
  console.log(`${logPrefix} Found screenshots:`, screenshotFiles.length);

  if (screenshotFiles.length > 0) {
    console.log(
      `${logPrefix} Screenshot files sample:`,
      screenshotFiles.slice(0, 5),
    );
  }

  const screenshotUrls: Record<string, string> = {};

  for (const screenshotPath of screenshotFiles) {
    const screenshotFile = zip.file(screenshotPath);
    if (!screenshotFile) continue;

    const screenshotBuffer = await screenshotFile.async("nodebuffer");

    // Determine content type based on file extension
    const contentType =
      screenshotPath.endsWith(".jpg") || screenshotPath.endsWith(".jpeg")
        ? "image/jpeg"
        : "image/png";

    // Check if Supabase Storage is configured
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabaseAdmin = createClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          },
        );

        // Generate unique filename
        const timestamp = Date.now();
        const fileName = screenshotPath.split("/").pop() || "screenshot.png";
        const storagePath = `screenshots/${timestamp}-${fileName}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("test-screenshots")
          .upload(storagePath, screenshotBuffer, {
            contentType,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Generate signed URL (valid for 1 year)
        const { data: signedUrlData, error: signedUrlError } =
          await supabaseAdmin.storage
            .from("test-screenshots")
            .createSignedUrl(storagePath, 31536000);

        if (signedUrlError) throw signedUrlError;

        screenshotUrls[screenshotPath] = signedUrlData.signedUrl;
        console.log(
          `${logPrefix} Uploaded screenshot to Supabase Storage:`,
          storagePath,
        );
      } catch (error) {
        console.error(
          `${logPrefix} Failed to upload to Supabase Storage:`,
          error,
        );
        // Fall back to base64 encoding
        const base64 = screenshotBuffer.toString("base64");
        screenshotUrls[screenshotPath] = `data:${contentType};base64,${base64}`;
      }
    } else {
      console.log(
        `${logPrefix} Supabase Storage not configured, using base64 encoding`,
      );
      const base64 = screenshotBuffer.toString("base64");
      screenshotUrls[screenshotPath] = `data:${contentType};base64,${base64}`;
    }
  }

  return {
    screenshotUrls,
    screenshotCount: screenshotFiles.length,
  };
}

/**
 * Upload test steps to Supabase Storage and extract last failed step
 */
export async function processTestSteps(
  steps: unknown[] | undefined,
  testRunId: string,
  testId: string,
  retryIndex: number,
  logPrefix: string = "[Upload]",
): Promise<StepsUploadResult> {
  if (!steps || steps.length === 0) {
    return { stepsUrl: null, lastFailedStep: null };
  }

  // Helper function to recursively find the last failed step
  function findLastFailedStep(
    steps: unknown[],
  ): StepsUploadResult["lastFailedStep"] {
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i] as Record<string, unknown>;

      // Check nested steps first (depth-first search from end)
      if (step.steps && Array.isArray(step.steps)) {
        const nestedFailed = findLastFailedStep(step.steps);
        if (nestedFailed) return nestedFailed;
      }

      // Check if this step has an error
      if (step.error) {
        return {
          title: String(step.title || "Unknown step"),
          duration: Number(step.duration || 0),
          error:
            typeof step.error === "string"
              ? step.error
              : String(
                  (step.error as Record<string, unknown>)?.message ||
                    step.error,
                ),
        };
      }
    }
    return null;
  }

  const lastFailedStep = findLastFailedStep(steps);

  // Upload to Supabase Storage if configured
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseAdmin = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        },
      );

      // Generate unique path
      const stepsPath = `${testRunId}/${testId}-${retryIndex}.json`;

      // Convert steps to JSON buffer
      const stepsJson = JSON.stringify(steps, null, 2);
      const stepsBuffer = Buffer.from(stepsJson, "utf-8");

      // Upload to storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from("test-steps")
        .upload(stepsPath, stepsBuffer, {
          contentType: "application/json",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error(`${logPrefix} Failed to upload steps:`, uploadError);
        return { stepsUrl: null, lastFailedStep };
      }

      console.log(`${logPrefix} Uploaded steps to storage:`, stepsPath);

      return {
        stepsUrl: stepsPath,
        lastFailedStep,
      };
    } catch (error) {
      console.error(`${logPrefix} Error uploading steps:`, error);
      return { stepsUrl: null, lastFailedStep };
    }
  }

  console.log(
    `${logPrefix} Supabase Storage not configured, skipping steps upload`,
  );
  return { stepsUrl: null, lastFailedStep };
}

/**
 * Extract and process tests from ZIP file
 */
export async function processTestsFromZip(
  zip: JSZip,
  initialBranch: string,
  initialEnvironment: string,
  preCalculatedHash?: string,
  logPrefix: string = "[Upload]",
): Promise<ProcessedUpload> {
  // Extract tests using utility function
  const { tests, ciMetadata, testExecutionTime, environmentData } =
    await extractTestsFromZip(zip);

  console.log(`${logPrefix} Extracted tests:`, tests.length);

  if (environmentData) {
    console.log(`${logPrefix} Found environment data:`, environmentData);
  }

  let branch = initialBranch;
  let environment = initialEnvironment;

  // Extract branch from CI metadata if available
  if (ciMetadata) {
    console.log(`${logPrefix} Found CI metadata:`, ciMetadata);
    const detectedBranch = extractBranchFromCI(ciMetadata, branch);
    if (detectedBranch !== branch) {
      console.log(
        `${logPrefix} Overriding branch "${branch}" with CI metadata: "${detectedBranch}"`,
      );
      branch = detectedBranch;
    }

    // Normalize environment name
    const normalizedEnv = normalizeEnvironment(environment);
    if (normalizedEnv !== environment) {
      console.log(
        `${logPrefix} Mapping environment "${environment}" -> "${normalizedEnv}"`,
      );
      environment = normalizedEnv;
    }
  }

  if (branch === "unknown") {
    console.warn(
      `${logPrefix} WARNING: Branch is still 'unknown' after CI metadata extraction`,
    );
  }

  const stats = calculateTestStats(tests);
  const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);
  const durationFormatted = formatDuration(totalDuration);

  // Use pre-calculated hash if available, otherwise calculate from tests
  const contentHash = preCalculatedHash
    ? preCalculatedHash
    : await calculateContentHash(tests);

  if (preCalculatedHash) {
    console.log(`${logPrefix} Using pre-calculated hash:`, preCalculatedHash);
  } else {
    console.log(`${logPrefix} Calculated hash from tests:`, contentHash);
  }

  return {
    tests,
    stats,
    contentHash,
    branch,
    environment,
    timestamp: testExecutionTime || new Date().toISOString(),
    ciMetadata: (ciMetadata as Record<string, unknown>) || null,
    environmentData: environmentData || null,
    totalDuration,
    durationFormatted,
  };
}

/**
 * Verify user has access to project via their organization membership
 */
export async function verifyUserProjectAccess(params: {
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId: string;
  projectName: string;
  logPrefix?: string;
}): Promise<{
  success: boolean;
  error?: { message: string; status: number };
}> {
  const {
    supabase,
    userId,
    projectId,
    projectName,
    logPrefix = "[Upload]",
  } = params;

  // Verify user's organization has access to this project
  const { data: userOrgs, error: userOrgsError } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);

  if (userOrgsError) {
    console.error(
      `${logPrefix} Error fetching user organizations:`,
      userOrgsError,
    );
    return {
      success: false,
      error: { message: userOrgsError.message, status: 500 },
    };
  }

  const userOrgIds = userOrgs?.map((uo) => uo.organization_id) || [];

  if (userOrgIds.length === 0) {
    return {
      success: false,
      error: {
        message:
          "User must be a member of an organization to upload test results",
        status: 403,
      },
    };
  }

  // Check if any of user's organizations have access to this project
  const { data: orgProjectAccess } = await supabase
    .from("organization_projects")
    .select("organization_id")
    .eq("project_id", projectId)
    .in("organization_id", userOrgIds)
    .limit(1);

  if (!orgProjectAccess || orgProjectAccess.length === 0) {
    console.error(
      `${logPrefix} User's organizations do not have access to project:`,
      projectName,
    );
    return {
      success: false,
      error: {
        message: `You do not have access to upload to project '${projectName}'. Contact your administrator to grant access.`,
        status: 403,
      },
    };
  }

  return { success: true };
}

/**
 * Look up database IDs for environment, trigger, suite, and optionally project
 */
export async function lookupDatabaseIds(params: {
  supabase: SupabaseClient<Database>;
  projectName?: string;
  projectId?: string;
  environment: string;
  trigger: string;
  suite: string;
  logPrefix?: string;
}): Promise<{
  success: boolean;
  data?: DatabaseIds;
  error?: { message: string; status: number };
}> {
  const {
    supabase,
    projectName,
    projectId: providedProjectId,
    environment,
    trigger,
    suite,
    logPrefix = "[Upload]",
  } = params;

  try {
    // Look up project ID if not provided
    let projectId = providedProjectId;
    if (!projectId && projectName) {
      const { data: projectData, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("name", projectName)
        .eq("active", true)
        .single();

      if (projectError || !projectData) {
        console.error(
          `${logPrefix} Project not found:`,
          projectName,
          projectError,
        );
        return {
          success: false,
          error: {
            message: `Project '${projectName}' not found. Please add it to the database first.`,
            status: 400,
          },
        };
      }
      projectId = projectData.id;
    }

    if (!projectId) {
      return {
        success: false,
        error: {
          message: "Project ID is required",
          status: 400,
        },
      };
    }

    // Look up environment ID
    const { data: environmentData, error: envError } = await supabase
      .from("environments")
      .select("id")
      .eq("name", environment)
      .eq("active", true)
      .single();

    if (envError || !environmentData) {
      console.error(
        `${logPrefix} Environment not found:`,
        environment,
        envError,
      );
      return {
        success: false,
        error: {
          message: `Environment '${environment}' not found. Please add it to the database first.`,
          status: 400,
        },
      };
    }

    // Look up trigger ID
    const { data: triggerData, error: triggerError } = await supabase
      .from("test_triggers")
      .select("id")
      .eq("name", trigger)
      .eq("active", true)
      .single();

    if (triggerError || !triggerData) {
      console.error(`${logPrefix} Trigger not found:`, trigger, triggerError);
      return {
        success: false,
        error: {
          message: `Trigger '${trigger}' not found. Please add it to the database first.`,
          status: 400,
        },
      };
    }

    // Look up suite ID
    const { data: suiteData, error: suiteError } = await supabase
      .from("suites")
      .select("id")
      .eq("project_id", projectId)
      .eq("name", suite)
      .single();

    if (suiteError || !suiteData) {
      console.error(`${logPrefix} Suite not found:`, suite, suiteError);
      return {
        success: false,
        error: {
          message: `Suite "${suite}" not found. Please create it first.`,
          status: 400,
        },
      };
    }

    return {
      success: true,
      data: {
        projectId,
        environmentId: environmentData.id,
        triggerId: triggerData.id,
        suiteId: suiteData.id,
      },
    };
  } catch (error) {
    console.error(`${logPrefix} Error looking up database IDs:`, error);
    return {
      success: false,
      error: {
        message:
          error instanceof Error ? error.message : "Database lookup failed",
        status: 500,
      },
    };
  }
}

/**
 * Check for duplicate test run
 */
export async function checkDuplicate(params: {
  supabase: SupabaseClient<Database>;
  contentHash: string;
  projectId?: string;
  logPrefix?: string;
}): Promise<{
  isDuplicate: boolean;
  existingRun?: { id: string; timestamp: string };
}> {
  const { supabase, contentHash, projectId, logPrefix = "[Upload]" } = params;

  const query = supabase
    .from("test_runs")
    .select("id, timestamp")
    .eq("content_hash", contentHash);

  if (projectId) {
    query.eq("project_id", projectId);
  }

  const { data: existingRuns, error: checkError } = await query
    .order("timestamp", { ascending: false })
    .limit(1);

  if (checkError) {
    console.error(`${logPrefix} Error checking for duplicates:`, checkError);
    return { isDuplicate: false };
  }

  if (existingRuns && existingRuns.length > 0) {
    const existing = existingRuns[0];
    console.log(
      `${logPrefix} Duplicate detected! Existing run:`,
      existing.id,
      "from",
      new Date(existing.timestamp).toLocaleString(),
    );
    return {
      isDuplicate: true,
      existingRun: existing,
    };
  }

  return { isDuplicate: false };
}

/**
 * Insert test run and associated data into database
 */
export async function insertTestRun(params: {
  supabase: SupabaseClient<Database>;
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
    supabase,
    databaseIds,
    processedData,
    commit,
    filename,
    logPrefix = "[Upload]",
  } = params;

  try {
    // Insert test run
    const { data: runData, error: runError } = await supabase
      .from("test_runs")
      .insert({
        project_id: databaseIds.projectId,
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
        timestamp: processedData.timestamp,
        ci_metadata: processedData.ciMetadata as any, // Type cast for JSON field
        environment_data: processedData.environmentData as any, // Type cast for JSON field
        content_hash: processedData.contentHash,
        uploaded_filename: filename,
      })
      .select()
      .single();

    if (runError) {
      console.error(`${logPrefix} Failed to insert test run:`, runError);
      return {
        success: false,
        error: "Failed to create test run: " + runError.message,
      };
    }

    console.log(`${logPrefix} Inserted test run:`, runData.id);

    // Upsert suite_tests (canonical test definitions)
    const suiteTestsToUpsert = processedData.tests.map((test) => ({
      project_id: databaseIds.projectId,
      suite_id: databaseIds.suiteId,
      file: test.file,
      name: test.name,
    }));

    const { data: suiteTests, error: suiteTestsError } = await supabase
      .from("suite_tests")
      .upsert(suiteTestsToUpsert, {
        onConflict: "project_id,file,name",
        ignoreDuplicates: false,
      })
      .select();

    if (suiteTestsError) {
      console.error(
        `${logPrefix} Failed to upsert suite_tests:`,
        suiteTestsError,
      );
      return {
        success: false,
        error: "Failed to create test definitions",
      };
    }

    console.log(`${logPrefix} Upserted suite_tests:`, suiteTests?.length);

    // Create a map for quick lookup
    const suiteTestMap = new Map<string, string>();
    for (const st of suiteTests || []) {
      suiteTestMap.set(`${st.file}::${st.name}`, st.id);
    }

    // Insert individual test execution instances
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

    const { data: insertedTests, error: testsError } = await supabase
      .from("tests")
      .insert(testsToInsert)
      .select();

    if (testsError) {
      console.error(`${logPrefix} Failed to insert tests:`, testsError);
      return {
        success: false,
        error: "Failed to insert tests: " + testsError.message,
      };
    }

    console.log(`${logPrefix} Inserted tests:`, testsToInsert.length);

    // Insert retry results for tests with retries
    const testResultsToInsert = [];
    for (let i = 0; i < processedData.tests.length; i++) {
      const test = processedData.tests[i];
      const insertedTest = insertedTests?.[i];

      if (insertedTest && test.attempts && test.attempts.length > 0) {
        for (const attempt of test.attempts) {
          // Process steps: upload to storage and extract last failed
          const { stepsUrl, lastFailedStep } = await processTestSteps(
            attempt.steps,
            runData.id,
            insertedTest.id,
            attempt.retryIndex,
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
            steps_url: stepsUrl, // Store URL instead of full steps
            last_failed_step: lastFailedStep, // Store summary
          });
        }
      }
    }

    if (testResultsToInsert.length > 0) {
      const { error: resultsError } = await supabase
        .from("test_results")
        .insert(testResultsToInsert);

      if (resultsError) {
        console.error(
          `${logPrefix} Failed to insert test results:`,
          resultsError,
        );
      } else {
        console.log(
          `${logPrefix} Inserted test results:`,
          testResultsToInsert.length,
        );
      }
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
