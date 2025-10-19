"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  GitCommit,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import type { TestRun } from "@/lib/mock-data";
import Image from "next/image";
import { TimelineView } from "@/components/timeline-view";
import stripAnsi from "strip-ansi";

interface TestCase {
  id?: string; // UUID - primary key from tests table (this specific execution instance)
  suite_test_id?: string; // UUID - foreign key to suite_tests table (the canonical test definition)
  name: string;
  file: string;
  status: "passed" | "failed" | "flaky" | "skipped";
  duration: string;
  browser?: string;
  error?: string;
  retries?: number;
  screenshots?: Array<{ name: string; url: string }>;
  retryResults?: Array<{
    retryIndex: number;
    status: string;
    duration: number;
    error?: string;
    errorStack?: string;
    screenshots?: string[];
    attachments?: Array<{ name: string; contentType: string; content: string }>;
    startTime?: string;
  }>;
  // Raw data for timeline
  worker_index?: number | null;
  started_at?: string | null;
  durationMs?: number;
}

interface TestDetailsViewProps {
  testRun: TestRun;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

export function TestDetailsView({ testRun }: TestDetailsViewProps) {
  const passRate = ((testRun.passed / testRun.total) * 100).toFixed(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("status");
  const [activeTab, setActiveTab] = useState<string>("tests");
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  // Filter and sort tests
  const [testCases, allTestCases] = useMemo(() => {
    const allTestCases: TestCase[] =
      testRun.tests?.map((test) => {
        const retries =
          test.retryResults?.map((retry) => ({
            retryIndex: retry.retry_index ?? retry.retryIndex ?? 0,
            status: retry.status,
            duration: retry.duration,
            error: retry.error,
            errorStack: retry.error_stack ?? retry.errorStack,
            screenshots: retry.screenshots || [],
            attachments: retry.attachments || [],
            startTime: retry.started_at || retry.startTime,
          })) || [];

        return {
          id: test.id,
          suite_test_id: test.suite_test_id,
          name: test.name,
          file: test.file,
          status:
            test.status === "timedOut"
              ? "failed"
              : (test.status as "passed" | "failed" | "flaky" | "skipped"),
          duration: formatDuration(test.duration),
          error: test.error,
          screenshots: test.screenshots?.map((url, idx) => ({
            name: `screenshot-${idx + 1}.png`,
            url,
          })),
          retryResults: retries,
          // Raw data for timeline
          worker_index: test.worker_index,
          started_at: test.started_at,
          durationMs: test.duration, // Keep original number for timeline
        };
      }) ?? [];
    let filtered = allTestCases;

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((test) => test.status === statusFilter);
    }

    return [
      [...filtered].sort((a, b) => {
        switch (sortBy) {
          case "name":
            return a.name.localeCompare(b.name);
          case "duration":
            return parseFloat(b.duration) - parseFloat(a.duration);
          case "status": {
            const statusOrder = { failed: 0, flaky: 1, skipped: 2, passed: 3 };
            return statusOrder[a.status] - statusOrder[b.status];
          }
          default:
            return 0;
        }
      }),
      allTestCases,
    ];
  }, [statusFilter, sortBy, testRun]);

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
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-semibold text-foreground">
                  {testRun.branch}
                </h1>
                {testRun.project_display &&
                  testRun.project_display !== "Default Project" && (
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: testRun.project_color || "#3b82f6",
                        color: testRun.project_color || "#3b82f6",
                      }}
                    >
                      {testRun.project_display}
                    </Badge>
                  )}
                <Badge variant="outline">
                  {testRun.environment_display || testRun.environment}
                </Badge>
                {testRun.trigger_display && (
                  <Badge variant="secondary">
                    {testRun.trigger_icon && (
                      <span className="mr-1">{testRun.trigger_icon}</span>
                    )}
                    {testRun.trigger_display}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{testRun.timestamp}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {testRun.duration}
                </span>
                <span className="flex items-center gap-1">
                  <GitCommit className="h-3 w-3" />
                  <span className="text-xs font-mono">
                    {testRun.commit.slice(0, 7)}
                  </span>
                </span>
              </div>

              {/* CI Metadata Links */}
              {(testRun as any).ci_metadata &&
                ((testRun as any).ci_metadata.commitHref ||
                  (testRun as any).ci_metadata.buildHref) && (
                  <div className="flex items-center gap-3 mt-2">
                    {(testRun as any).ci_metadata.commitHref && (
                      <a
                        href={(testRun as any).ci_metadata.commitHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                      >
                        <GitCommit className="h-3 w-3" />
                        View Commit
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {(testRun as any).ci_metadata.buildHref && (
                      <a
                        href={(testRun as any).ci_metadata.buildHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                      >
                        GitHub Actions Run
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold mt-1">{testRun.total}</p>
              </div>
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Passed</p>
                <p className="text-2xl font-semibold mt-1 text-green-500">
                  {testRun.passed}
                </p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-semibold mt-1 text-red-500">
                  {testRun.failed}
                </p>
              </div>
              <XCircle className="h-6 w-6 text-red-500" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pass Rate</p>
                <p className="text-2xl font-semibold mt-1">{passRate}%</p>
              </div>
              <div className="text-sm text-muted-foreground">
                {testRun.flaky > 0 && (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <AlertTriangle className="h-4 w-4" />
                    {testRun.flaky} flaky
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="tests">Test Cases</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="tests">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">
                  Test Cases ({testCases.length})
                </h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={statusFilter}
                      onValueChange={setStatusFilter}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tests</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="flaky">Flaky</SelectItem>
                        <SelectItem value="passed">Passed</SelectItem>
                        <SelectItem value="skipped">Skipped</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="status">Status</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="duration">Duration</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <Accordion
                type="single"
                collapsible
                className="w-full"
                value={expandedTestId || undefined}
                onValueChange={setExpandedTestId}
              >
                {testCases.map((testCase, index) => (
                  <AccordionItem
                    key={testCase.id || index}
                    value={testCase.id || `test-${index}`}
                    id={`test-${testCase.id || index}`}
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 flex-1 text-left">
                        {testCase.status === "passed" && (
                          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                        )}
                        {testCase.status === "failed" && (
                          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                        )}
                        {testCase.status === "flaky" && (
                          <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                        )}
                        {testCase.status === "skipped" && (
                          <Clock className="h-4 w-4 text-gray-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {testCase.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {testCase.file}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {testCase.retryResults &&
                            testCase.retryResults.length > 1 && (
                              <span className="flex items-center gap-1 text-yellow-500">
                                <Badge
                                  variant="outline"
                                  className="text-xs border-yellow-500/50 text-yellow-500"
                                >
                                  {testCase.retryResults.length} attempts
                                </Badge>
                              </span>
                            )}
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {testCase.duration}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="pl-7 pt-2 space-y-3">
                        {testCase.status === "failed" &&
                          testCase.error &&
                          !testCase.retryResults && (
                            <div className="rounded-lg bg-muted p-4 border border-border">
                              <p className="text-sm font-semibold text-destructive mb-3">
                                Error
                              </p>
                              <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans overflow-x-auto">
                                {stripAnsi(testCase.error || "")}
                              </pre>
                            </div>
                          )}

                        {(testCase.status === "flaky" ||
                          testCase.status === "failed") &&
                          testCase.retryResults &&
                          testCase.retryResults.length > 0 && (
                            <div className="space-y-3">
                              <div
                                className={`rounded-lg p-4 border ${
                                  testCase.status === "flaky"
                                    ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800"
                                    : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                                }`}
                              >
                                <p
                                  className={`text-sm font-semibold mb-2 ${
                                    testCase.status === "flaky"
                                      ? "text-yellow-800 dark:text-yellow-200"
                                      : "text-red-800 dark:text-red-200"
                                  }`}
                                >
                                  {testCase.status === "flaky"
                                    ? "Flaky Test"
                                    : "Failed Test with Retries"}
                                </p>
                                <p
                                  className={`text-sm mb-4 ${
                                    testCase.status === "flaky"
                                      ? "text-yellow-700 dark:text-yellow-300"
                                      : "text-red-700 dark:text-red-300"
                                  }`}
                                >
                                  This test had {testCase.retryResults.length}{" "}
                                  {testCase.retryResults.length === 1
                                    ? "attempt"
                                    : "attempts"}
                                </p>

                                <div className="space-y-3">
                                  {testCase.retryResults.map(
                                    (retry, retryIdx) => (
                                      <div
                                        key={retryIdx}
                                        className={`rounded-md bg-background/50 p-3 border ${
                                          testCase.status === "flaky"
                                            ? "border-yellow-500/20"
                                            : "border-red-500/20"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between mb-2">
                                          <div className="flex items-center gap-2">
                                            <Badge
                                              variant={
                                                retry.status === "passed"
                                                  ? "default"
                                                  : "destructive"
                                              }
                                              className="text-xs"
                                            >
                                              Attempt {retry.retryIndex + 1}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                              {retry.status === "passed"
                                                ? "✓ Passed"
                                                : "✗ Failed"}
                                            </span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">
                                            {formatDuration(retry.duration)}
                                          </span>
                                        </div>

                                        {/* Attachments Section */}
                                        {retry.attachments &&
                                          retry.attachments.length > 0 && (
                                            <div className="mt-3">
                                              <p className="text-xs font-semibold text-foreground mb-2">
                                                Test Context (
                                                {retry.attachments.length}):
                                              </p>
                                              <Accordion
                                                type="multiple"
                                                className="w-full"
                                              >
                                                {retry.attachments.map(
                                                  (att, idx) => (
                                                    <AccordionItem
                                                      key={idx}
                                                      value={`attachment-${idx}`}
                                                      className="border-border"
                                                    >
                                                      <AccordionTrigger className="text-sm py-2 hover:no-underline">
                                                        <span className="font-medium">
                                                          {att.name}
                                                        </span>
                                                      </AccordionTrigger>
                                                      <AccordionContent>
                                                        <div className="rounded-md bg-muted p-3 border border-border">
                                                          <pre className="text-sm text-foreground leading-normal whitespace-pre-wrap font-sans overflow-x-auto max-h-96">
                                                            {att.content}
                                                          </pre>
                                                        </div>
                                                      </AccordionContent>
                                                    </AccordionItem>
                                                  ),
                                                )}
                                              </Accordion>
                                            </div>
                                          )}

                                        {((retry.error || retry.errorStack) &&
                                          retry.status !== "passed") ||
                                        (retry.screenshots &&
                                          retry.screenshots.length > 0) ? (
                                          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {/* Error Details - Left Side */}
                                            {(retry.error ||
                                              retry.errorStack) &&
                                              retry.status !== "passed" && (
                                                <div>
                                                  <p className="text-xs font-semibold text-foreground mb-2">
                                                    Error Details:
                                                  </p>
                                                  <div className="rounded-md bg-muted p-3 border border-border">
                                                    {retry.error && (
                                                      <div>
                                                        <p className="text-xs font-semibold text-destructive mb-1.5">
                                                          Error Message:
                                                        </p>
                                                        <pre className="text-sm text-foreground leading-normal whitespace-pre-wrap font-sans overflow-x-auto mb-3">
                                                          {stripAnsi(
                                                            retry.error || "",
                                                          )}
                                                        </pre>
                                                      </div>
                                                    )}
                                                    {retry.errorStack &&
                                                      retry.errorStack !==
                                                        retry.error && (
                                                        <div>
                                                          <p className="text-xs font-semibold text-destructive mb-1.5">
                                                            Full Stack Trace:
                                                          </p>
                                                          <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap font-mono leading-normal bg-background p-2 rounded border border-border">
                                                            {stripAnsi(
                                                              retry.errorStack ||
                                                                "",
                                                            )}
                                                          </pre>
                                                        </div>
                                                      )}
                                                  </div>
                                                </div>
                                              )}

                                            {/* Screenshots - Right Side */}
                                            {retry.screenshots &&
                                              retry.screenshots.length > 0 && (
                                                <div>
                                                  <p className="text-xs font-semibold text-foreground mb-2">
                                                    Screenshots from this
                                                    attempt:
                                                  </p>
                                                  <div className="space-y-2">
                                                    {retry.screenshots.map(
                                                      (url, idx) => (
                                                        <div
                                                          key={idx}
                                                          className="relative aspect-video rounded border border-border overflow-hidden bg-muted"
                                                        >
                                                          <Image
                                                            src={
                                                              url ||
                                                              "/placeholder.svg"
                                                            }
                                                            alt={`Retry ${retry.retryIndex + 1} screenshot ${idx + 1}`}
                                                            fill
                                                            className="object-contain"
                                                          />
                                                        </div>
                                                      ),
                                                    )}
                                                  </div>
                                                </div>
                                              )}
                                          </div>
                                        ) : null}
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                        {testCase.status === "flaky" &&
                          (!testCase.retryResults ||
                            testCase.retryResults.length === 0) && (
                            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950/30 p-4 border border-yellow-200 dark:border-yellow-800">
                              <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                                Flaky Test
                              </p>
                              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                This test passed after {testCase.retries}{" "}
                                {testCase.retries === 1 ? "retry" : "retries"}
                              </p>
                            </div>
                          )}

                        <div className="space-y-2 flex justify-between">
                          <div>
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-muted-foreground min-w-[80px]">
                                File:
                              </span>
                              <span className="font-mono text-xs">
                                {testCase.file}
                              </span>
                            </div>
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-muted-foreground min-w-[80px]">
                                Duration:
                              </span>
                              <span>{testCase.duration}</span>
                            </div>
                            {testCase.browser && (
                              <div className="flex items-start gap-2 text-sm">
                                <span className="text-muted-foreground min-w-[80px]">
                                  Browser:
                                </span>
                                <span>{testCase.browser}</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <a href={`/tests/${testCase.suite_test_id}`}>
                              <Button size="sm">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Test Health
                              </Button>
                            </a>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          </TabsContent>

          <TabsContent value="timeline">
            <TimelineView
              tests={(() => {
                // Flatten tests to include each retry as a separate entry
                const flatTests: any[] = [];
                allTestCases.forEach((test) => {
                  if (test.retryResults && test.retryResults.length > 0) {
                    // For each retry, create a timeline entry
                    test.retryResults.forEach((retry, idx) => {
                      if (retry.startTime && retry.duration) {
                        flatTests.push({
                          id: `${test.id}-retry-${idx}`,
                          name: `${test.name} ${retry.retryIndex > 0 ? `(Retry ${retry.retryIndex})` : "(Attempt 1)"}`,
                          file: test.file,
                          status: retry.status,
                          started_at: retry.startTime,
                          durationMs: retry.duration,
                          worker_index: test.worker_index,
                          originalTestId: test.id,
                        });
                      }
                    });
                  } else if (test.started_at && test.durationMs) {
                    // No retries, use the test's own timing
                    flatTests.push({
                      id: test.id,
                      name: test.name,
                      file: test.file,
                      status: test.status,
                      started_at: test.started_at,
                      durationMs: test.durationMs,
                      worker_index: test.worker_index,
                      originalTestId: test.id,
                    });
                  }
                });
                return flatTests;
              })()}
              onTestSelect={(testId) => {
                // Extract original test ID (remove -retry-N suffix)
                const originalId = testId.includes("-retry-")
                  ? testId.split("-retry-")[0]
                  : testId;
                setActiveTab("tests");
                setExpandedTestId(originalId);
                // Scroll to the test after a short delay to allow tab switch
                setTimeout(() => {
                  const element = document.getElementById(`test-${originalId}`);
                  if (element) {
                    element.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }
                }, 100);
              }}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
