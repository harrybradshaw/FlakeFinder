"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import useSWRImmutable from "swr/immutable";
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
import { Plus } from "lucide-react";
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
  return data.runs || [];
};

const configFetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
};

export function TestDashboard() {
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [selectedTrigger, setSelectedTrigger] = useState<string>("all");
  const [selectedSuite, setSelectedSuite] = useState<string>("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("7d");

  // Fetch environments, triggers, and suites dynamically
  const { data: environmentsData } = useSWRImmutable(
    "/api/environments",
    configFetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const { data: triggersData } = useSWR("/api/triggers", configFetcher, {
    revalidateOnFocus: false,
  });
  const { data: suitesData } = useSWR("/api/suites", configFetcher, {
    revalidateOnFocus: false,
  });

  const environments = environmentsData?.environments || [];
  const triggers = triggersData?.triggers || [];
  const suites = suitesData?.suites || [];

  // Build API URL with query parameters
  const apiUrl = useMemo(() => {
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

    return `/api/test-runs?${params.toString()}`;
  }, [selectedEnvironment, selectedTrigger, selectedSuite, selectedTimeRange]);

  // Fetch data with SWR
  const {
    data: testRuns,
    error,
    isLoading,
  } = useSWR<TestRun[]>(apiUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const stats = {
    totalTests: testRuns?.reduce((acc, run) => acc + run.total, 0) || 0,
    passed: testRuns?.reduce((acc, run) => acc + run.passed, 0) || 0,
    failed: testRuns?.reduce((acc, run) => acc + run.failed, 0) || 0,
    flaky: testRuns?.reduce((acc, run) => acc + run.flaky, 0) || 0,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <Select
            value={selectedEnvironment}
            onValueChange={setSelectedEnvironment}
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

          <Select value={selectedSuite} onValueChange={setSelectedSuite}>
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
            onValueChange={setSelectedTimeRange}
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
              <TrendsChart
                runs={testRuns || []}
                timeRange={selectedTimeRange}
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
