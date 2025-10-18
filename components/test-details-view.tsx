"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ArrowLeft, CheckCircle2, XCircle, Clock, AlertTriangle, FileText } from "lucide-react"
import Link from "next/link"
import type { TestRun } from "@/lib/mock-data"

interface TestDetailsViewProps {
  testRun: TestRun
}

export function TestDetailsView({ testRun }: TestDetailsViewProps) {
  const passRate = ((testRun.passed / testRun.total) * 100).toFixed(1)

  // Generate mock test cases based on the test run stats
  const testCases = generateMockTestCases(testRun)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-semibold text-foreground">{testRun.branch}</h1>
                <Badge variant="outline">{testRun.environment}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{testRun.timestamp}</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {testRun.duration}
                </span>
                <span className="text-xs">{testRun.commit.slice(0, 7)}</span>
              </div>
            </div>
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
                <p className="text-2xl font-semibold mt-1 text-green-500">{testRun.passed}</p>
              </div>
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-semibold mt-1 text-red-500">{testRun.failed}</p>
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

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Test Cases</h2>
          <Accordion type="single" collapsible className="w-full">
            {testCases.map((testCase, index) => (
              <AccordionItem key={index} value={`test-${index}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 flex-1 text-left">
                    {testCase.status === "passed" && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                    {testCase.status === "failed" && <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                    {testCase.status === "flaky" && <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{testCase.name}</div>
                      <div className="text-sm text-muted-foreground">{testCase.file}</div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {testCase.duration}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pl-7 pt-2 space-y-3">
                    {testCase.status === "failed" && testCase.error && (
                      <div className="rounded-lg bg-red-500/10 p-4 border border-red-500/20">
                        <p className="text-sm font-medium text-red-500 mb-2">Error</p>
                        <pre className="text-xs text-red-400 overflow-x-auto whitespace-pre-wrap font-mono">
                          {testCase.error}
                        </pre>
                      </div>
                    )}

                    {testCase.status === "flaky" && (
                      <div className="rounded-lg bg-yellow-500/10 p-4 border border-yellow-500/20">
                        <p className="text-sm font-medium text-yellow-500 mb-2">Flaky Test</p>
                        <p className="text-xs text-yellow-400">
                          This test passed after {testCase.retries} {testCase.retries === 1 ? "retry" : "retries"}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground min-w-[80px]">File:</span>
                        <span className="font-mono text-xs">{testCase.file}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground min-w-[80px]">Duration:</span>
                        <span>{testCase.duration}</span>
                      </div>
                      {testCase.browser && (
                        <div className="flex items-start gap-2 text-sm">
                          <span className="text-muted-foreground min-w-[80px]">Browser:</span>
                          <span>{testCase.browser}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      </main>
    </div>
  )
}

// Helper function to generate mock test cases based on test run stats
function generateMockTestCases(testRun: TestRun) {
  const testCases = []
  const testFiles = [
    "tests/auth/login.spec.ts",
    "tests/auth/signup.spec.ts",
    "tests/checkout/cart.spec.ts",
    "tests/checkout/payment.spec.ts",
    "tests/product/search.spec.ts",
    "tests/product/details.spec.ts",
    "tests/user/profile.spec.ts",
    "tests/user/settings.spec.ts",
    "tests/admin/dashboard.spec.ts",
    "tests/admin/users.spec.ts",
  ]

  const browsers = ["chromium", "firefox", "webkit"]

  // Add passed tests
  for (let i = 0; i < testRun.passed; i++) {
    testCases.push({
      name: `should ${["display correctly", "handle user input", "validate form", "submit successfully", "load data"][i % 5]}`,
      file: testFiles[i % testFiles.length],
      status: "passed" as const,
      duration: `${Math.floor(Math.random() * 5000) + 500}ms`,
      browser: browsers[i % browsers.length],
    })
  }

  // Add failed tests
  for (let i = 0; i < testRun.failed; i++) {
    testCases.push({
      name: `should ${["authenticate user", "process payment", "update profile", "delete item", "send notification"][i % 5]}`,
      file: testFiles[(i + 3) % testFiles.length],
      status: "failed" as const,
      duration: `${Math.floor(Math.random() * 3000) + 1000}ms`,
      browser: browsers[i % browsers.length],
      error: `Error: Expected element to be visible\n    at tests/${testFiles[(i + 3) % testFiles.length]}:${Math.floor(Math.random() * 50) + 10}:${Math.floor(Math.random() * 20) + 5}\n\nExpected: visible\nReceived: hidden`,
    })
  }

  // Add flaky tests
  for (let i = 0; i < testRun.flaky; i++) {
    testCases.push({
      name: `should ${["load async data", "handle race condition", "wait for animation", "sync state"][i % 4]}`,
      file: testFiles[(i + 6) % testFiles.length],
      status: "flaky" as const,
      duration: `${Math.floor(Math.random() * 4000) + 2000}ms`,
      browser: browsers[i % browsers.length],
      retries: Math.floor(Math.random() * 2) + 1,
    })
  }

  return testCases
}
