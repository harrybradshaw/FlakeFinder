"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TestRunsList } from "@/components/test-runs-list"
import { TrendsChart } from "@/components/trends-chart"
import { TestStats } from "@/components/test-stats"
import { UploadDialog } from "@/components/upload-dialog"
import type { TestRun } from "@/lib/mock-data"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`)
  }
  const data = await response.json()
  return data.runs || []
}

export function TestDashboard() {
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all")
  const [selectedTrigger, setSelectedTrigger] = useState<string>("all")
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("7d")

  // Build API URL with query parameters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({
      timeRange: selectedTimeRange,
    })

    if (selectedEnvironment !== "all") {
      params.append("environment", selectedEnvironment)
    }
    if (selectedTrigger !== "all") {
      params.append("trigger", selectedTrigger)
    }

    return `/api/test-runs?${params.toString()}`
  }, [selectedEnvironment, selectedTrigger, selectedTimeRange])

  // Fetch data with SWR
  const { data: testRuns, error, isLoading } = useSWR<TestRun[]>(apiUrl, fetcher, {
    refreshInterval: 30000, // Auto-refresh every 30 seconds
    revalidateOnFocus: true,
  })

  const stats = {
    totalTests: testRuns?.reduce((acc, run) => acc + run.total, 0) || 0,
    passed: testRuns?.reduce((acc, run) => acc + run.passed, 0) || 0,
    failed: testRuns?.reduce((acc, run) => acc + run.failed, 0) || 0,
    flaky: testRuns?.reduce((acc, run) => acc + run.flaky, 0) || 0,
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Playwright Test Reports</h1>
              <p className="text-sm text-muted-foreground">Monitor your test results and trends</p>
            </div>
            <UploadDialog />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center gap-4">
          <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Environments</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="development">Development</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedTrigger} onValueChange={setSelectedTrigger}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Triggers</SelectItem>
              <SelectItem value="ci">CI</SelectItem>
              <SelectItem value="pull_request">Pull Request</SelectItem>
              <SelectItem value="merge_queue">Merge Queue</SelectItem>
              <SelectItem value="post_deploy">Post Deploy</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TestStats stats={stats} />

        <Tabs defaultValue="runs" className="mt-6">
          <TabsList>
            <TabsTrigger value="runs">Test Runs</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading test runs...</p>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-destructive">Error: {error.message}</p>
              </div>
            ) : (
              <TestRunsList runs={testRuns || []} />
            )}
          </TabsContent>

          <TabsContent value="trends" className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">Loading trends...</p>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-destructive">Error: {error.message}</p>
              </div>
            ) : (
              <TrendsChart runs={testRuns || []} timeRange={selectedTimeRange} />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
