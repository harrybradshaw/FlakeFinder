"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { TimelineView } from "@/components/timeline-view";
import { TestCaseDetails } from "@/components/test-case-details";

interface TestAttempt {
  attemptIndex: number;
  status: string;
  duration: number;
  error?: string;
  errorStack?: string;
  screenshots?: string[];
  attachments?: Array<{ name: string; contentType: string; content: string }>;
  startTime?: string;
}

interface TestCase {
  id?: string; // UUID - primary key from tests table (this specific execution instance)
  suite_test_id?: string; // UUID - foreign key to suite_tests table (the canonical test definition)
  name: string;
  file: string;
  status: "passed" | "failed" | "flaky" | "skipped";
  duration: string;
  browser?: string;
  metadata?: {
    browser?: string;
    tags?: string[];
    annotations?: any[];
    epic?: string;
    labels?: Array<{ name: string; value: string }>;
    parameters?: Array<{ name: string; value: string }>;
    description?: string;
    descriptionHtml?: string;
  };
  // Unified attempts structure
  attempts: TestAttempt[];
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

// Generate a consistent color for a given string
function getColorForEpic(epic: string): string {
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < epic.length; i++) {
    hash = epic.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Define a palette of distinct, visually appealing colors
  const colors = [
    "bg-purple-500 hover:bg-purple-600",
    "bg-blue-500 hover:bg-blue-600",
    "bg-green-500 hover:bg-green-600",
    "bg-yellow-500 hover:bg-yellow-600",
    "bg-pink-500 hover:bg-pink-600",
    "bg-indigo-500 hover:bg-indigo-600",
    "bg-red-500 hover:bg-red-600",
    "bg-teal-500 hover:bg-teal-600",
    "bg-orange-500 hover:bg-orange-600",
    "bg-cyan-500 hover:bg-cyan-600",
  ];

  // Use hash to select a color consistently
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

export function TestDetailsView({ testRun }: TestDetailsViewProps) {
  const searchParams = useSearchParams();
  const testIdFromUrl = searchParams.get("testId");

  const passRate = ((testRun.passed / testRun.total) * 100).toFixed(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("status");
  const [activeTab, setActiveTab] = useState<string>("tests");
  const [expandedTestId, setExpandedTestId] = useState<string | null>(
    testIdFromUrl,
  );

  // Update expanded test when URL param changes
  useEffect(() => {
    if (testIdFromUrl) {
      // Scroll to the test after a short delay to ensure accordion is rendered
      setTimeout(() => {
        const element = document.getElementById(`test-${testIdFromUrl}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  }, [testIdFromUrl]);

  // Filter and sort tests
  const [testCases, allTestCases] = useMemo(() => {
    const allTestCases: TestCase[] =
      testRun.tests?.map((test) => {
        // Convert to unified attempts structure
        let attempts: TestAttempt[] = [];

        if (test.attempts) {
          // New format: already has attempts
          attempts = test.attempts;
        } else if (test.retryResults && test.retryResults.length > 0) {
          // Legacy format: convert retryResults to attempts
          attempts = test.retryResults.map((retry) => ({
            attemptIndex: retry.retry_index ?? retry.retryIndex ?? 0,
            status: retry.status,
            duration: retry.duration,
            error: retry.error,
            errorStack: retry.error_stack ?? retry.errorStack,
            screenshots: retry.screenshots || [],
            attachments: retry.attachments || [],
            startTime: retry.started_at || retry.startTime,
          }));
        } else {
          // No retries: create single attempt from test data
          attempts = [
            {
              attemptIndex: 0,
              status: test.status,
              duration: test.duration,
              error: test.error,
              errorStack: undefined,
              screenshots: test.screenshots || [],
              attachments: [], // Will be populated from test.attachments if available
              startTime: test.started_at,
            },
          ];
        }

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
          metadata: test.metadata,
          attempts,
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
          <div className="flex items-start gap-4">
            <Link href="/" prefetch={false}>
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
              {testRun.ci_metadata &&
                (testRun.ci_metadata.commitHref ||
                  testRun.ci_metadata.buildHref) && (
                  <div className="flex items-center gap-3 mt-2">
                    {testRun.ci_metadata.commitHref && (
                      <a
                        href={testRun.ci_metadata.commitHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                      >
                        <GitCommit className="h-3 w-3" />
                        View Commit
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {testRun.ci_metadata.buildHref && (
                      <a
                        href={testRun.ci_metadata.buildHref}
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

            {/* Environment Data - Right Side */}
            {testRun.environment_data && (
              <div className="p-3 bg-muted/50 rounded-md border border-border min-w-[500px]">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                  Environment Information
                </h3>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
                  {testRun.environment_data.tramVersion && (
                    <div>
                      <span className="text-muted-foreground">Tram:</span>{" "}
                      <span className="font-mono text-foreground">
                        {testRun.environment_data.tramVersion}
                      </span>
                    </div>
                  )}
                  {testRun.environment_data.tramInfraVersion && (
                    <div>
                      <span className="text-muted-foreground">Tram Infra:</span>{" "}
                      <span className="font-mono text-foreground">
                        {testRun.environment_data.tramInfraVersion}
                      </span>
                    </div>
                  )}
                  {testRun.environment_data.paymentsVersion && (
                    <div>
                      <span className="text-muted-foreground">Payments:</span>{" "}
                      <span className="font-mono text-foreground">
                        {testRun.environment_data.paymentsVersion}
                      </span>
                    </div>
                  )}
                  {testRun.environment_data.authVersion && (
                    <div>
                      <span className="text-muted-foreground">Auth:</span>{" "}
                      <span className="font-mono text-foreground">
                        {testRun.environment_data.authVersion}
                      </span>
                    </div>
                  )}
                  {testRun.environment_data.nodeVersion && (
                    <div>
                      <span className="text-muted-foreground">Node:</span>{" "}
                      <span className="font-mono text-foreground">
                        {testRun.environment_data.nodeVersion}
                      </span>
                    </div>
                  )}
                  {testRun.environment_data.playwrightVersion && (
                    <div>
                      <span className="text-muted-foreground">Playwright:</span>{" "}
                      <span className="font-mono text-foreground">
                        {testRun.environment_data.playwrightVersion}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
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
                          {testCase.metadata?.epic && (
                            <Badge
                              variant="default"
                              className={`text-xs ${getColorForEpic(testCase.metadata.epic)}`}
                            >
                              {testCase.metadata.epic}
                            </Badge>
                          )}
                          {testCase.metadata?.browser && (
                            <Badge variant="secondary" className="text-xs">
                              {testCase.metadata.browser}
                            </Badge>
                          )}
                          {testCase.attempts.length > 1 && (
                            <span className="flex items-center gap-1 text-yellow-500">
                              <Badge
                                variant="outline"
                                className="text-xs border-yellow-500/50 text-yellow-500"
                              >
                                {testCase.attempts.length} attempts
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
                      <TestCaseDetails testCase={testCase} />
                      <div className="pl-7 pt-2 pb-4">
                        <div className="flex items-center justify-between text-sm">
                          <div className="space-y-1">
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground min-w-[80px]">
                                File:
                              </span>
                              <span className="font-mono text-xs">
                                {testCase.file}
                              </span>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground min-w-[80px]">
                                Duration:
                              </span>
                              <span>{testCase.duration}</span>
                            </div>
                            {testCase.browser && (
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground min-w-[80px]">
                                  Browser:
                                </span>
                                <span>{testCase.browser}</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <Link href={`/tests/${testCase.suite_test_id}`}>
                              <Button size="sm">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Test Health
                              </Button>
                            </Link>
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
                // Flatten tests to include each attempt as a separate entry
                const flatTests: any[] = [];
                allTestCases.forEach((test) => {
                  test.attempts.forEach((attempt, idx) => {
                    if (attempt.startTime && attempt.duration) {
                      flatTests.push({
                        id: `${test.id}-attempt-${idx}`,
                        name: `${test.name} ${attempt.attemptIndex > 0 ? `(Attempt ${attempt.attemptIndex + 1})` : ""}`,
                        file: test.file,
                        status: attempt.status,
                        started_at: attempt.startTime,
                        durationMs: attempt.duration,
                        worker_index: test.worker_index,
                        originalTestId: test.id,
                      });
                    }
                  });
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
