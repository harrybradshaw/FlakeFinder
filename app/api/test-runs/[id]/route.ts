import { type NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log("[API] Supabase not configured")
      return NextResponse.json({ error: "Database not configured" }, { status: 500 })
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

    // Fetch test run with joined environment and trigger
    const { data: testRun, error: runError } = await supabase
      .from("test_runs")
      .select(`
        *,
        environment:environments(name, display_name, color),
        trigger:test_triggers(name, display_name, icon)
      `)
      .eq("id", id)
      .single()

    if (runError) {
      console.error("[API] Error fetching test run:", runError)
      if (runError.code === "PGRST116") {
        return NextResponse.json({ error: "Test run not found" }, { status: 404 })
      }
      return NextResponse.json({ error: runError.message }, { status: 500 })
    }

    // Fetch associated tests
    const { data: tests, error: testsError } = await supabase
      .from("tests")
      .select("*")
      .eq("test_run_id", id)
      .order("created_at", { ascending: true })

    if (testsError) {
      console.error("[API] Error fetching tests:", testsError)
      return NextResponse.json({ error: testsError.message }, { status: 500 })
    }

    // Fetch retry results for all tests
    const testIds = tests.map((t) => t.id)
    console.log(`[API] Fetching retry results for ${testIds.length} tests`)
    
    const { data: retryResults, error: retryError } = await supabase
      .from("test_results")
      .select("*")
      .in("test_id", testIds)
      .order("retry_index", { ascending: true })

    if (retryError) {
      console.error("[API] Error fetching retry results:", retryError)
      console.error("[API] This might mean the test_results table doesn't exist yet. Run the updated schema.sql")
      // Don't fail the request, just log the error
    } else {
      console.log(`[API] Found ${retryResults?.length || 0} retry results`)
    }

    // Group retry results by test_id
    const retryResultsByTestId = new Map()
    if (retryResults && retryResults.length > 0) {
      for (const result of retryResults) {
        if (!retryResultsByTestId.has(result.test_id)) {
          retryResultsByTestId.set(result.test_id, [])
        }
        retryResultsByTestId.get(result.test_id).push(result)
        
        // Debug: log if attachments exist
        if (result.attachments && result.attachments.length > 0) {
          console.log(`[API] Retry result has ${result.attachments.length} attachments:`, 
            result.attachments.map((a: any) => a.name))
        }
      }
      console.log(`[API] Grouped retry results for ${retryResultsByTestId.size} tests`)
    }

    // Transform data to match frontend format
    const response = {
      id: testRun.id,
      timestamp: testRun.timestamp,
      environment: (testRun as any).environment?.name || 'unknown',
      environment_display: (testRun as any).environment?.display_name || 'Unknown',
      environment_color: (testRun as any).environment?.color || '#3b82f6',
      trigger: (testRun as any).trigger?.name || 'unknown',
      trigger_display: (testRun as any).trigger?.display_name || 'Unknown',
      trigger_icon: (testRun as any).trigger?.icon || '▶️',
      branch: testRun.branch,
      commit: testRun.commit,
      total: testRun.total,
      passed: testRun.passed,
      failed: testRun.failed,
      flaky: testRun.flaky,
      skipped: testRun.skipped,
      duration: formatDuration(testRun.duration),
      ci_metadata: testRun.ci_metadata || {},
      tests: tests.map((test) => ({
        id: test.id,
        name: test.name,
        status: test.status,
        duration: test.duration,
        file: test.file,
        error: test.error,
        screenshots: test.screenshots || [],
        retryResults: retryResultsByTestId.get(test.id) || [],
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[API] Error fetching test run:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch test run",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
