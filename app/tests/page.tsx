"use client"

import { useState, useMemo } from "react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, AlertTriangle, TrendingUp, TrendingDown, Minus, Search, ArrowLeft } from "lucide-react"
import Link from "next/link"

interface TestMetric {
  name: string
  file: string
  totalRuns: number
  passRate: string
  failRate: string
  flakyRate: string
  avgDuration: number
  recentStatuses: string[]
  health: number
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`)
  }
  const data = await response.json()
  return data.tests || []
}

const configFetcher = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to fetch")
  return response.json()
}

export default function TestsPage() {
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all")
  const [selectedTrigger, setSelectedTrigger] = useState<string>("all")
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("30d")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [sortBy, setSortBy] = useState<string>("health")
  
  // Fetch environments and triggers dynamically
  const { data: environmentsData } = useSWR("/api/environments", configFetcher)
  const { data: triggersData } = useSWR("/api/triggers", configFetcher)
  
  const environments = environmentsData?.environments || []
  const triggers = triggersData?.triggers || []

  // Build API URL
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

    return `/api/tests?${params.toString()}`
  }, [selectedEnvironment, selectedTrigger, selectedTimeRange])

  const { data: tests, error, isLoading } = useSWR<TestMetric[]>(apiUrl, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
  })

  // Filter and sort tests
  const filteredTests = useMemo(() => {
    let filtered = tests || []

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (test) => test.name.toLowerCase().includes(query) || test.file.toLowerCase().includes(query)
      )
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "health":
          return a.health - b.health // Worst health first
        case "flaky":
          return parseFloat(b.flakyRate) - parseFloat(a.flakyRate)
        case "failed":
          return parseFloat(b.failRate) - parseFloat(a.failRate)
        case "name":
          return a.name.localeCompare(b.name)
        case "runs":
          return b.totalRuns - a.totalRuns
        default:
          return 0
      }
    })

    return sorted
  }, [tests, searchQuery, sortBy])

  const getHealthBadge = (health: number) => {
    if (health >= 90) return <Badge className="bg-green-500">Healthy</Badge>
    if (health >= 70) return <Badge className="bg-yellow-500">Unstable</Badge>
    return <Badge className="bg-red-500">Unhealthy</Badge>
  }

  const getTrendIcon = (statuses: string[]) => {
    if (statuses.length < 3) return <Minus className="h-4 w-4 text-muted-foreground" />

    const recent = statuses.slice(-3)
    const passCount = recent.filter((s) => s === "passed").length

    if (passCount === 3) return <TrendingUp className="h-4 w-4 text-green-500" />
    if (passCount === 0) return <TrendingDown className="h-4 w-4 text-red-500" />
    return <Minus className="h-4 w-4 text-yellow-500" />
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Test Health Dashboard</h1>
              <p className="text-sm text-muted-foreground">Monitor test reliability and flakiness across runs</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedEnvironment} onValueChange={setSelectedEnvironment}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Environments</SelectItem>
              {environments.map((env: any) => (
                <SelectItem key={env.id} value={env.name}>
                  {env.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedTrigger} onValueChange={setSelectedTrigger}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Trigger" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Triggers</SelectItem>
              {triggers.map((trig: any) => (
                <SelectItem key={trig.id} value={trig.name}>
                  {trig.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="health">Health (Worst First)</SelectItem>
              <SelectItem value="flaky">Most Flaky</SelectItem>
              <SelectItem value="failed">Most Failed</SelectItem>
              <SelectItem value="runs">Most Runs</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading tests...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-destructive">Error: {error.message}</p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              Showing {filteredTests.length} test{filteredTests.length !== 1 ? "s" : ""}
            </div>

            <div className="space-y-2">
              {filteredTests.map((test, idx) => {
                // Create URL-safe test identifier
                const testId = Buffer.from(`${test.name}::${test.file}`).toString("base64")
                
                return (
                  <Link key={idx} href={`/tests/${testId}`}>
                    <Card className="p-4 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground truncate">{test.name}</h3>
                        {getHealthBadge(test.health)}
                        {getTrendIcon(test.recentStatuses)}
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">{test.file}</p>

                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span>{test.passRate}% Pass</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span>{test.failRate}% Fail</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          <span>{test.flakyRate}% Flaky</span>
                        </div>
                        <div className="text-muted-foreground">
                          {test.totalRuns} run{test.totalRuns !== 1 ? "s" : ""}
                        </div>
                        <div className="text-muted-foreground">
                          Avg: {(test.avgDuration / 1000).toFixed(1)}s
                        </div>
                      </div>

                      {/* Recent status indicators */}
                      <div className="mt-3 flex items-center gap-1">
                        <span className="text-xs text-muted-foreground mr-2">Recent:</span>
                        {test.recentStatuses.slice(-10).map((status, i) => (
                          <div
                            key={i}
                            className={`h-2 w-2 rounded-full ${
                              status === "passed"
                                ? "bg-green-500"
                                : status === "failed"
                                  ? "bg-red-500"
                                  : status === "flaky"
                                    ? "bg-yellow-500"
                                    : "bg-gray-500"
                            }`}
                            title={status}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                    </Card>
                  </Link>
                )
              })}

              {filteredTests.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  No tests found matching your filters
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
