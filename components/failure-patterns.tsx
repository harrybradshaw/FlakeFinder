"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertTriangle, TrendingUp, Clock } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface FailurePattern {
  stepTitle: string;
  errorMessage: string;
  occurrences: number;
  affectedTests: Array<{
    testId: string;
    testName: string;
    testFile: string;
    testRunId: string;
    timestamp: string;
    screenshot?: string;
  }>;
  failureRate: number;
  avgDuration: number;
  latestScreenshot?: string;
}

interface FailurePatternsProps {
  timeRange: string;
  environment?: string;
  trigger?: string;
  suite?: string;
  project?: string;
  testId?: string; // Optional: filter patterns for a specific test
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch failure patterns");
  return response.json();
};

export function FailurePatterns({
  timeRange,
  environment,
  trigger,
  suite,
  project,
  testId,
}: FailurePatternsProps) {
  const [minOccurrences] = useState(testId ? 1 : 2); // Lower threshold for single test

  // Build API URL
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams({
      timeRange,
      minOccurrences: minOccurrences.toString(),
      limit: "20",
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
    if (testId) {
      params.append("testId", testId);
    }

    return `/api/test-runs/failure-patterns?${params.toString()}`;
  }, [timeRange, environment, trigger, suite, project, testId, minOccurrences]);

  // Fetch data
  const { data, isLoading, error } = useSWR<{
    patterns: FailurePattern[];
    summary: {
      totalPatterns: number;
      timeRange: string;
      analyzedRuns: number;
      analyzedTests: number;
    };
  }>(apiUrl, fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Analyzing failure patterns...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-destructive">Failed to load failure patterns</p>
        </div>
      </Card>
    );
  }

  if (!data || data.patterns.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">
            No common failure patterns detected
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Common Failure Patterns
          </h3>
          <Badge variant="outline" className="text-xs">
            {data.summary.totalPatterns} patterns found
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Analyzed {data.summary.analyzedTests} tests across{" "}
          {data.summary.analyzedRuns} runs
        </p>
      </div>

      <Accordion type="multiple" className="w-full">
        {data.patterns.map((pattern, idx) => (
          <AccordionItem
            key={idx}
            value={`pattern-${idx}`}
            className="border-border"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-start gap-3 flex-1 text-left pr-4">
                <div className="flex-shrink-0 mt-1">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30">
                    <span className="text-sm font-bold text-red-600 dark:text-red-400">
                      {pattern.occurrences}
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-1 flex items-center gap-2">
                    <span className="truncate">{pattern.stepTitle}</span>
                    {pattern.failureRate > 50 && (
                      <Badge
                        variant="destructive"
                        className="text-xs flex-shrink-0"
                      >
                        <TrendingUp className="h-3 w-3 mr-1" />
                        High Impact
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border break-words whitespace-pre-wrap overflow-hidden">
                    {pattern.errorMessage}
                  </div>
                </div>
                {pattern.latestScreenshot && (
                  <div className="flex-shrink-0 w-32 h-24 rounded border border-border overflow-hidden bg-muted">
                    <Image
                      src={pattern.latestScreenshot}
                      alt="Latest failure screenshot"
                      width={128}
                      height={96}
                      unoptimized={true}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pl-11 pt-2 space-y-4">
                {/* Screenshot - full width if available */}
                {pattern.latestScreenshot && (
                  <div className="rounded-lg border border-border overflow-hidden bg-muted/50">
                    <Image
                      src={pattern.latestScreenshot}
                      alt="Failure screenshot"
                      width={1200}
                      height={800}
                      unoptimized={true}
                      className="w-full h-auto object-contain"
                    />
                  </div>
                )}

                {/* Affected Tests */}
                <div>
                  <p className="text-sm font-semibold mb-2">
                    Affected Tests ({pattern.affectedTests.length}
                    {pattern.affectedTests.length >= 10 ? "+" : ""}):
                  </p>
                  <div className="space-y-2">
                    {pattern.affectedTests.map((test, testIdx) => (
                      <Link
                        key={testIdx}
                        href={`/runs/${test.testRunId}?testId=${test.testId}`}
                        className="block p-3 bg-background rounded-md border border-border hover:border-primary transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {test.testName}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {test.testFile}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                            <Clock className="h-3 w-3" />
                            {new Date(test.timestamp).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Card>
  );
}
