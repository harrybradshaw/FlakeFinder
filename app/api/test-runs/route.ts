import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const environment = searchParams.get("environment")
    const trigger = searchParams.get("trigger")
    const timeRange = searchParams.get("timeRange") || "7d"

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured, returning empty array")
      return NextResponse.json({ runs: [] })
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

    // Calculate time range
    const now = new Date()
    let startDate = new Date()
    switch (timeRange) {
      case "24h":
        startDate.setHours(now.getHours() - 24)
        break
      case "7d":
        startDate.setDate(now.getDate() - 7)
        break
      case "30d":
        startDate.setDate(now.getDate() - 30)
        break
      case "90d":
        startDate.setDate(now.getDate() - 90)
        break
      default:
        startDate.setDate(now.getDate() - 7)
    }

    // Build query
    let query = supabase
      .from("test_runs")
      .select("*")
      .gte("timestamp", startDate.toISOString())
      .order("timestamp", { ascending: false })

    // Apply filters
    if (environment && environment !== "all") {
      query = query.eq("environment", environment)
    }
    if (trigger && trigger !== "all") {
      query = query.eq("trigger", trigger)
    }

    const { data, error } = await query

    if (error) {
      console.error("[API] Supabase error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data to match frontend format
    const runs = (data || []).map((run) => ({
      id: run.id,
      timestamp: run.timestamp,
      environment: run.environment,
      trigger: run.trigger,
      branch: run.branch,
      commit: run.commit,
      total: run.total,
      passed: run.passed,
      failed: run.failed,
      flaky: run.flaky,
      skipped: run.skipped,
      duration: formatDuration(run.duration),
    }))

    return NextResponse.json({ runs })
  } catch (error) {
    console.error("[API] Error fetching test runs:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch test runs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
