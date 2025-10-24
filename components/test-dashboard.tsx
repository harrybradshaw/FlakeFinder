"use client";

import { useMemo } from "react";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
import { useQueryState, parseAsString, parseAsInteger } from "nuqs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { TestRunsList } from "@/components/test-runs-list";
import { TrendsChart } from "@/components/trends-chart";
import { TestStats } from "@/components/test-stats";
import type { TestRun } from "@/lib/mock-data";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  const data = await response.json();
  return { runs: data.runs || [], total: data.total || 0 };
};

const configFetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
};

export function TestDashboard() {
  const [selectedEnvironment, setSelectedEnvironment] = useQueryState(
    "environment",
    parseAsString.withDefault("all"),
  );
  const [selectedTrigger, setSelectedTrigger] = useQueryState(
    "trigger",
    parseAsString.withDefault("all"),
  );
  const [selectedSuite, setSelectedSuite] = useQueryState(
    "suite",
    parseAsString.withDefault("all"),
  );
  const [selectedTimeRange, setSelectedTimeRange] = useQueryState(
    "timeRange",
    parseAsString.withDefault("7d"),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  // Fetch environments, triggers, and suites dynamically (immutable - these rarely change)
  const { data: environmentsData } = useSWRImmutable(
    "/api/environments",
    configFetcher,
  );
  const { data: triggersData } = useSWRImmutable(
    "/api/triggers",
    configFetcher,
  );
  const { data: suitesData } = useSWRImmutable("/api/suites", configFetcher);

  const environments = environmentsData?.environments || [];
  const triggers = triggersData?.triggers || [];
  const suites = suitesData?.suites || [];

  // Build API URL with query parameters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({
      timeRange: selectedTimeRange,
      limit: "20",
      offset: String((page - 1) * 20),
    });

    if (selectedEnvironment !== "all") {
      params.append("environment", selectedEnvironment);
    }
    if (selectedTrigger !== "all") {
      params.append("trigger", selectedTrigger);
    }
    if (selectedSuite !== "all") {
      params.append("suite", selectedSuite);
    }

    return `/api/test-runs?${params.toString()}`;
  }, [
    selectedEnvironment,
    selectedTrigger,
    selectedSuite,
    selectedTimeRange,
    page,
  ]);

  // Build stats API URL (same filters but no pagination)
  const statsUrl = useMemo(() => {
    const params = new URLSearchParams({
      timeRange: selectedTimeRange,
    });

    if (selectedEnvironment !== "all") {
      params.append("environment", selectedEnvironment);
    }
    if (selectedTrigger !== "all") {
      params.append("trigger", selectedTrigger);
    }
    if (selectedSuite !== "all") {
      params.append("suite", selectedSuite);
    }

    return `/api/test-runs/stats?${params.toString()}`;
  }, [selectedEnvironment, selectedTrigger, selectedSuite, selectedTimeRange]);

  // Fetch data with SWR
  const { data, error, isLoading } = useSWR<{ runs: TestRun[]; total: number }>(
    apiUrl,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );

  // Fetch stats separately (all filtered runs, not just current page)
  const { data: statsData } = useSWR<{
    totalTests: number;
    passed: number;
    failed: number;
    flaky: number;
  }>(statsUrl, configFetcher, {
    revalidateOnFocus: false,
  });

  const testRuns = data?.runs || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / 20);

  const stats = statsData || {
    totalTests: 0,
    passed: 0,
    failed: 0,
    flaky: 0,
  };

  // Check if user has no data at all (not a member of any org or no projects)
  const hasNoAccessibleProjects =
    !isLoading &&
    !error &&
    testRuns.length === 0 &&
    totalCount === 0 &&
    selectedEnvironment === "all" &&
    selectedTrigger === "all" &&
    selectedSuite === "all" &&
    selectedTimeRange === "7d";

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <Select
            value={selectedEnvironment}
            onValueChange={(value) => {
              setSelectedEnvironment(value);
              setPage(1);
            }}
          >
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
              <SelectSeparator />
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    // TODO: Open add environment dialog
                    alert("Add Environment - Coming soon!");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Environment
                </Button>
              </div>
            </SelectContent>
          </Select>

          <Select
            value={selectedTrigger}
            onValueChange={(value) => {
              setSelectedTrigger(value);
              setPage(1);
            }}
          >
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
              <SelectSeparator />
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    // TODO: Open add trigger dialog
                    alert("Add Trigger - Coming soon!");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Trigger
                </Button>
              </div>
            </SelectContent>
          </Select>

          <Select
            value={selectedSuite}
            onValueChange={(value) => {
              setSelectedSuite(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Suite" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suites</SelectItem>
              {suites.map((suite: any) => (
                <SelectItem key={suite.id} value={suite.name}>
                  {suite.name}
                </SelectItem>
              ))}
              <SelectSeparator />
              <div className="p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    // TODO: Open add suite dialog
                    alert("Add Suite - Coming soon!");
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Suite
                </Button>
              </div>
            </SelectContent>
          </Select>

          <Select
            value={selectedTimeRange}
            onValueChange={(value) => {
              setSelectedTimeRange(value);
              setPage(1);
            }}
          >
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
            ) : testRuns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div className="text-center max-w-md">
                  {hasNoAccessibleProjects ? (
                    <>
                      <h3 className="text-lg font-semibold mb-2">
                        Welcome to FlakeFinder!
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        You don&apos;t have access to any projects yet. Either
                        join an organization with existing projects, or upload
                        your first test results to get started.
                      </p>
                      <Button
                        onClick={() => {
                          // Navigate to upload - you can adjust this path as needed
                          window.location.href = "/";
                        }}
                      >
                        Upload Test Results
                      </Button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold mb-2">
                        No test runs found
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        No test runs match your current filters. Try adjusting
                        your filters or upload new test results.
                      </p>
                      <Button
                        onClick={() => {
                          setSelectedEnvironment("all");
                          setSelectedTrigger("all");
                          setSelectedSuite("all");
                          setSelectedTimeRange("7d");
                          setPage(1);
                        }}
                        variant="outline"
                      >
                        Clear Filters
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                <TestRunsList runs={testRuns} />
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Showing {(page - 1) * 20 + 1} to{" "}
                      {Math.min(page * 20, totalCount)} of {totalCount} runs
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <div className="text-sm text-muted-foreground">
                        Page {page} of {totalPages}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="trends" className="mt-6">
            <TrendsChart
              timeRange={selectedTimeRange}
              environment={selectedEnvironment}
              trigger={selectedTrigger}
              suite={selectedSuite}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
