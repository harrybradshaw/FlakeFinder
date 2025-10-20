"use client";

import { useState, useMemo } from "react";
import { use } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { TestCaseDetails } from "@/components/test-case-details";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface TestHistory {
  testRunId: string;
  timestamp: string;
  status: string;
  duration: number;
  environment?: string;
  trigger?: string;
  branch?: string;
}

interface TestDetail {
  name: string;
  file: string;
  history: TestHistory[];
  summary: {
    totalRuns: number;
    passRate: string;
    failRate: string;
    flakyRate: string;
    avgDuration: number;
  };
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  return response.json();
};

// Component to lazy-load specific test details from a run
function TestRunDetails({
  testRunId,
  suiteTestId,
}: {
  testRunId: string;
  suiteTestId: string;
}) {
  const { data, error, isLoading } = useSWR(
    `/api/test-runs/${testRunId}/tests/${suiteTestId}`,
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading test details...
        </span>
      </div>
    );
  }

  if (error || !data?.test) {
    return (
      <div className="py-4 text-center text-sm text-destructive">
        Failed to load test details
      </div>
    );
  }

  const testCase = data.test;

  // Transform to match TestCaseDetails interface
  const testCaseForDetails = {
    id: testCase.id,
    name: testCase.name,
    file: testCase.file,
    status: testCase.status === "timedOut" ? "failed" : testCase.status,
    duration: `${(testCase.duration / 1000).toFixed(2)}s`,
    error: testCase.error,
    screenshots: testCase.screenshots?.map((url: string, idx: number) => ({
      name: `screenshot-${idx + 1}.png`,
      url,
    })),
    retryResults: testCase.retryResults,
  };

  return <TestCaseDetails testCase={testCaseForDetails} />;
}

export default function TestDetailPage({
  params,
}: {
  params: Promise<{ testId: string }>;
}) {
  const resolvedParams = use(params);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [selectedTrigger, setSelectedTrigger] = useState<string>("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("30d");

  // Fetch environments and triggers dynamically
  const { data: environmentsData } = useSWR("/api/environments", fetcher);
  const { data: triggersData } = useSWR("/api/triggers", fetcher);

  const environments = environmentsData?.environments || [];
  const triggers = triggersData?.triggers || [];

  // Build API URL
  const apiUrl = useMemo(() => {
    const searchParams = new URLSearchParams({
      timeRange: selectedTimeRange,
    });

    if (selectedEnvironment !== "all") {
      searchParams.append("environment", selectedEnvironment);
    }
    if (selectedTrigger !== "all") {
      searchParams.append("trigger", selectedTrigger);
    }

    return `/api/tests/${resolvedParams.testId}?${searchParams.toString()}`;
  }, [
    resolvedParams.testId,
    selectedEnvironment,
    selectedTrigger,
    selectedTimeRange,
  ]);

  const { data, error, isLoading } = useSWR<TestDetail>(apiUrl, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  });

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!data?.history || data.history.length === 0) {
      return [];
    }

    // Group by day and calculate daily stats
    const dailyStats = new Map<
      string,
      {
        date: string;
        passed: number;
        failed: number;
        flaky: number;
        skipped: number;
      }
    >();

    data.history.forEach((item) => {
      const date = new Date(item.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      if (!dailyStats.has(date)) {
        dailyStats.set(date, {
          date,
          passed: 0,
          failed: 0,
          flaky: 0,
          skipped: 0,
        });
      }
      const stats = dailyStats.get(date)!;
      switch (item.status) {
        case "passed":
          stats.passed++;
          break;
        case "failed":
          stats.failed++;
          break;
        case "flaky":
          stats.flaky++;
          break;
        case "skipped":
          stats.skipped++;
          break;
      }
    });

    return Array.from(dailyStats.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/tests" prefetch={false}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold text-foreground truncate">
                {data?.name || "Loading..."}
              </h1>
              <p className="text-sm text-muted-foreground truncate">
                {data?.file}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
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

          <Select
            value={selectedTimeRange}
            onValueChange={setSelectedTimeRange}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading test history...</p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-destructive">Error: {error.message}</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data?.summary.passRate}%
                    </p>
                    <p className="text-sm text-muted-foreground">Pass Rate</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <XCircle className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data?.summary.failRate}%
                    </p>
                    <p className="text-sm text-muted-foreground">Fail Rate</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data?.summary.flakyRate}%
                    </p>
                    <p className="text-sm text-muted-foreground">Flaky Rate</p>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      {data?.summary.avgDuration
                        ? (data.summary.avgDuration / 1000).toFixed(1)
                        : 0}
                      s
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Avg Duration
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Chart */}
            {chartData && chartData.length > 0 && (
              <Card className="p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4">
                  Test Results Over Time
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="passed"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ fill: "#22c55e" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="failed"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ fill: "#ef4444" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="flaky"
                      stroke="#eab308"
                      strokeWidth={2}
                      dot={{ fill: "#eab308" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Recent History */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">
                Recent Runs ({data?.history.length || 0})
              </h2>
              <Accordion type="single" collapsible className="w-full">
                {data?.history
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((item, idx) => (
                    <AccordionItem
                      key={idx}
                      value={`run-${idx}`}
                      className="border-border"
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            {item.status === "passed" && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                            {item.status === "failed" && (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            {item.status === "flaky" && (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            )}
                            {item.status === "skipped" && (
                              <Clock className="h-4 w-4 text-gray-500" />
                            )}

                            <div className="text-left">
                              <p className="text-sm font-medium">
                                {new Date(item.timestamp).toLocaleString()}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {item.environment && (
                                  <Badge variant="outline" className="text-xs">
                                    {item.environment}
                                  </Badge>
                                )}
                                {item.trigger && (
                                  <Badge variant="outline" className="text-xs">
                                    {item.trigger}
                                  </Badge>
                                )}
                                {item.branch && <span>{item.branch}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="text-sm text-muted-foreground">
                            {(item.duration / 1000).toFixed(2)}s
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <TestRunDetails
                          testRunId={item.testRunId}
                          suiteTestId={resolvedParams.testId}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
