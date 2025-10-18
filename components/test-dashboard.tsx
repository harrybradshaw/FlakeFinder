"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TestRunsList } from "@/components/test-runs-list"
import { TrendsChart } from "@/components/trends-chart"
import { TestStats } from "@/components/test-stats"
import { UploadDialog } from "@/components/upload-dialog"
import { mockTestRuns } from "@/lib/mock-data"

export function TestDashboard() {
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all")
  const [selectedTrigger, setSelectedTrigger] = useState<string>("all")
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("7d")

  const filteredRuns = mockTestRuns.filter((run) => {
    const envMatch = selectedEnvironment === "all" || run.environment === selectedEnvironment
    const triggerMatch = selectedTrigger === "all" || run.trigger === selectedTrigger
    return envMatch && triggerMatch
  })

  const stats = {
    totalTests: filteredRuns.reduce((acc, run) => acc + run.total, 0),
    passed: filteredRuns.reduce((acc, run) => acc + run.passed, 0),
    failed: filteredRuns.reduce((acc, run) => acc + run.failed, 0),
    flaky: filteredRuns.reduce((acc, run) => acc + run.flaky, 0),
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
            <TestRunsList runs={filteredRuns} />
          </TabsContent>

          <TabsContent value="trends" className="mt-6">
            <TrendsChart runs={filteredRuns} timeRange={selectedTimeRange} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
