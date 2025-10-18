import { TestDetailsView } from "@/components/test-details-view"
import { mockTestRuns } from "@/lib/mock-data"
import { notFound } from "next/navigation"

export default function TestRunPage({ params }: { params: { id: string } }) {
  const testRun = mockTestRuns.find((run) => run.id === params.id)

  if (!testRun) {
    notFound()
  }

  return <TestDetailsView testRun={testRun} />
}
