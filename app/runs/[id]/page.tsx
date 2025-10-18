import { TestDetailsView } from "@/components/test-details-view"
import { notFound } from "next/navigation"

async function fetchTestRun(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  const response = await fetch(`${baseUrl}/api/test-runs/${id}`, {
    cache: "no-store", // Ensure fresh data on each request
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    throw new Error("Failed to fetch test run")
  }

  return response.json()
}

export default async function TestRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const testRun = await fetchTestRun(id)

  if (!testRun) {
    notFound()
  }

  return <TestDetailsView testRun={testRun} />
}
