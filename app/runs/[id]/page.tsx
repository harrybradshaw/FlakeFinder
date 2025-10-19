import { TestDetailsView } from "@/components/test-details-view"
import { notFound } from "next/navigation"
import { cookies } from "next/headers"

async function fetchTestRun(id: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  
  // Get cookies to forward authentication
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ')
  
  const response = await fetch(`${baseUrl}/api/test-runs/${id}`, {
    cache: "no-store",
    headers: {
      Cookie: cookieHeader,
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null
    }
    console.error(`[Page] Error fetching test run: ${response.status} ${response.statusText}`)
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
