"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface TrendsChartProps {
  timeRange: string;
  environment?: string;
  trigger?: string;
  suite?: string;
  project?: string;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch trends");
  return response.json();
};

export function TrendsChart({
  timeRange,
  environment,
  trigger,
  suite,
  project,
}: TrendsChartProps) {
  const [viewMode, setViewMode] = useState<"daily" | "individual">("daily");

  // Build API URL for trends
  const trendsUrl = useMemo(() => {
    const params = new URLSearchParams({
      timeRange,
      groupBy: viewMode,
    });

    if (environment && environment !== "all") {
      params.append("environment", environment);
    }
    if (trigger && trigger !== "all") {
      params.append("trigger", trigger);
    }
    if (suite && suite !== "all") {
      params.append("suite", suite);
    }
    if (project && project !== "all") {
      params.append("project", project);
    }

    return `/api/test-runs/trends?${params.toString()}`;
  }, [timeRange, environment, trigger, suite, project, viewMode]);

  // Fetch trends data
  const { data, isLoading } = useSWR<{
    trends: Array<{
      date: string;
      timestamp: string;
      passed: number;
      failed: number;
      flaky: number;
      total: number;
      runsCount?: number;
      avgDuration?: number;
    }>;
  }>(trendsUrl, fetcher, {
    revalidateOnFocus: false,
  });

  const chartData = useMemo(() => {
    if (!data?.trends) return [];

    return data.trends.map((item) => {
      // Parse the date - could be YYYY-MM-DD or a full ISO timestamp
      let displayDate: string;
      let fullTimestamp: string;
      try {
        const dateStr = item.date || item.timestamp;
        // If it's already YYYY-MM-DD format, append time for proper parsing
        const isoDate = dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00Z`;
        const dateObj = new Date(isoDate);
        
        if (isNaN(dateObj.getTime())) {
          displayDate = "Invalid Date";
          fullTimestamp = dateStr;
        } else {
          // For daily view, show just date
          displayDate = dateObj.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          });
          // Store full timestamp for individual runs tooltip
          fullTimestamp = dateObj.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          });
        }
      } catch {
        displayDate = "Invalid Date";
        fullTimestamp = item.date || item.timestamp;
      }

      return {
        date: displayDate,
        fullTimestamp, // Full date+time for individual runs
        dateKey: item.date, // Keep the original date for uniqueness
        // These will be used by the chart (and normalized by stackOffset="expand")
        passed: item.passed,
        failed: item.failed,
        flaky: item.flaky,
        // Store original counts with different keys so they don't get normalized
        passedCount: item.passed,
        failedCount: item.failed,
        flakyCount: item.flaky,
        total: item.total,
        runsCount: item.runsCount,
        avgDuration: item.avgDuration || 0,
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading trends...</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Test Status Distribution Over Time
          </h3>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "daily" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("daily")}
            >
              Daily Average
            </Button>
            <Button
              variant={viewMode === "individual" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("individual")}
            >
              Individual Runs
            </Button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} stackOffset="expand">
            <defs>
              <linearGradient id="passedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="flakyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#eab308" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#eab308" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.95)",
                border: "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: "8px",
                padding: "12px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
              }}
              labelStyle={{
                color: "#000",
                fontWeight: 600,
                marginBottom: "8px",
              }}
              itemStyle={{
                color: "#000",
                padding: "4px 0",
              }}
              formatter={(value: number, name: string, props) => {
                // Despite stackOffset="expand", value is NOT normalized by Recharts
                // It's the raw count, so we need to calculate percentage ourselves
                const payload = props.payload as any;
                const total = payload.total || 1;
                const percentage = ((value / total) * 100).toFixed(1);
                return [`${percentage}% (${value} tests)`, name];
              }}
              labelFormatter={(label: string, payload) => {
                if (payload && payload[0]) {
                  const data = payload[0].payload as {
                    runsCount?: number;
                    date: string;
                    fullTimestamp?: string;
                  };
                  
                  if (viewMode === "daily") {
                    return `${label}${data.runsCount ? ` (${data.runsCount} runs)` : ""}`;
                  } else {
                    // For individual runs, show the full timestamp
                    return data.fullTimestamp || label;
                  }
                }
                return label;
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="passed"
              stackId="1"
              stroke="#22c55e"
              fill="url(#passedGradient)"
              name="Passed"
            />
            <Area
              type="monotone"
              dataKey="flaky"
              stackId="1"
              stroke="#eab308"
              fill="url(#flakyGradient)"
              name="Flaky"
            />
            <Area
              type="monotone"
              dataKey="failed"
              stackId="1"
              stroke="#ef4444"
              fill="url(#failedGradient)"
              name="Failed"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Duration Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="durationGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="#3b82f6"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="#3b82f6"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              label={{ value: 'min', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value: number) => [`${value} min`, 'Avg Duration']}
            />
            <Area
              type="monotone"
              dataKey="avgDuration"
              stroke="#3b82f6"
              fill="url(#durationGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Total Tests Executed</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(var(--chart-2))"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(var(--chart-2))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="hsl(var(--chart-2))"
              fill="url(#totalGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
