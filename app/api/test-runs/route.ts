import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const environment = searchParams.get("environment")
    const trigger = searchParams.get("trigger")
    const timeRange = searchParams.get("timeRange") || "7d"
    const contentHash = searchParams.get("contentHash")

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

    // Look up environment/trigger IDs if filters are provided
    let environmentId = null
    let triggerId = null

    if (environment && environment !== "all") {
      const { data: envData } = await supabase
        .from("environments")
        .select("id")
        .eq("name", environment)
        .eq("active", true)
        .single()
      
      if (envData) environmentId = envData.id
    }

    if (trigger && trigger !== "all") {
      const { data: trigData } = await supabase
        .from("test_triggers")
        .select("id")
        .eq("name", trigger)
        .eq("active", true)
        .single()
      
      if (trigData) triggerId = trigData.id
    }

    // Fetch test runs from database with filters (join with environments and triggers)
    let query = supabase
      .from("test_runs")
      .select(`
        *,
        environment:environments(name, display_name, color),
        trigger:test_triggers(name, display_name, icon)
      `)
      .order("timestamp", { ascending: false })

    // Apply filters by ID
    if (environmentId) {
      query = query.eq("environment_id", environmentId)
    }
    if (triggerId) {
      query = query.eq("trigger_id", triggerId)
    }
    
    // If contentHash is provided, search for that specific hash (for duplicate detection)
    if (contentHash) {
      query = query.eq("content_hash", contentHash).limit(1)
    } else {
      // Only apply time range filter if not searching by hash
      query = query.gte("timestamp", startDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      console.error("[API] Supabase error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data to match frontend format
    const runs = (data || []).map((run: any) => ({
      id: run.id,
      timestamp: run.timestamp,
      environment: run.environment?.name || 'unknown',
      environment_display: run.environment?.display_name || 'Unknown',
      environment_color: run.environment?.color || '#3b82f6',
      trigger: run.trigger?.name || 'unknown',
      trigger_display: run.trigger?.display_name || 'Unknown',
      trigger_icon: run.trigger?.icon || '▶️',
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
