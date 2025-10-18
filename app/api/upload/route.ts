import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.environment || !body.trigger || !body.branch || !body.results) {
      return NextResponse.json(
        { error: "Missing required fields: environment, trigger, branch, results" },
        { status: 400 },
      )
    }

    // Extract test results from Playwright JSON reporter format
    const { environment, trigger, branch, commit, results } = body

    // Calculate test statistics
    const total =
      results.suites?.reduce((acc: number, suite: any) => {
        return acc + (suite.specs?.length || 0)
      }, 0) || 0

    let passed = 0
    let failed = 0
    let flaky = 0

    results.suites?.forEach((suite: any) => {
      suite.specs?.forEach((spec: any) => {
        const testResults = spec.tests?.[0]?.results || []
        const hasPass = testResults.some((r: any) => r.status === "passed")
        const hasFail = testResults.some((r: any) => r.status === "failed")

        if (hasPass && hasFail) {
          flaky++
        } else if (hasPass) {
          passed++
        } else if (hasFail) {
          failed++
        }
      })
    })

    // Calculate duration
    const duration = results.stats?.duration || 0
    const minutes = Math.floor(duration / 60000)
    const seconds = Math.floor((duration % 60000) / 1000)
    const durationStr = `${minutes}m ${seconds}s`

    // Create test run object
    const testRun = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      environment,
      trigger,
      branch,
      commit: commit || "unknown",
      total,
      passed,
      failed,
      flaky,
      duration: durationStr,
      results, // Store full results for detailed view
    }

    // In a real app, you would save this to a database
    // For now, we'll just return success
    console.log("[v0] Test run uploaded:", testRun)

    return NextResponse.json({
      success: true,
      testRun: {
        id: testRun.id,
        timestamp: testRun.timestamp,
        total,
        passed,
        failed,
        flaky,
      },
    })
  } catch (error) {
    console.error("[v0] Error uploading test results:", error)
    return NextResponse.json({ error: "Failed to process test results" }, { status: 500 })
  }
}
