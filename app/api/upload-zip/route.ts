import { type NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { calculateContentHash } from "@/lib/playwright-report-utils";
import {
  extractTestsFromZip,
  extractBranchFromCI,
  normalizeEnvironment,
  findScreenshotFiles,
  mapScreenshotPaths,
  calculateTestStats,
  formatDuration,
  type ExtractedTest,
} from "@/lib/zip-extraction-utils";
import { type Database } from "@/types/supabase";


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const project = formData.get("project") as string;
    let environment = formData.get("environment") as string;
    const trigger = formData.get("trigger") as string;
    const suite = formData.get("suite") as string;
    let branch = formData.get("branch") as string;
    const commit = formData.get("commit") as string;
    const preCalculatedHash = formData.get("contentHash") as string | null;

    if (!file || !environment || !trigger || !suite) {
      return NextResponse.json(
        {
          error: "Missing required fields: file, environment, trigger, suite",
        },
        { status: 400 },
      );
    }

    // Branch can be extracted from CI metadata later if not provided
    if (!branch) {
      branch = "unknown";
      console.log(
        "[v0] Branch not provided, will attempt to extract from CI metadata",
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Extract tests using utility function
    const { tests, ciMetadata, testExecutionTime } =
      await extractTestsFromZip(zip);

    // Extract branch from CI metadata if available
    if (ciMetadata) {
      console.log("[v0] Found CI metadata:", ciMetadata);
      const detectedBranch = extractBranchFromCI(ciMetadata, branch);
      if (detectedBranch !== branch) {
        console.log(
          `[v0] Overriding branch "${branch}" with CI metadata: "${detectedBranch}"`,
        );
        branch = detectedBranch;
      }

      // Normalize environment name
      const normalizedEnv = normalizeEnvironment(environment);
      if (normalizedEnv !== environment) {
        console.log(
          `[v0] Mapping environment "${environment}" -> "${normalizedEnv}"`,
        );
        environment = normalizedEnv;
      }
    }

    console.log("[v0] Extracted tests:", tests.length);

    const screenshotFiles = findScreenshotFiles(zip);

    console.log("[v0] Found screenshots:", screenshotFiles.length);
    if (screenshotFiles.length > 0) {
      console.log("[v0] Screenshot files sample:", screenshotFiles.slice(0, 5));
    }

    const screenshotUrls: Record<string, string> = {};

    // Process each screenshot
    for (const screenshotPath of screenshotFiles) {
      const screenshotFile = zip.file(screenshotPath);
      if (screenshotFile) {
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
            // Upload to Supabase Storage
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

            // Generate unique filename: testRunId/timestamp-originalname
            const timestamp = Date.now();
            const fileName =
              screenshotPath.split("/").pop() || "screenshot.png";
            const storagePath = `screenshots/${timestamp}-${fileName}`;

            const { data: uploadData, error: uploadError } =
              await supabaseAdmin.storage
                .from("test-screenshots")
                .upload(storagePath, screenshotBuffer, {
                  contentType,
                  cacheControl: "3600",
                  upsert: false,
                });

            if (uploadError) {
              throw uploadError;
            }

            // Generate signed URL (valid for 1 year)
            // This allows private bucket access without making it public
            const { data: signedUrlData, error: signedUrlError } =
              await supabaseAdmin.storage
                .from("test-screenshots")
                .createSignedUrl(storagePath, 31536000); // 1 year in seconds

            if (signedUrlError) {
              throw signedUrlError;
            }

            screenshotUrls[screenshotPath] = signedUrlData.signedUrl;
            console.log(
              "[v0] Uploaded screenshot to Supabase Storage (private):",
              storagePath,
            );
          } catch (error) {
            console.error("[v0] Failed to upload to Supabase Storage:", error);
            // Fall back to base64 encoding
            const base64 = screenshotBuffer.toString("base64");
            screenshotUrls[screenshotPath] =
              `data:${contentType};base64,${base64}`;
          }
        } else {
          console.log(
            "[v0] Supabase Storage not configured, using base64 encoding",
          );
          // Convert to base64 for inline display
          const base64 = screenshotBuffer.toString("base64");
          screenshotUrls[screenshotPath] =
            `data:${contentType};base64,${base64}`;
        }
      }
    }

    // Map screenshot paths to URLs
    mapScreenshotPaths(tests, screenshotUrls);

    // Final validation and logging after CI metadata extraction
    console.log("[v0] Final upload parameters after CI extraction:", {
      environment,
      trigger,
      branch,
      commit: commit || "unknown",
    });

    if (branch === "unknown") {
      console.warn(
        "[v0] WARNING: Branch is still 'unknown' after CI metadata extraction",
      );
    }

    const stats = calculateTestStats(tests);

    const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0);
    const durationFormatted = formatDuration(totalDuration);

    // Use pre-calculated hash if available (from optimized upload flow)
    // Otherwise calculate from tests
    const contentHash = preCalculatedHash
      ? preCalculatedHash
      : await calculateContentHash(tests);

    if (preCalculatedHash) {
      console.log("[Upload] Using pre-calculated hash:", preCalculatedHash);
    } else {
      console.log("[Upload] Calculated hash from tests:", contentHash);
    }

    const testRun = {
      id: crypto.randomUUID(),
      timestamp: testExecutionTime || new Date().toISOString(), // Use test execution time if available
      environment,
      trigger,
      branch,
      commit: commit || "unknown",
      ...stats,
      duration: durationFormatted,
      contentHash,
      tests,
    };

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient<Database>(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_ANON_KEY,
        );

        // Verify user authentication (Clerk middleware ensures this, but double-check)
        const { auth } = await import("@clerk/nextjs/server");
        const { userId } = await auth();

        if (!userId) {
          return NextResponse.json(
            { error: "User not authenticated" },
            { status: 401 },
          );
        }

        // Look up project ID (default to 'default' project if not specified)
        const projectName = project || "default";
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select("id")
          .eq("name", projectName)
          .eq("active", true)
          .single();

        if (projectError || !projectData) {
          console.error("[v0] Project not found:", projectName, projectError);
          return NextResponse.json(
            {
              error: `Project '${projectName}' not found. Please add it to the database first.`,
            },
            { status: 400 },
          );
        }

        // Verify user's organization has access to this project
        const { data: userOrgs, error: userOrgsError } = await supabase
          .from("user_organizations")
          .select("organization_id")
          .eq("user_id", userId);

        if (userOrgsError) {
          console.error(
            "[v0] Error fetching user organizations:",
            userOrgsError,
          );
          return NextResponse.json(
            { error: userOrgsError.message },
            { status: 500 },
          );
        }

        const userOrgIds = userOrgs?.map((uo) => uo.organization_id) || [];

        if (userOrgIds.length === 0) {
          return NextResponse.json(
            {
              error:
                "User must be a member of an organization to upload test results",
            },
            { status: 403 },
          );
        }

        // Check if any of user's organizations have access to this project
        const { data: orgProjectAccess } = await supabase
          .from("organization_projects")
          .select("organization_id")
          .eq("project_id", projectData.id)
          .in("organization_id", userOrgIds)
          .limit(1);

        if (!orgProjectAccess || orgProjectAccess.length === 0) {
          console.error(
            "[v0] User's organizations do not have access to project:",
            projectName,
          );
          return NextResponse.json(
            {
              error: `You do not have access to upload to project '${projectName}'. Contact your administrator to grant access.`,
            },
            { status: 403 },
          );
        }

        // Look up environment and trigger IDs
        const { data: environmentData, error: envError } = await supabase
          .from("environments")
          .select("id")
          .eq("name", environment)
          .eq("active", true)
          .single();

        if (envError || !environmentData) {
          console.error("[v0] Environment not found:", environment, envError);
          return NextResponse.json(
            {
              error: `Environment '${environment}' not found. Please add it to the database first.`,
            },
            { status: 400 },
          );
        }

        const { data: triggerData, error: triggerError } = await supabase
          .from("test_triggers")
          .select("id")
          .eq("name", trigger)
          .eq("active", true)
          .single();

        if (triggerError || !triggerData) {
          console.error("[v0] Trigger not found:", trigger, triggerError);
          return NextResponse.json(
            {
              error: `Trigger '${trigger}' not found. Please add it to the database first.`,
            },
            { status: 400 },
          );
        }

        const projectId = projectData.id;
        const environmentId = environmentData.id;
        const triggerId = triggerData.id;

        // Check for duplicate
        const { data: existingRuns, error: checkError } = await supabase
          .from("test_runs")
          .select("id, timestamp")
          .eq("content_hash", contentHash)
          .order("timestamp", { ascending: false })
          .limit(1);

        if (checkError) {
          console.error("[v0] Error checking for duplicates:", checkError);
        } else if (existingRuns && existingRuns.length > 0) {
          const existing = existingRuns[0];
          const existingTime = new Date(existing.timestamp).toLocaleString();
          console.log(
            "[v0] Duplicate detected! Existing run:",
            existing.id,
            "from",
            existingTime,
          );

          return NextResponse.json(
            {
              error: "Duplicate upload detected",
              message: `This exact test run was already uploaded on ${existingTime}. If you want to re-upload, please modify the tests or wait for different results.`,
              existingRunId: existing.id,
              isDuplicate: true,
            },
            { status: 409 },
          );
        }

        // Insert test run
        const { data: runData, error: runError } = await supabase
          .from("test_runs")
          .insert({
            project_id: projectId,
            environment_id: environmentId,
            trigger_id: triggerId,
            branch,
            commit,
            total: stats.total,
            passed: stats.passed,
            failed: stats.failed,
            flaky: stats.flaky,
            skipped: stats.skipped,
            duration: totalDuration,
            timestamp: testRun.timestamp,
            ci_metadata: ciMetadata,
            content_hash: contentHash,
            uploaded_filename: file.name,
          })
          .select()
          .single();

        if (runError) {
          console.error("[v0] Failed to insert test run:", runError);
        } else {
          console.log("[v0] Inserted test run:", runData);

          // Get the suite for this project (must exist)
          const { data: targetSuite, error: suiteError } = await supabase
            .from("suites")
            .select("id")
            .eq("project_id", projectId)
            .eq("name", suite)
            .single();

          if (suiteError || !targetSuite) {
            console.error("[v0] Suite not found:", suite, suiteError);
            return NextResponse.json(
              { error: `Suite "${suite}" not found. Please create it first.` },
              { status: 400 },
            );
          }

          const suiteId = targetSuite.id;
          console.log("[v0] Using suite:", suite, suiteId);

          // Upsert suite_tests (canonical test definitions) with suite_id
          const suiteTestsToUpsert = tests.map((test) => ({
            project_id: projectId,
            suite_id: suiteId,
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
              "[v0] Failed to upsert suite_tests:",
              suiteTestsError,
            );
            return NextResponse.json(
              { error: "Failed to create test definitions" },
              { status: 500 },
            );
          }

          console.log("[v0] Upserted suite_tests:", suiteTests?.length);

          // Create a map of (file,name) -> suite_test_id for quick lookup
          const suiteTestMap = new Map<string, string>();
          for (const st of suiteTests || []) {
            suiteTestMap.set(`${st.file}::${st.name}`, st.id);
          }

          // Insert individual test execution instances
          const testsToInsert = tests.map((test: any) => {
            const startedAt = test.started_at
              ? new Date(test.started_at).toISOString()
              : null;
            const suiteTestId = suiteTestMap.get(`${test.file}::${test.name}`);
            console.log(
              `[v0] Inserting test "${test.name}" - started_at:`,
              startedAt,
              "suite_test_id:",
              suiteTestId,
            );
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
            console.error("[v0] Failed to insert tests:", testsError);
          } else {
            console.log("[v0] Inserted tests:", testsToInsert.length);

            // Insert retry results for tests with retries
            const testResultsToInsert = [];
            for (let i = 0; i < tests.length; i++) {
              const test = tests[i];
              const insertedTest = insertedTests?.[i];

              if (
                insertedTest &&
                test.attempts &&
                test.attempts.length > 0
              ) {
                for (const attempt of test.attempts) {
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
                  "[v0] Failed to insert test results:",
                  resultsError,
                );
              } else {
                console.log(
                  "[v0] Inserted test results:",
                  testResultsToInsert.length,
                );
              }
            }
          }
        }
      } catch (error) {
        console.error("[v0] Supabase error:", error);
      }
    } else {
      console.log("[v0] Supabase not configured, skipping database storage");
    }

    return NextResponse.json({
      success: true,
      testRun,
      message: `Processed ${tests.length} tests with ${screenshotFiles.length} screenshots`,
    });
  } catch (error) {
    console.error("[v0] Error processing ZIP file:", error);
    return NextResponse.json(
      {
        error: "Failed to process ZIP file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
