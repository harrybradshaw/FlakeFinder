"use client";

import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import stripAnsi from "strip-ansi";
import Image from "next/image";
import { TestStepsViewer } from "@/components/test-steps-viewer";
import type { TestStep } from "@/types/api";

interface TestAttempt {
  attemptIndex: number;
  testResultId?: string;
  id?: string;
  status: string;
  duration: number;
  error?: string;
  errorStack?: string;
  screenshots?: string[];
  attachments?: Array<{ name: string; contentType: string; content: string }>;
  startTime?: string;
  steps?: TestStep[];
  stepsUrl?: string;
  lastFailedStep?: {
    title: string;
    duration: number;
    error: string;
  };
}

interface TestCaseDetailsProps {
  testCase: {
    id?: string;
    name: string;
    file: string;
    status: "passed" | "failed" | "flaky" | "skipped";
    duration: string;
    attempts: TestAttempt[];
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds}s`;
}
export function TestCaseDetails({ testCase }: TestCaseDetailsProps) {
  const hasMultipleAttempts = testCase.attempts.length > 1;
  const hasAnyContent = testCase.attempts.some(
    (attempt) =>
      (attempt.attachments && attempt.attachments.length > 0) ||
      attempt.error ||
      attempt.errorStack ||
      (attempt.screenshots && attempt.screenshots.length > 0) ||
      (attempt.steps && attempt.steps.length > 0) ||
      attempt.stepsUrl ||
      attempt.testResultId,
  );

  // Don't render anything if there's no content to show
  if (!hasAnyContent) {
    return null;
  }

  return (
    <div className="py-2 pl-7 space-y-4">
      {testCase.attempts.map((attempt, attemptIdx) => {
        const hasAttachments =
          attempt.attachments && attempt.attachments.length > 0;
        const hasError =
          (attempt.error || attempt.errorStack) && attempt.status !== "passed";
        const hasScreenshots =
          attempt.screenshots && attempt.screenshots.length > 0;
        const hasSteps = attempt.steps && attempt.steps.length > 0;
        const hasStepsToLoad = attempt.stepsUrl || attempt.testResultId;

        // Skip attempts with no content
        if (!hasAttachments && !hasError && !hasScreenshots && !hasSteps && !hasStepsToLoad) {
          return null;
        }

        return (
          <div
            key={attemptIdx}
            className={`rounded-lg p-4 border ${
              attempt.status === "passed"
                ? "bg-green-50 border-green-200"
                : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            }`}
          >
            {hasMultipleAttempts && (
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      attempt.status === "passed" ? "default" : "destructive"
                    }
                    className="text-xs"
                  >
                    Attempt {attempt.attemptIndex + 1}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {attempt.status === "passed" ? "✓ Passed" : "✗ Failed"}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(attempt.duration)}
                </span>
              </div>
            )}

            {/* Test Context - Inline Accordion */}
            {hasAttachments && (
              <div className={hasMultipleAttempts ? "" : ""}>
                <p className="text-sm font-semibold text-foreground mb-2">
                  Test Context
                </p>
                <Accordion type="multiple" className="w-full">
                  {attempt.attachments!.map((att, idx) => (
                    <AccordionItem
                      key={idx}
                      value={`attachment-${idx}`}
                      className="border-border"
                    >
                      <AccordionTrigger className="text-sm py-2 hover:no-underline">
                        <span className="font-medium">{att.name}</span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="rounded-md bg-background p-3 border border-border">
                          <pre className="text-xs text-foreground leading-normal whitespace-pre-wrap overflow-x-auto max-h-96 font-mono">
                            {att.content}
                          </pre>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            {/* Execution Steps - Modal Card */}
            {(hasSteps || hasStepsToLoad) && (
              <div className={hasAttachments ? "mt-4" : ""}>
                <TestStepsViewer
                  steps={attempt.steps}
                  stepsUrl={attempt.stepsUrl}
                  testResultId={attempt.testResultId || attempt.id}
                />
              </div>
            )}

            {/* Error and Screenshots Section */}
            {(hasError || hasScreenshots) && (
              <div className={`${hasAttachments || hasSteps || hasStepsToLoad ? "mt-4" : ""} grid grid-cols-1 lg:grid-cols-2 gap-4`}>
                {/* Error Details */}
                {hasError && (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2">
                      Error Details:
                    </p>
                    <div className="rounded-md bg-background p-3 border border-border">
                      {(() => {
                        const errorText = stripAnsi(attempt.error || "");
                        const stackText = stripAnsi(attempt.errorStack || "");
                        
                        // Check if error looks like a stack trace (has "at " lines)
                        const errorIsStack = errorText.includes("\n    at ") || errorText.includes("\n  at ");
                        const hasStack = stackText && stackText !== errorText;
                        
                        // Extract just the first line as the message if error contains stack
                        const errorMessage = errorIsStack 
                          ? errorText.split("\n")[0] 
                          : errorText;
                        
                        return (
                          <>
                            {errorMessage && (
                              <div>
                                <p className="text-xs font-semibold text-destructive mb-1.5">
                                  Error Message:
                                </p>
                                <pre className="text-sm text-foreground leading-normal whitespace-pre-wrap font-sans overflow-x-auto mb-3">
                                  {errorMessage}
                                </pre>
                              </div>
                            )}
                            {(hasStack || errorIsStack) && (
                              <div>
                                <p className="text-xs font-semibold text-destructive mb-1.5">
                                  Full Stack Trace:
                                </p>
                                <pre className="text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap font-mono leading-normal bg-muted p-2 rounded border border-border">
                                  {hasStack ? stackText : errorText}
                                </pre>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Screenshots */}
                {hasScreenshots && (
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-2">
                      Screenshots ({attempt.screenshots!.length}):
                    </p>
                    <div className="space-y-2">
                      {attempt.screenshots!.map((screenshot, idx) => (
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
            )}
          </div>
        );
      })}
    </div>
  );
}
