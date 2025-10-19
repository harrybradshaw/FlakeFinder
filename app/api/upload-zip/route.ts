import { type NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"

interface PlaywrightTest {
  testId: string
  title: string
  projectName: string
  location: {
    file: string
    line: number
    column: number
  }
  outcome: "expected" | "unexpected" | "flaky"
  duration: number
  annotations: Array<{ type: string; description?: string }>
  results: Array<{
    workerIndex: number
    status: "passed" | "failed" | "timedOut" | "skipped"
    duration: number
    error?: {
      message: string
      stack?: string
    }
    attachments: Array<{
      name: string
      contentType: string
      path?: string
    }>
    retry: number
    startTime: string
  }>
}

interface PlaywrightReport {
  config: {
    rootDir: string
    configFile?: string
  }
  suites: Array<{
    title: string
    file: string
    line: number
    column: number
    specs: PlaywrightTest[]
    suites?: Array<any>
  }>
  stats: {
    startTime: string
    duration: number
    expected: number
    unexpected: number
    flaky: number
    skipped: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const project = formData.get("project") as string
    const environment = formData.get("environment") as string
    const trigger = formData.get("trigger") as string
    const branch = formData.get("branch") as string
    const commit = formData.get("commit") as string

    if (!file || !environment || !trigger || !branch) {
      return NextResponse.json(
          { error: "Missing required fields: file, environment, trigger, branch" },
          { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)

    console.log("[v0] ZIP contents:", Object.keys(zip.files))

    // Extract metadata from data/*.dat files in the outer zip
    const metadataMap = new Map<string, any>()
    for (const fileName of Object.keys(zip.files)) {
      if (fileName.match(/data\/.*\.dat$/)) {
        const datContent = await zip.file(fileName)?.async("string")
        if (datContent) {
          try {
            const datData = JSON.parse(datContent)
            if (datData.type === "metadata" && datData.data) {
              // Extract hash from filename (e.g., "data/abc123.dat" -> "abc123")
              const hash = fileName.split('/').pop()?.replace('.dat', '') || ''
              metadataMap.set(hash, datData.data)
            }
          } catch (e) {
            console.log(`[v0] Error parsing metadata file ${fileName}:`, e)
          }
        }
      }
    }
    
    console.log(`[v0] Found ${metadataMap.size} metadata files`)

    const tests: Array<{
      id: string
      name: string
      status: "passed" | "failed" | "flaky" | "skipped" | "timedOut"
      duration: number
      file: string
      worker_index?: number
      started_at?: string
      error?: string
      screenshots: string[]
      retryResults?: Array<{
        retryIndex: number
        status: string
        duration: number
        error?: string
        errorStack?: string
        screenshots: string[]
        attachments?: Array<{name: string, contentType: string, content: string}>
        startTime?: string
      }>
    }> = []
    
    let ciMetadata: any = {}
    let testExecutionTime: string | null = null

    // Check if this is an HTML report format
    const htmlFile = zip.file("index.html")
    if (htmlFile) {
      console.log("[v0] Found HTML report, extracting embedded data")
      const htmlContent = await htmlFile.async("string")
      
      // Extract base64-encoded zip from HTML
      const match = htmlContent.match(/window\.playwrightReportBase64 = "([^"]+)"/)
      if (match) {
        const dataUri = match[1]
        const base64Data = dataUri.replace("data:application/zip;base64,", "")
        const embeddedBuffer = Buffer.from(base64Data, "base64")
        const embeddedZip = await JSZip.loadAsync(new Uint8Array(embeddedBuffer))
        
        console.log("[v0] Embedded ZIP files:", Object.keys(embeddedZip.files).length)
        
        // Extract CI metadata and test execution time from report.json
        const reportFile = embeddedZip.file("report.json")
        if (reportFile) {
          const reportContent = await reportFile.async("string")
          const reportData = JSON.parse(reportContent)
          if (reportData.metadata?.ci) {
            ciMetadata = reportData.metadata.ci
            console.log("[v0] Found CI metadata:", ciMetadata)
          }
          // Get the test execution start time
          if (reportData.startTime) {
            // startTime might be a number (ms since epoch) or ISO string
            if (typeof reportData.startTime === 'number') {
              testExecutionTime = new Date(reportData.startTime).toISOString()
            } else {
              testExecutionTime = reportData.startTime
            }
            console.log("[v0] Test execution time:", testExecutionTime)
          }
        }
        
        // Extract metadata from .dat files
        const metadataMap = new Map<string, any>()
        for (const fileName of Object.keys(embeddedZip.files)) {
          if (fileName.endsWith(".dat")) {
            const datContent = await embeddedZip.file(fileName)?.async("string")
            if (datContent) {
              try {
                const datData = JSON.parse(datContent)
                if (datData.type === "metadata" && datData.data) {
                  // Use file hash as key (remove .dat extension)
                  const fileHash = fileName.replace('.dat', '')
                  metadataMap.set(fileHash, datData.data)
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
        
        console.log(`[v0] Found ${metadataMap.size} metadata files`)
        
        // Extract tests from individual test files
        for (const fileName of Object.keys(embeddedZip.files)) {
          if (fileName.endsWith(".json")) {
            const fileContent = await embeddedZip.file(fileName)?.async("string")
            if (fileContent) {
              const testFile = JSON.parse(fileContent)
              
              // Process tests from this file
              if (testFile.tests && Array.isArray(testFile.tests)) {
                for (const test of testFile.tests) {
                  // Collect all retry attempts
                  const retryResults = test.results?.map((result: any, index: number) => {
                    const screenshots: string[] = []
                    const attachments: Array<{name: string, contentType: string, content: string}> = []
                    
                    // Extract all attachments
                    if (result.attachments) {
                      for (const attachment of result.attachments) {
                        if (attachment.contentType?.startsWith("image/") && attachment.path) {
                          // Image with path - add to screenshots
                          screenshots.push(attachment.path)
                        } else if (attachment.body && !attachment.contentType?.startsWith("image/")) {
                          // Text/data attachment with inline body
                          attachments.push({
                            name: attachment.name || 'Attachment',
                            contentType: attachment.contentType || 'text/plain',
                            content: attachment.body
                          })
                        }
                      }
                    }
                    
                    // Extract error - Playwright uses 'errors' array, not 'error' object
                    let errorMessage = null
                    let errorStack = null
                    if (result.errors && result.errors.length > 0) {
                      // errors is an array of strings
                      errorMessage = result.errors[0] // First error message
                      errorStack = result.errors.join('\n\n') // All errors combined
                    }
                    
                    const retry = {
                      retryIndex: result.retry || index,
                      status: result.status,
                      duration: result.duration || 0,
                      error: errorMessage,
                      errorStack: errorStack,
                      screenshots,
                      attachments,
                      startTime: result.startTime,
                    }
                    
                    // Debug log for failed attempts
                    if (result.status === "failed" && test.outcome === "flaky") {
                      console.log(`[Upload] Retry ${index} for flaky test "${test.title}":`, {
                        hasError: !!retry.error,
                        hasErrorStack: !!retry.errorStack,
                        errorPreview: retry.error?.substring(0, 100),
                        resultKeys: Object.keys(result),
                        errorObject: result.error,
                      })
                    }
                    
                    return retry
                  }) || []
                  
                  const lastResult = test.results?.[test.results.length - 1]
                  if (lastResult) {
                    console.log(`[v0] Test "${test.title}" - workerIndex:`, lastResult.workerIndex, "startTime:", lastResult.startTime)
                    const screenshots: string[] = []
                    
                    // Extract screenshot paths from final attempt
                    if (lastResult.attachments) {
                      for (const attachment of lastResult.attachments) {
                        if (attachment.contentType?.startsWith("image/") && attachment.path) {
                          screenshots.push(attachment.path)
                        }
                      }
                    }
                    
                    // Extract error from final result
                    let finalError = null
                    if (lastResult.errors && lastResult.errors.length > 0) {
                      finalError = lastResult.errors[0]
                    }
                    
                    tests.push({
                      id: test.testId,
                      name: test.title,
                      status: lastResult.status === "skipped" ? "skipped" : test.outcome === "expected" ? lastResult.status : test.outcome === "flaky" ? "flaky" : "failed",
                      duration: lastResult.duration || 0,
                      file: test.location?.file || testFile.fileName || "unknown",
                      worker_index: lastResult.workerIndex,
                      started_at: lastResult.startTime,
                      error: finalError,
                      screenshots,
                      retryResults,
                    })
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // Try the old JSON format
      console.log("[v0] No HTML report found, trying JSON format")
      let reportData: PlaywrightReport | null = null
      const reportFile = zip.file(/data\/.*\.json$/)?.[0] || zip.file("report.json")

      if (reportFile) {
        const reportContent = await reportFile.async("string")
        reportData = JSON.parse(reportContent)
        console.log("[v0] Parsed report data:", {
          suites: reportData?.suites?.length,
          stats: reportData?.stats,
        })
      }

      if (reportData && reportData.suites) {
        // Flatten all tests from all suites
        const extractTests = (suites: PlaywrightReport["suites"]): void => {
          for (const suite of suites) {
            for (const spec of suite.specs) {
              const result = spec.results[spec.results.length - 1]
              const screenshots: string[] = []

              // Extract screenshot paths from attachments
              for (const attachment of result.attachments || []) {
                if (attachment.contentType.startsWith("image/") && attachment.path) {
                  screenshots.push(attachment.path)
                }
              }

              tests.push({
                id: spec.testId,
                name: spec.title,
                status: result.status === "skipped" ? "skipped" : spec.outcome === "expected" ? result.status : spec.outcome === "flaky" ? "flaky" : "failed",
                duration: result.duration,
                file: spec.location.file,
                error: result.error?.message,
                screenshots,
              })
            }

            // Recursively process nested suites
            if (suite.suites) {
              extractTests(suite.suites)
            }
          }
        }

        extractTests(reportData.suites)
      }
    }

    console.log("[v0] Extracted tests:", tests.length)

    const screenshotFiles = Object.keys(zip.files).filter(
        (path) => path.startsWith("data/") && (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg")),
    )

    console.log("[v0] Found screenshots:", screenshotFiles.length)

    const screenshotUrls: Record<string, string> = {}
    const shouldWriteBlobs = false;

    // Process each screenshot
    for (const screenshotPath of screenshotFiles) {
      const screenshotFile = zip.file(screenshotPath)
      if (screenshotFile) {
        const screenshotBuffer = await screenshotFile.async("nodebuffer")

        // Check if Vercel Blob is configured
        if (process.env.BLOB_READ_WRITE_TOKEN && shouldWriteBlobs) {
          try {
            // Upload to Vercel Blob
            const { put } = await import("@vercel/blob")
            const blob = await put(screenshotPath, screenshotBuffer, {
              access: "public",
            })
            screenshotUrls[screenshotPath] = blob.url
            console.log("[v0] Uploaded screenshot to Blob:", blob.url)
          } catch (error) {
            console.error("[v0] Failed to upload to Blob:", error)
            // Fall back to base64 encoding
            const base64 = screenshotBuffer.toString("base64")
            screenshotUrls[screenshotPath] = `data:image/png;base64,${base64}`
          }
        } else {
          console.log("[v0] Blob storage not configured, using base64 encoding")
          // Convert to base64 for inline display
          const base64 = screenshotBuffer.toString("base64")
          screenshotUrls[screenshotPath] = `data:image/png;base64,${base64}`
        }
      }
    }

    for (const test of tests) {
      test.screenshots = test.screenshots.map((path) => screenshotUrls[path]).filter(Boolean)
      
      // Also map retry result screenshots
      if (test.retryResults) {
        for (const retry of test.retryResults) {
          retry.screenshots = retry.screenshots.map((path) => screenshotUrls[path]).filter(Boolean)
        }
      }
    }

    const stats = {
      total: tests.filter((t) => t.status !== "skipped").length, // Only count tests that were actually run
      passed: tests.filter((t) => t.status === "passed").length,
      failed: tests.filter((t) => t.status === "failed").length,
      flaky: tests.filter((t) => t.status === "flaky").length,
      skipped: tests.filter((t) => t.status === "skipped").length,
    }

    const totalDuration = tests.reduce((sum, t) => sum + t.duration, 0)
    const durationMinutes = Math.floor(totalDuration / 60000)
    const durationSeconds = Math.floor((totalDuration % 60000) / 1000)

    // Generate content hash for duplicate detection
    // Hash includes: metadata + test names/statuses/files (not timestamps or durations)
    const hashContent = {
      environment,
      trigger,
      branch,
      commit: commit || "unknown",
      tests: tests.map(t => ({
        name: t.name,
        file: t.file,
        status: t.status,
      })).sort((a, b) => `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`))
    }
    const contentHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(hashContent))
    ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))

    const testRun = {
      id: crypto.randomUUID(),
      timestamp: testExecutionTime || new Date().toISOString(), // Use test execution time if available
      environment,
      trigger,
      branch,
      commit: commit || "unknown",
      ...stats,
      duration: `${durationMinutes}m ${durationSeconds}s`,
      contentHash,
      tests,
    }

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        const { createClient } = await import("@supabase/supabase-js")
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

        // Verify user authentication (Clerk middleware ensures this, but double-check)
        const { auth } = await import("@clerk/nextjs/server")
        const { userId } = await auth()
        
        if (!userId) {
          return NextResponse.json(
            { error: "User not authenticated" },
            { status: 401 }
          )
        }

        // Look up project ID (default to 'default' project if not specified)
        const projectName = project || 'default'
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select("id")
          .eq("name", projectName)
          .eq("active", true)
          .single()

        if (projectError || !projectData) {
          console.error("[v0] Project not found:", projectName, projectError)
          return NextResponse.json(
            { error: `Project '${projectName}' not found. Please add it to the database first.` },
            { status: 400 }
          )
        }

        // Verify user's organization has access to this project
        const { clerkClient } = await import("@clerk/nextjs/server")
        const client = await clerkClient()
        const orgMemberships = await client.users.getOrganizationMembershipList({
          userId: userId,
        })
        
        const userOrgIds = orgMemberships.data.map((membership) => membership.organization.id)
        
        if (userOrgIds.length === 0) {
          return NextResponse.json(
            { error: "User must be a member of an organization to upload test results" },
            { status: 403 }
          )
        }

        // Check if any of user's organizations have access to this project
        const { data: orgProjectAccess } = await supabase
          .from("organization_projects")
          .select("organization_id")
          .eq("project_id", projectData.id)
          .in("organization_id", userOrgIds)
          .limit(1)

        if (!orgProjectAccess || orgProjectAccess.length === 0) {
          console.error("[v0] User's organizations do not have access to project:", projectName)
          return NextResponse.json(
            { error: `You do not have access to upload to project '${projectName}'. Contact your administrator to grant access.` },
            { status: 403 }
          )
        }

        // Look up environment and trigger IDs
        const { data: environmentData, error: envError } = await supabase
          .from("environments")
          .select("id")
          .eq("name", environment)
          .eq("active", true)
          .single()

        if (envError || !environmentData) {
          console.error("[v0] Environment not found:", environment, envError)
          return NextResponse.json(
            { error: `Environment '${environment}' not found. Please add it to the database first.` },
            { status: 400 }
          )
        }

        const { data: triggerData, error: triggerError } = await supabase
          .from("test_triggers")
          .select("id")
          .eq("name", trigger)
          .eq("active", true)
          .single()

        if (triggerError || !triggerData) {
          console.error("[v0] Trigger not found:", trigger, triggerError)
          return NextResponse.json(
            { error: `Trigger '${trigger}' not found. Please add it to the database first.` },
            { status: 400 }
          )
        }

        const projectId = projectData.id
        const environmentId = environmentData.id
        const triggerId = triggerData.id

        // Check for duplicate
        const { data: existingRuns, error: checkError } = await supabase
          .from("test_runs")
          .select("id, timestamp")
          .eq("content_hash", contentHash)
          .order("timestamp", { ascending: false })
          .limit(1)

        if (checkError) {
          console.error("[v0] Error checking for duplicates:", checkError)
        } else if (existingRuns && existingRuns.length > 0) {
          const existing = existingRuns[0]
          const existingTime = new Date(existing.timestamp).toLocaleString()
          console.log("[v0] Duplicate detected! Existing run:", existing.id, "from", existingTime)
          
          return NextResponse.json(
            {
              error: "Duplicate upload detected",
              message: `This exact test run was already uploaded on ${existingTime}. If you want to re-upload, please modify the tests or wait for different results.`,
              existingRunId: existing.id,
              isDuplicate: true,
            },
            { status: 409 }
          )
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
            .single()

        if (runError) {
          console.error("[v0] Failed to insert test run:", runError)
        } else {
          console.log("[v0] Inserted test run:", runData)

          // Insert individual tests
          const testsToInsert = tests.map((test) => {
            const startedAt = test.started_at ? new Date(test.started_at).toISOString() : null
            console.log(`[v0] Inserting test "${test.name}" - started_at:`, startedAt)
            return {
              test_run_id: runData.id,
              name: test.name,
              status: test.status,
              duration: test.duration,
              file: test.file,
              worker_index: test.worker_index,
              started_at: startedAt,
              error: test.error,
              screenshots: test.screenshots,
            }
          })

          const { data: insertedTests, error: testsError } = await supabase
            .from("tests")
            .insert(testsToInsert)
            .select()

          if (testsError) {
            console.error("[v0] Failed to insert tests:", testsError)
          } else {
            console.log("[v0] Inserted tests:", testsToInsert.length)

            // Insert retry results for tests with retries
            const testResultsToInsert = []
            for (let i = 0; i < tests.length; i++) {
              const test = tests[i]
              const insertedTest = insertedTests?.[i]
              
              if (insertedTest && test.retryResults && test.retryResults.length > 0) {
                for (const retry of test.retryResults) {
                  testResultsToInsert.push({
                    test_id: insertedTest.id,
                    retry_index: retry.retryIndex,
                    status: retry.status,
                    duration: retry.duration,
                    error: retry.error,
                    error_stack: retry.errorStack,
                    screenshots: retry.screenshots,
                    attachments: retry.attachments || [],
                    started_at: retry.startTime,
                  })
                }
              }
            }

            if (testResultsToInsert.length > 0) {
              const { error: resultsError } = await supabase
                .from("test_results")
                .insert(testResultsToInsert)

              if (resultsError) {
                console.error("[v0] Failed to insert test results:", resultsError)
              } else {
                console.log("[v0] Inserted test results:", testResultsToInsert.length)
              }
            }
          }
        }
      } catch (error) {
        console.error("[v0] Supabase error:", error)
      }
    } else {
      console.log("[v0] Supabase not configured, skipping database storage")
    }

    return NextResponse.json({
      success: true,
      testRun,
      message: `Processed ${tests.length} tests with ${screenshotFiles.length} screenshots`,
    })
  } catch (error) {
    console.error("[v0] Error processing ZIP file:", error)
    return NextResponse.json(
        {
          error: "Failed to process ZIP file",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
    )
  }
}
