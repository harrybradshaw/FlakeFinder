import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import stripAnsi from "strip-ansi";
import Image from "next/image";

interface RetryResult {
  retryIndex: number;
  status: string;
  duration: number;
  error?: string;
  errorStack?: string;
  screenshots?: string[];
  attachments?: Array<{ name: string; contentType: string; content: string }>;
  startTime?: string;
}

interface TestCaseDetailsProps {
  testCase: {
    id?: string;
    name: string;
    file: string;
    status: "passed" | "failed" | "flaky" | "skipped";
    duration: string;
    error?: string;
    screenshots?: Array<{ name: string; url: string }>;
    retryResults?: RetryResult[];
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}

export function TestCaseDetails({ testCase }: TestCaseDetailsProps) {
  return (
    <div className="pl-7 pt-2 space-y-3">
      {testCase.status === "failed" &&
        testCase.error &&
        !testCase.retryResults && (
          <div className="rounded-lg bg-muted p-4 border border-border">
            <p className="text-sm font-semibold text-destructive mb-3">Error</p>
            <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans overflow-x-auto">
              {stripAnsi(testCase.error || "")}
            </pre>
          </div>
        )}

      {(testCase.status === "flaky" || testCase.status === "failed") &&
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
                {testCase.retryResults.length === 1 ? "attempt" : "attempts"}
              </p>

              <div className="space-y-3">
                {testCase.retryResults.map((retry, retryIdx) => (
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
                          {retry.status === "passed" ? "✓ Passed" : "✗ Failed"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(retry.duration)}
                      </span>
                    </div>

                    {/* Attachments Section */}
                    {retry.attachments && retry.attachments.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold text-foreground mb-2">
                          Test Context ({retry.attachments.length}):
                        </p>
                        <Accordion type="multiple" className="w-full">
                          {retry.attachments.map((att, idx) => (
                            <AccordionItem
                              key={idx}
                              value={`attachment-${idx}`}
                              className="border-border"
                            >
                              <AccordionTrigger className="text-sm py-2 hover:no-underline">
                                <span className="font-medium">{att.name}</span>
                              </AccordionTrigger>
                              <AccordionContent>
                                <div className="rounded-md bg-muted p-3 border border-border">
                                  <pre className="text-sm text-foreground leading-normal whitespace-pre-wrap font-sans overflow-x-auto max-h-96">
                                    {att.content}
                                  </pre>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    )}

                    {((retry.error || retry.errorStack) &&
                      retry.status !== "passed") ||
                    (retry.screenshots && retry.screenshots.length > 0) ? (
                      <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Error Details - Left Side */}
                        {(retry.error || retry.errorStack) &&
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
                                      {stripAnsi(retry.error || "")}
                                    </pre>
                                  </div>
                                )}
                                {retry.errorStack &&
                                  retry.errorStack !== retry.error && (
                                    <div>
                                      <p className="text-xs font-semibold text-destructive mb-1.5">
                                        Full Stack Trace:
                                      </p>
                                      <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap font-mono leading-normal bg-background p-2 rounded border border-border">
                                        {stripAnsi(retry.errorStack || "")}
                                      </pre>
                                    </div>
                                  )}
                              </div>
                            </div>
                          )}

                        {/* Screenshots - Right Side */}
                        {retry.screenshots && retry.screenshots.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-foreground mb-2">
                              Screenshots ({retry.screenshots.length}):
                            </p>
                            <div className="space-y-2">
                              {retry.screenshots.map((screenshot, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-md border border-border overflow-hidden bg-background"
                                >
                                  <Image
                                    src={screenshot}
                                    alt={`Screenshot ${idx + 1}`}
                                    width={800}
                                    height={600}
                                    unoptimized={true}
                                    className="w-full h-auto"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
