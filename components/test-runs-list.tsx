import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, Clock, ChevronRight } from "lucide-react"
import Link from "next/link"
import type { TestRun } from "@/lib/mock-data"

interface TestRunsListProps {
  runs: TestRun[]
}

const getTriggerLabel = (trigger: string) => {
  const labels: Record<string, string> = {
    ci: "CI",
    pull_request: "Pull Request",
    merge_queue: "Merge Queue",
    post_deploy: "Post Deploy",
  }
  return labels[trigger] || trigger
}

export function TestRunsList({ runs }: TestRunsListProps) {
  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const passRate = ((run.passed / run.total) * 100).toFixed(0)
        const status = run.failed === 0 ? "passed" : "failed"

        return (
          <Link key={run.id} href={`/runs/${run.id}`}>
            <Card className="p-4 hover:bg-accent/50 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      status === "passed" ? "bg-green-500/10" : "bg-red-500/10"
                    }`}
                  >
                    {status === "passed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{run.branch}</h3>
                      <Badge variant="outline" className="text-xs">
                        {run.environment}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {getTriggerLabel(run.trigger)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {run.duration}
                      </span>
                      <span>{run.timestamp}</span>
                      <span className="text-xs text-muted-foreground/70">{run.commit.slice(0, 7)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-semibold text-green-500">{run.passed}</div>
                      <div className="text-xs text-muted-foreground">Passed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-semibold text-red-500">{run.failed}</div>
                      <div className="text-xs text-muted-foreground">Failed</div>
                    </div>
                    {run.flaky > 0 && (
                      <div className="text-center">
                        <div className="text-2xl font-semibold text-yellow-500">{run.flaky}</div>
                        <div className="text-xs text-muted-foreground">Flaky</div>
                      </div>
                    )}
                    <div className="text-center">
                      <div className="text-2xl font-semibold">{passRate}%</div>
                      <div className="text-xs text-muted-foreground">Pass Rate</div>
                    </div>
                  </div>
                </div>

                <Button variant="ghost" size="icon">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
