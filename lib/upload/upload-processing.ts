import type JSZip from "jszip";
import { type Database } from "@/types/supabase";
import type { LookupRepository, TestRunRepository } from "@/lib/repositories";
import {
  calculateTestStats,
  type EnvironmentData,
  extractBranchFromCI,
  extractTestsFromZip,
  findScreenshotFiles,
  formatDuration,
  normalizeEnvironment,
} from "@/lib/upload/zip-extraction-utils";
import { calculateContentHash } from "@/lib/playwright-report-utils";
import { type ExtractedTest } from "@/types/extracted-test";

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

    const contentType =
      screenshotPath.endsWith(".jpg") || screenshotPath.endsWith(".jpeg")
        ? "image/jpeg"
        : "image/png";

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

        const { data: signedUrlData, error: signedUrlError } =
          await supabaseAdmin.storage
            .from("test-screenshots")
            .createSignedUrl(storagePath, 31536000);

        if (signedUrlError) throw signedUrlError;

        screenshotUrls[screenshotPath] = signedUrlData.signedUrl;
      } catch (error) {
        console.error(
          `${logPrefix} Failed to upload to Supabase Storage:`,
          error,
        );
      }
    }
  }

  return {
    screenshotUrls,
    screenshotCount: screenshotFiles.length,
  };
}

function findLastFailedStep(
  steps: unknown[],
): StepsUploadResult["lastFailedStep"] {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i] as Record<string, unknown>;

    if (step.steps && Array.isArray(step.steps)) {
      const nestedFailed = findLastFailedStep(step.steps);
      if (nestedFailed) return nestedFailed;
    }

    if (step.error) {
      return {
        title: String(step.title || "Unknown step"),
        duration: Number(step.duration || 0),
        error:
          typeof step.error === "string"
            ? step.error
            : String(
                (step.error as Record<string, unknown>)?.message || step.error,
              ),
      };
    }
  }
  return null;
}

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

  const lastFailedStep = findLastFailedStep(steps);

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

      const stepsPath = `${testRunId}/${testId}-${retryIndex}.json`;
      const stepsJson = JSON.stringify(steps, null, 2);
      const stepsBuffer = Buffer.from(stepsJson, "utf-8");

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

      return {
        stepsUrl: stepsPath,
        lastFailedStep,
      };
    } catch (error) {
      console.error(`${logPrefix} Error uploading steps:`, error);
      return { stepsUrl: null, lastFailedStep };
    }
  }

  return { stepsUrl: null, lastFailedStep };
}

export async function processTestsFromZip(
  zip: JSZip,
  initialBranch: string,
  initialEnvironment: string,
  preCalculatedHash?: string,
  logPrefix: string = "[Upload]",
): Promise<ProcessedUpload> {
  const { tests, ciMetadata, testExecutionTime, environmentData } =
    await extractTestsFromZip(zip);

  let branch = initialBranch;
  let environment = initialEnvironment;

  if (ciMetadata) {
    console.log(`${logPrefix} Found CI metadata:`, ciMetadata);
    const detectedBranch = extractBranchFromCI(ciMetadata, branch);
    if (detectedBranch !== branch) {
      branch = detectedBranch;
    }

    const normalizedEnv = normalizeEnvironment(environment);
    if (normalizedEnv !== environment) {
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

  const contentHash = preCalculatedHash
    ? preCalculatedHash
    : await calculateContentHash(tests);

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

export async function verifyUserProjectAccess(params: {
  lookupRepo: LookupRepository;
  userId: string;
  projectId: string;
  logPrefix?: string;
}): Promise<{
  success: boolean;
  error?: { message: string; status: number };
}> {
  const { lookupRepo, userId, projectId, logPrefix = "[Upload]" } = params;

  try {
    const userOrgIds = await lookupRepo.getUserOrganizations(userId);

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

    const hasAccess = await lookupRepo.checkOrganizationProjectAccess(
      projectId,
      userOrgIds,
    );

    if (!hasAccess) {
      console.error(
        `${logPrefix} User's organizations do not have access to project`,
      );
      return {
        success: false,
        error: {
          message: `You do not have access to upload to project. Contact your administrator to grant access.`,
          status: 403,
        },
      };
    }

    return { success: true };
  } catch (error) {
    console.error(`${logPrefix} Error verifying user project access:`, error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Access check failed",
        status: 500,
      },
    };
  }
}

export async function lookupDatabaseIds(params: {
  lookupRepo: LookupRepository;
  environmentName: string;
  triggerName: string;
  suiteId: string;
  logPrefix?: string;
}): Promise<{
  success: boolean;
  data?: DatabaseIds;
  error?: { message: string; status: number };
}> {
  const {
    lookupRepo,
    environmentName: environment,
    triggerName: trigger,
    suiteId,
    logPrefix = "[Upload]",
  } = params;

  try {
    const suiteData = await lookupRepo.getSuiteById(suiteId);

    if (!suiteData) {
      console.error(`${logPrefix} Suite not found:`, suiteId);
      return {
        success: false,
        error: {
          message: `Suite "${suiteId}" not found. Please create it first.`,
          status: 400,
        },
      };
    }

    const projectId = suiteData.project_id;
    console.log(`${logPrefix} Using project from suite:`, projectId);

    const environmentNameToUse =
      environment === "preview" ? "development" : environment;
    const environmentData =
      await lookupRepo.getEnvironmentByName(environmentNameToUse);

    if (!environmentData) {
      console.error(
        `${logPrefix} Environment not found:`,
        environmentNameToUse,
      );
      return {
        success: false,
        error: {
          message: `Environment '${environmentNameToUse}' not found. Please add it to the database first.`,
          status: 400,
        },
      };
    }

    const triggerData = await lookupRepo.getTriggerByName(trigger);
    if (!triggerData) {
      console.error(`${logPrefix} Trigger not found:`, trigger);
      return {
        success: false,
        error: {
          message: `Trigger '${trigger}' not found. Please add it to the database first.`,
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
        suiteId: suiteId,
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

export async function checkDuplicate(params: {
  testRunRepo: TestRunRepository;
  contentHash: string;
  projectId: string;
  logPrefix?: string;
}): Promise<{
  isDuplicate: boolean;
  existingRun?: { id: string; timestamp: string };
}> {
  const {
    testRunRepo,
    contentHash,
    projectId,
    logPrefix = "[Upload]",
  } = params;

  try {
    const existingRun = await testRunRepo.findDuplicateByContentHash(
      contentHash,
      projectId,
    );

    if (existingRun) {
      console.log(
        `${logPrefix} Duplicate detected! Existing run:`,
        existingRun.id,
        "from",
        new Date(existingRun.timestamp).toLocaleString(),
      );
      return {
        isDuplicate: true,
        existingRun,
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error(`${logPrefix} Error checking for duplicates:`, error);
    return { isDuplicate: false };
  }
}
