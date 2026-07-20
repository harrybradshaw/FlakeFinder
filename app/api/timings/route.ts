import { type NextRequest, NextResponse } from "next/server";
import { type Database } from "@/types/supabase";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { createRepositories } from "@/lib/repositories";

const DEFAULT_WINDOW_DAYS = 14;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 90;

function parseWindowDays(value: string | null): number {
  const parsed = value ? Number(value) : NaN;

  if (!Number.isFinite(parsed)) return DEFAULT_WINDOW_DAYS;

  return Math.min(
    MAX_WINDOW_DAYS,
    Math.max(MIN_WINDOW_DAYS, Math.trunc(parsed)),
  );
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateApiKey();

    if (!authResult.valid) {
      return NextResponse.json(
        { error: authResult.error || "Authentication failed" },
        { status: 401 },
      );
    }

    const suiteId = authResult.suiteId;

    if (!suiteId) {
      return NextResponse.json(
        { error: "API key is not associated with a suite" },
        { status: 400 },
      );
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 500 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const windowDays = parseWindowDays(searchParams.get("windowDays"));
    const environment = searchParams.get("environment");
    const trigger = searchParams.get("trigger");

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient<Database>(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
    );
    const repos = createRepositories(supabase);

    let environmentId: string | undefined;
    let triggerId: string | undefined;

    if (environment) {
      const envData = await repos.lookups.getEnvironmentByName(environment);
      if (envData) environmentId = envData.id;
    }

    if (trigger) {
      const trigData = await repos.lookups.getTriggerByName(trigger);
      if (trigData) triggerId = trigData.id;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - windowDays);

    const timings = await repos.metrics.getFileTimings(
      suiteId,
      startDate,
      environmentId,
      triggerId,
    );

    const files = Object.fromEntries(
      timings.map((timing) => [timing.file, timing.expected_duration_ms]),
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      windowDays,
      suiteId,
      files,
    });
  } catch (error) {
    console.error("[API] Error fetching file timings:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch file timings",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
