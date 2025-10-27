import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { type Database } from "@/types/supabase";
import { createRepositories } from "@/lib/repositories";

interface FailurePattern {
  stepTitle: string;
  errorMessage: string;
  occurrences: number;
  affectedTests: Array<{
    testId: string;
    testName: string;
    testFile: string;
    testRunId: string;
    timestamp: string;
    screenshot?: string;
  }>;
  failureRate: number;
  avgDuration: number;
  latestScreenshot?: string;
}

interface StepAnalysis {
  title: string;
  totalOccurrences: number;
  failureCount: number;
  errors: Map<string, { count: number; tests: Set<string> }>;
}

/**
 * Normalize error messages to group similar errors while preserving important context
 */
function normalizeError(error: string | { message?: string }): string {
  let errorText = typeof error === "string" ? error : error?.message || "";

  // Remove ANSI codes
  // eslint-disable-next-line no-control-regex
  errorText = errorText.replace(/\u001b\[\d+m/g, "");

  // For Playwright errors, try to extract the full context including locator and call log
  // This preserves valuable debugging information
  const lines = errorText.split("\n");

  // Check if this looks like a Playwright error with structured information
  const hasLocator = errorText.includes("Locator:");
  const hasExpected = errorText.includes("Expected:");
  const hasCallLog = errorText.includes("Call log:");

  let message: string;

  if (hasLocator || hasExpected || hasCallLog) {
    // Keep the full structured error but normalize dynamic values
    // Take lines until we hit a stack trace (lines starting with "at ")
    const relevantLines = [];
    for (const line of lines) {
      if (line.trim().startsWith("at ") || line.includes("    at ")) {
        break; // Stop at stack trace
      }
      relevantLines.push(line);
    }
    message = relevantLines.join("\n");
  } else {
    // For simpler errors, just take the first line
    message = lines[0];
  }

  // Normalize dynamic values while preserving the structure
  message = message
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "[TIMESTAMP]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[UUID]",
    )
    .replace(/\b\d{13,}\b/g, "[TIMESTAMP]")
    .replace(/with timeout \d+ms/g, "with timeout [DURATION]ms")
    .replace(/timeout of \d+ms/gi, "timeout of [DURATION]ms")
    .replace(/\b\d+ms\b/g, "[DURATION]ms")
    .replace(/\b\d+s\b/g, "[DURATION]s")
    // Currency values (£, $, €, etc.) with decimal amounts
    .replace(/[£$€¥₹]\d+(?:\.\d+)?/g, "[CURRENCY]")
    .replace(/\d+(?:\.\d+)?\s*(?:USD|GBP|EUR|JPY|INR|CAD|AUD)/gi, "[CURRENCY]")
    .replace(/expected "\d+"/gi, 'expected "[NUMBER]"')
    .replace(/received "\d+"/gi, 'received "[NUMBER]"')
    // Also handle expected/received with currency symbols
    .replace(
      /expected string: "([£$€¥₹]\d+(?:\.\d+)?)"/gi,
      'expected string: "[CURRENCY]"',
    )
    .replace(
      /received string: "([£$€¥₹]\d+(?:\.\d+)?)"/gi,
      'received string: "[CURRENCY]"',
    )
    .replace(
      /Expected string: "([£$€¥₹]\d+(?:\.\d+)?)"/gi,
      'Expected string: "[CURRENCY]"',
    )
    .replace(
      /Received string: "([£$€¥₹]\d+(?:\.\d+)?)"/gi,
      'Received string: "[CURRENCY]"',
    )
    .replace(/\d+px/g, "[SIZE]px")
    .replace(/retry #\d+/gi, "retry #[N]")
    .replace(/attempt \d+/gi, "attempt [N]");

  return message.trim();
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const project = searchParams.get("project");
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");
    const suite = searchParams.get("suite");
    const testId = searchParams.get("testId");
    const timeRange = searchParams.get("timeRange") || "7d";
    const minOccurrences = parseInt(searchParams.get("minOccurrences") || "2");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json({ patterns: [] });
    }

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ patterns: [] });
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    // Get user's organizations
    const userOrgIds = await repos.lookups.getUserOrganizations(userId);

    if (userOrgIds.length === 0) {
      return NextResponse.json({ patterns: [] });
    }

    // Get accessible projects
    const accessibleProjectIds =
      await repos.lookups.getAccessibleProjectIds(userOrgIds);

    if (accessibleProjectIds.length === 0) {
      return NextResponse.json({ patterns: [] });
    }

    // Calculate time range
    const now = new Date();
    const startDate = new Date();
    switch (timeRange) {
      case "24h":
        startDate.setHours(now.getHours() - 24);
        break;
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Look up filter IDs
    let projectId = null;
    let environmentId = null;
    let triggerId = null;
    let suiteId = null;

    if (project && project !== "all") {
      const projData = await repos.projects.getProjectByName(project);
      if (projData) projectId = projData.id;
    }

    if (environment && environment !== "all") {
      const envData = await repos.lookups.getEnvironmentByName(environment);
      if (envData) environmentId = envData.id;
    }

    if (trigger && trigger !== "all") {
      const trigData = await repos.lookups.getTriggerByName(trigger);
      if (trigData) triggerId = trigData.id;
    }

    if (suite && suite !== "all") {
      const suiteData = await repos.lookups.getSuiteByName(suite);
      if (suiteData) suiteId = suiteData.id;
    }

    if (projectId && !accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ patterns: [] });
    }

    const runs = await repos.testRuns.getTestRunsForFailureAnalysis(
      accessibleProjectIds,
      startDate,
      projectId,
      environmentId,
      triggerId,
    );

    if (!runs || runs.length === 0) {
      return NextResponse.json({ patterns: [] });
    }

    const runIds = runs.map((r) => r.id);

    let suiteTestIdList: string[] | null = null;
    if (suiteId) {
      suiteTestIdList = await repos.testRuns.getSuiteTestIdsBySuite(suiteId);

      if (suiteTestIdList.length === 0) {
        return NextResponse.json({ patterns: [] });
      }
    }

    const tests = await repos.testRuns.getTestsForFailureAnalysis(
      runIds,
      testId,
      suiteTestIdList,
    );

    if (!tests || tests.length === 0) {
      return NextResponse.json({ patterns: [] });
    }

    const testIds = tests.map((t) => t.id);
    const testResults = await repos.testRuns.getFailedTestResults(testIds);

    if (!testResults || testResults.length === 0) {
      return NextResponse.json({ patterns: [] });
    }

    const stepAnalysis = new Map<string, StepAnalysis>();

    for (const result of testResults) {
      const test = tests.find((t) => t.id === result.test_id);
      if (!test) continue;

      const suiteTest = test.suite_tests as
        | { name: string; file: string }
        | undefined;

      const screenshots = result.screenshots as string[] | null;
      const screenshot =
        screenshots && screenshots.length > 0 ? screenshots[0] : undefined;

      const testInfo = {
        testId: test.id,
        testName: suiteTest?.name || "Unknown",
        testFile: suiteTest?.file || "Unknown",
        testRunId: test.test_run_id,
        timestamp: runs.find((r) => r.id === test.test_run_id)?.timestamp || "",
        screenshot,
      };

      if (result.status === "failed" && result.last_failed_step) {
        const failedStep = result.last_failed_step as {
          title?: string;
          error?: string;
        };
        const stepTitle = failedStep.title || "Unknown Step";
        const errorMsg = normalizeError(failedStep.error || result.error || "");

        if (!stepAnalysis.has(stepTitle)) {
          stepAnalysis.set(stepTitle, {
            title: stepTitle,
            totalOccurrences: 0,
            failureCount: 0,
            errors: new Map(),
          });
        }

        const analysis = stepAnalysis.get(stepTitle)!;
        analysis.totalOccurrences++;
        analysis.failureCount++;

        if (!analysis.errors.has(errorMsg)) {
          analysis.errors.set(errorMsg, { count: 0, tests: new Set() });
        }

        const errorData = analysis.errors.get(errorMsg)!;
        errorData.count++;
        errorData.tests.add(JSON.stringify(testInfo));
      }
    }

    const patterns: FailurePattern[] = [];

    for (const [stepTitle, analysis] of stepAnalysis.entries()) {
      for (const [errorMsg, errorData] of analysis.errors.entries()) {
        if (errorData.count >= minOccurrences) {
          const affectedTests = Array.from(errorData.tests)
            .map((t) => JSON.parse(t))
            .slice(0, 10); // Limit to 10 examples

          const latestScreenshot = affectedTests
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            )
            .find((t) => t.screenshot)?.screenshot;

          patterns.push({
            stepTitle,
            errorMessage: errorMsg,
            occurrences: errorData.count,
            affectedTests,
            failureRate:
              (analysis.failureCount / analysis.totalOccurrences) * 100,
            avgDuration: 0,
            latestScreenshot,
          });
        }
      }
    }

    patterns.sort((a, b) => b.occurrences - a.occurrences);
    const limitedPatterns = patterns.slice(0, limit);

    return NextResponse.json({
      patterns: limitedPatterns,
      summary: {
        totalPatterns: patterns.length,
        timeRange,
        analyzedRuns: runs.length,
        analyzedTests: tests.length,
      },
    });
  } catch (error) {
    console.error("[API] Error analyzing failure patterns:", error);
    return NextResponse.json(
      { error: "Failed to analyze failure patterns" },
      { status: 500 },
    );
  }
}
