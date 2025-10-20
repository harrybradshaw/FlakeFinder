"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  X,
} from "lucide-react";

interface Test {
  id?: string;
  name: string;
  file: string;
  status: string;
  duration?: string; // formatted string
  durationMs?: number; // raw number in ms
  worker_index?: number | null;
  started_at?: string | null;
  originalTestId?: string; // For tracking retries of the same test
}

interface TimelineViewProps {
  tests: Test[];
  onTestSelect?: (testId: string) => void;
}

export function TimelineView({ tests, onTestSelect }: TimelineViewProps) {
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const timeline = useMemo(() => {
    // Filter tests that have timing info
    const timedTests = tests.filter((t) => t.started_at && t.durationMs);

    if (timedTests.length === 0) {
      return null;
    }

    // Sort by start time
    timedTests.sort(
      (a, b) =>
        new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime(),
    );

    // Find time bounds
    const startTimes = timedTests.map((t) => new Date(t.started_at!).getTime());
    const minTime = Math.min(...startTimes);
    const maxTime = Math.max(
      ...startTimes.map((t, i) => t + timedTests[i].durationMs!),
    );
    const totalDuration = maxTime - minTime;

    // Assign tests to virtual "lanes" based on parallel execution
    // Tests that overlap in time go to different lanes
    // Retries of the same test should always go to the same lane
    const lanes: Test[][] = [];
    const testIdToLane = new Map<string, number>(); // Track which lane each original test is in

    timedTests.forEach((test) => {
      const testStart = new Date(test.started_at!).getTime();
      const testEnd = testStart + test.durationMs!;
      const originalId = test.originalTestId || test.id;

      let assignedLane = -1;

      // If this is a retry of a test we've already seen, use the same lane
      if (originalId && testIdToLane.has(originalId)) {
        assignedLane = testIdToLane.get(originalId)!;
      } else {
        // Find a lane where this test doesn't overlap with existing tests
        for (let i = 0; i < lanes.length; i++) {
          const lane = lanes[i];
          const lastTestInLane = lane[lane.length - 1];
          const lastTestEnd =
            new Date(lastTestInLane.started_at!).getTime() +
            lastTestInLane.durationMs!;

          // If the last test in this lane ends before this test starts, we can use this lane
          if (lastTestEnd <= testStart) {
            assignedLane = i;
            break;
          }
        }

        // If no suitable lane found, create a new one
        if (assignedLane === -1) {
          assignedLane = lanes.length;
          lanes.push([]);
        }

        // Remember which lane this test (and its retries) should use
        if (originalId) {
          testIdToLane.set(originalId, assignedLane);
        }
      }

      lanes[assignedLane].push(test);
    });

    return {
      workers: lanes.map((lane, index) => [index, lane] as [number, Test[]]),
      minTime,
      totalDuration,
    };
  }, [tests]);

  if (!timeline) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        <p>Timeline data not available for this test run.</p>
        <p className="text-sm mt-2">
          Test execution timing and worker information is needed to display the
          timeline.
        </p>
      </div>
    );
  }

  const { workers, minTime, totalDuration } = timeline;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "passed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "flaky":
        return "bg-yellow-500";
      case "skipped":
        return "bg-gray-400";
      default:
        return "bg-gray-300";
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // Get the original test ID for highlighting related blocks
  const selectedOriginalId = selectedTest?.originalTestId || selectedTest?.id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Test Execution Timeline</h3>
        <div className="text-sm text-muted-foreground">
          Total Duration: {formatTime(totalDuration)}
        </div>
      </div>

      {/* Inline Test Details */}
      {selectedTest && (
        <Card className="p-4 border-primary/50 bg-accent/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                {selectedTest.status === "passed" && (
                  <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                )}
                {selectedTest.status === "failed" && (
                  <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                )}
                {selectedTest.status === "flaky" && (
                  <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                )}
                {selectedTest.status === "skipped" && (
                  <Clock className="h-5 w-5 text-gray-500 flex-shrink-0" />
                )}
                <h4 className="font-semibold text-base">{selectedTest.name}</h4>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <div className="mt-1">
                    <span
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        selectedTest.status === "passed"
                          ? "bg-green-100 text-green-800"
                          : selectedTest.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : selectedTest.status === "flaky"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {selectedTest.status}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground">Duration:</span>
                  <div className="mt-1 font-medium">
                    {formatTime(selectedTest.durationMs!)}
                  </div>
                </div>

                <div className="col-span-2">
                  <span className="text-muted-foreground">File:</span>
                  <div className="mt-1 font-mono text-xs">
                    {selectedTest.file}
                  </div>
                </div>

                {selectedTest.started_at && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Started:</span>
                    <div className="mt-1">
                      {new Date(selectedTest.started_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (selectedTest.originalTestId && onTestSelect) {
                      onTestSelect(selectedTest.originalTestId);
                      setSelectedTest(null);
                    }
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Full Test Details
                </Button>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedTest(null)}
              className="flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      <div className="rounded-lg border bg-card p-4">
        {/* Timeline header with time markers */}
        <div className="mb-4 flex items-center">
          <div className="w-24 flex-shrink-0"></div>
          <div className="relative flex-1 h-8 border-b border-border">
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <div
                key={fraction}
                className="absolute top-0 bottom-0 border-l border-border"
                style={{ left: `${fraction * 100}%` }}
              >
                <span className="absolute top-full mt-1 -translate-x-1/2 text-xs text-muted-foreground">
                  {formatTime(totalDuration * fraction)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Worker/Lane rows */}
        <div className="space-y-2">
          {workers.map(([workerIndex, workerTests]) => (
            <div key={workerIndex} className="flex items-center group">
              {/* Lane label */}
              <div className="w-24 flex-shrink-0 pr-4 text-sm text-muted-foreground">
                Lane {workerIndex + 1}
              </div>

              {/* Timeline bar */}
              <div className="relative flex-1 h-8 bg-muted/30 rounded">
                {workerTests.map((test) => {
                  const startTime = new Date(test.started_at!).getTime();
                  const leftPercent =
                    ((startTime - minTime) / totalDuration) * 100;
                  const widthPercent = (test.durationMs! / totalDuration) * 100;

                  // Check if this test is related to the selected test (same original test ID)
                  const testOriginalId = test.originalTestId || test.id;
                  const isRelated =
                    selectedOriginalId && testOriginalId === selectedOriginalId;
                  const isSelected = test.id === selectedTest?.id;

                  return (
                    <div
                      key={test.id}
                      className={`absolute top-1 bottom-1 ${getStatusColor(test.status)} rounded transition-all cursor-pointer
                        ${isSelected ? "z-20 ring-2 ring-primary scale-105" : "hover:z-10 hover:ring-2 hover:ring-primary hover:opacity-80"}
                        ${isRelated && !isSelected ? "ring-2 ring-primary/50" : ""}
                      `}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${Math.max(widthPercent, 0.5)}%`,
                        backgroundImage: isRelated
                          ? "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)"
                          : "none",
                      }}
                      onClick={() => setSelectedTest(test)}
                      title={`Click to view details: ${test.name}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span>Passed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span>Failed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span>Flaky</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-400 rounded"></div>
            <span>Skipped</span>
          </div>
        </div>
      </div>
    </div>
  );
}
