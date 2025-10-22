"use client";

import { useState } from "react";
import {
  ChevronRight,
  XCircle,
  CheckCircle,
  PlayCircle,
  Loader2,
  AlertCircle,
  X,
  Maximize2,
} from "lucide-react";
import type { TestStep } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import stripAnsi from "strip-ansi";

interface TestStepsViewerProps {
  steps?: TestStep[]; // Inline steps (already loaded)
  stepsUrl?: string; // URL to lazy load steps from storage
  testResultId?: string;
}

export function TestStepsViewer({
  steps: initialSteps,
  stepsUrl,
  testResultId,
}: TestStepsViewerProps) {
  const [steps, setSteps] = useState<TestStep[] | undefined>(initialSteps);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [stepsNotFound, setStepsNotFound] = useState(false);

  // Lazy load steps when modal opens
  const loadSteps = async () => {
    if (steps || isLoading) return; // Already loaded or loading

    setIsLoading(true);
    setError(null);

    try {
      const url = testResultId
        ? `/api/test-results/${testResultId}/steps`
        : stepsUrl;

      if (!url) {
        throw new Error("No steps URL or test result ID provided");
      }

      const response = await fetch(url);

      // If 404, treat as no steps available
      if (response.status === 404) {
        setSteps([]);
        setStepsNotFound(true);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to load steps: ${response.statusText}`);
      }

      const data = await response.json();
      const loadedSteps = data.steps || [];
      setSteps(loadedSteps);
      if (loadedSteps.length === 0) {
        setStepsNotFound(true);
      }
    } catch (err) {
      console.error("Error loading test steps:", err);
      setError(err instanceof Error ? err.message : "Failed to load steps");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle card click
  const handleCardClick = () => {
    setIsModalOpen(true);
    if (!steps && (stepsUrl || testResultId)) {
      loadSteps();
    }
  };

  // Calculate summary stats
  const getStepsSummary = () => {
    if (!steps) return null;
    const totalSteps = countSteps(steps);
    const failedSteps = countFailedSteps(steps);
    return { totalSteps, failedSteps };
  };

  const summary = getStepsSummary();

  // Disable the card if:
  // 1. Inline steps provided but empty
  // 2. We've tried loading and confirmed steps don't exist
  // 3. testResultId exists but no stepsUrl (means steps don't exist in storage)
  // 4. No way to load steps at all
  const isDisabled =
    (initialSteps !== undefined && initialSteps.length === 0) ||
    stepsNotFound ||
    (testResultId && !stepsUrl && !initialSteps) ||
    (!initialSteps && !stepsUrl && !testResultId);

  // If steps are inline (already loaded), show them in compact card
  return (
    <>
      {/* Summary Card */}
      <button
        onClick={isDisabled ? undefined : handleCardClick}
        disabled={isDisabled}
        className={`w-full p-4 rounded-lg border border-border text-left group transition-colors ${
          !isDisabled
            ? "bg-card hover:bg-accent/50 cursor-pointer"
            : "bg-muted/30 cursor-not-allowed opacity-60"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PlayCircle
              className={`h-5 w-5 ${
                !isDisabled
                  ? "text-muted-foreground"
                  : "text-muted-foreground/50"
              }`}
            />
            <div>
              <p
                className={`text-sm font-medium ${
                  !isDisabled ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                Execution Steps
              </p>
              {summary && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {summary.totalSteps} step{summary.totalSteps !== 1 ? "s" : ""}
                  {summary.failedSteps > 0 && (
                    <span className="text-destructive ml-1">
                      · {summary.failedSteps} failed
                    </span>
                  )}
                </p>
              )}
              {!summary && !steps && !isDisabled && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click to view
                </p>
              )}
              {isDisabled && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Not available
                </p>
              )}
            </div>
          </div>
          {!isDisabled && (
            <Maximize2 className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </button>

      {/* Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                Execution Steps
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded hover:bg-accent transition-colors"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading execution steps...
                  </span>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Failed to load execution steps
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setSteps(undefined);
                      loadSteps();
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {!isLoading && !error && steps && steps.length > 0 && (
                <div className="space-y-0.5">
                  {steps.map((step, idx) => (
                    <TestStepItem key={idx} step={step} depth={0} />
                  ))}
                </div>
              )}

              {!isLoading && !error && steps && steps.length === 0 && (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  No steps recorded for this test execution
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Helper functions to count steps
function countSteps(steps: TestStep[]): number {
  let count = 0;
  for (const step of steps) {
    count++;
    if (step.steps && step.steps.length > 0) {
      count += countSteps(step.steps);
    }
  }
  return count;
}

function countFailedSteps(steps: TestStep[]): number {
  let count = 0;
  for (const step of steps) {
    if (step.error) count++;
    if (step.steps && step.steps.length > 0) {
      count += countFailedSteps(step.steps);
    }
  }
  return count;
}

interface TestStepItemProps {
  step: TestStep;
  depth: number;
}

function TestStepItem({ step, depth }: TestStepItemProps) {
  const [expanded, setExpanded] = useState(depth === 0); // Auto-expand root level
  const hasNestedSteps = step.steps && step.steps.length > 0;

  // Determine step icon and color based on category and error state
  const getStepIcon = () => {
    if (step.error) {
      return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
    }

    // If step passed (no error), show green check
    switch (step.category) {
      case "hook":
        return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
      case "expect":
        return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
      case "pw:api":
        return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
      case "test.step":
        return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
      default:
        return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
    }
  };

  const getCategoryBadge = () => {
    if (!step.category) return null;

    const colorMap: Record<string, string> = {
      hook: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      expect:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      "pw:api":
        "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      "test.step":
        "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    };

    return (
      <Badge
        variant="secondary"
        className={`text-xs px-1.5 py-0 ${colorMap[step.category] || ""}`}
      >
        {step.category}
      </Badge>
    );
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="group">
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded transition-colors ${
          hasNestedSteps ? "cursor-pointer hover:bg-muted/50" : ""
        }`}
        style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
        onClick={() => hasNestedSteps && setExpanded(!expanded)}
      >
        {/* Expand/collapse chevron */}
        {hasNestedSteps ? (
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ${
              expanded ? "rotate-90" : ""
            }`}
          />
        ) : (
          <div className="w-4" />
        )}

        {/* Step icon */}
        {getStepIcon()}

        {/* Step title */}
        <span
          className={`font-mono text-sm flex-1 ${step.error ? "text-red-700 dark:text-red-300" : ""}`}
        >
          {step.title}
        </span>

        {/* Category badge */}
        {getCategoryBadge()}

        {/* Duration */}
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 ml-auto">
          {formatDuration(step.duration)}
        </span>
      </div>

      {/* Error details */}
      {step.error && (
        <div
          className="mt-1 p-3 bg-red-50 dark:bg-red-900/20 rounded border-l-2 border-red-500"
          style={{ marginLeft: `${depth * 1.5 + 2.5}rem` }}
        >
          <p className="text-sm text-red-700 dark:text-red-300 font-mono leading-relaxed whitespace-pre-wrap break-words">
            {stripAnsi(
              typeof step.error === "string" ? step.error : step.error.message,
            )}
          </p>
          {typeof step.error === "object" && step.error.stack && (
            <pre className="mt-2 text-xs overflow-x-auto text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono bg-red-100/50 dark:bg-red-950/30 p-2 rounded">
              {stripAnsi(step.error.stack)}
            </pre>
          )}
        </div>
      )}

      {/* Location info */}
      {step.location && (
        <div
          className="text-xs text-muted-foreground/70 font-mono mt-0.5 px-2"
          style={{ marginLeft: `${depth * 1.5 + 2.5}rem` }}
        >
          {step.location.file}:{step.location.line}
        </div>
      )}

      {/* Nested steps */}
      {expanded && hasNestedSteps && (
        <div className="mt-0.5">
          {step.steps!.map((nestedStep, idx) => (
            <TestStepItem key={idx} step={nestedStep} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
