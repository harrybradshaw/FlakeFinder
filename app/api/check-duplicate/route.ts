import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const environment = formData.get("environment") as string
    const trigger = formData.get("trigger") as string
    const branch = formData.get("branch") as string
    const commit = formData.get("commit") as string

    if (!file || !environment || !trigger || !branch) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Use the EXACT same extraction logic as upload-zip
    const JSZip = (await import("jszip")).default
    const zipBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(zipBuffer)
    
    const tests: any[] = []
    
    // Check for HTML report with embedded ZIP (same as upload endpoint)
    const htmlFile = zip.file("index.html")
    if (htmlFile) {
      const htmlContent = await htmlFile.async("string")
      const match = htmlContent.match(/window\.playwrightReportBase64 = "([^"]+)"/)
      
      if (match) {
        const base64Data = match[1].replace("data:application/zip;base64,", "")
        const binaryString = Buffer.from(base64Data, "base64").toString("binary")
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        const embeddedZip = await JSZip.loadAsync(bytes)
        
        // Extract tests from individual test files (EXACT same logic as upload)
        for (const fileName of Object.keys(embeddedZip.files)) {
          if (fileName.endsWith(".json")) {
            const fileContent = await embeddedZip.file(fileName)?.async("string")
            if (fileContent) {
              const testFile = JSON.parse(fileContent)
              
              if (testFile.tests && Array.isArray(testFile.tests)) {
                for (const test of testFile.tests) {
                  const lastResult = test.results?.[test.results.length - 1]
                  if (lastResult) {
                    tests.push({
                      name: test.title,
                      file: test.location?.file || testFile.fileName || "unknown",
                      status: test.outcome === "expected" ? lastResult.status : test.outcome === "flaky" ? "flaky" : "failed",
                    })
                  }
                }
              }
            }
          }
        }
      }
    }

    // Calculate hash (EXACT same as upload endpoint)
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

    console.log("[Duplicate Check] Calculated hash:", contentHash)

    // Check if this hash already exists
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      const { createClient } = await import("@supabase/supabase-js")
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

      const { data: existingRuns, error } = await supabase
        .from("test_runs")
        .select("id, timestamp")
        .eq("content_hash", contentHash)
        .order("timestamp", { ascending: false })
        .limit(1)

      if (error) {
        console.error("[Duplicate Check] Database error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      if (existingRuns && existingRuns.length > 0) {
        console.log("[Duplicate Check] Duplicate found:", existingRuns[0])
        return NextResponse.json({
          isDuplicate: true,
          existingRun: {
            id: existingRuns[0].id,
            timestamp: existingRuns[0].timestamp,
          }
        })
      }
    }

    return NextResponse.json({ isDuplicate: false })
  } catch (error) {
    console.error("[Duplicate Check] Error:", error)
    return NextResponse.json(
      { error: "Failed to check for duplicate", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
