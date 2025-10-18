import { Card } from "@/components/ui/card"
import { CheckCircle2, XCircle, AlertTriangle, TestTube } from "lucide-react"

interface TestStatsProps {
  stats: {
    totalTests: number
    passed: number
    failed: number
    flaky: number
  }
}

export function TestStats({ stats }: TestStatsProps) {
  const passRate = stats.totalTests > 0 ? ((stats.passed / stats.totalTests) * 100).toFixed(1) : 0

  const statCards = [
    {
      label: "Total Tests",
      value: stats.totalTests,
      icon: TestTube,
      color: "text-foreground",
    },
    {
      label: "Passed",
      value: stats.passed,
      icon: CheckCircle2,
      color: "text-green-500",
      percentage: passRate,
    },
    {
      label: "Failed",
      value: stats.failed,
      icon: XCircle,
      color: "text-red-500",
    },
    {
      label: "Flaky",
      value: stats.flaky,
      icon: AlertTriangle,
      color: "text-yellow-500",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => {
        const Icon = stat.icon
        return (
          <Card key={stat.label} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="text-3xl font-semibold">{stat.value}</p>
                  {stat.percentage && <span className="text-sm text-muted-foreground">({stat.percentage}%)</span>}
                </div>
              </div>
              <Icon className={`h-8 w-8 ${stat.color}`} />
            </div>
          </Card>
        )
      })}
    </div>
  )
}
