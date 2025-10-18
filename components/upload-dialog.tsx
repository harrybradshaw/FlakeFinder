"use client"

import type React from "react"

import { useState } from "react"
import { useSWRConfig } from "swr"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Upload, CheckCircle2, XCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function UploadDialog() {
  const { mutate } = useSWRConfig()
  const [open, setOpen] = useState(false)
  const [environment, setEnvironment] = useState("")
  const [trigger, setTrigger] = useState("")
  const [branch, setBranch] = useState("")
  const [commit, setCommit] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [uploadType, setUploadType] = useState<"json" | "zip">("zip")

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setResult(null)
    }
  }

  const handleUpload = async () => {
    if (!file || !environment || !trigger || !branch) {
      setResult({ success: false, message: "Please fill in all required fields" })
      return
    }

    setUploading(true)
    setResult(null)

    try {
      if (uploadType === "json") {
        const fileContent = await file.text()
        const results = JSON.parse(fileContent)

        const response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            environment,
            trigger,
            branch,
            commit,
            results,
          }),
        })

        const data = await response.json()

        if (response.ok) {
          setResult({
            success: true,
            message: `Successfully uploaded ${data.testRun.total} tests (${data.testRun.passed} passed, ${data.testRun.failed} failed)`,
          })
          // Revalidate all test-runs queries
          mutate((key) => typeof key === "string" && key.startsWith("/api/test-runs"))
          resetForm()
        } else {
          setResult({ success: false, message: data.error || "Upload failed" })
        }
      } else {
        // Handle ZIP file upload
        const formData = new FormData()
        formData.append("file", file)
        formData.append("environment", environment)
        formData.append("trigger", trigger)
        formData.append("branch", branch)
        formData.append("commit", commit || "")

        const response = await fetch("/api/upload-zip", {
          method: "POST",
          body: formData,
        })

        const data = await response.json()

        if (response.ok) {
          setResult({
            success: true,
            message: `Successfully uploaded ${data.testRun.total} tests (${data.testRun.passed} passed, ${data.testRun.failed} failed)`,
          })
          // Revalidate all test-runs queries
          mutate((key) => typeof key === "string" && key.startsWith("/api/test-runs"))
          resetForm()
        } else {
          setResult({ success: false, message: data.error || "Upload failed" })
        }
      }
    } catch (error) {
      setResult({ success: false, message: "Failed to parse or upload test results" })
    } finally {
      setUploading(false)
    }
  }

  const resetForm = () => {
    setTimeout(() => {
      setOpen(false)
      setEnvironment("")
      setTrigger("")
      setBranch("")
      setCommit("")
      setFile(null)
      setResult(null)
    }, 2000)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload Results
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Test Results</DialogTitle>
          <DialogDescription>Upload your Playwright test results to track trends over time.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="environment">
              Environment <span className="text-destructive">*</span>
            </Label>
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger id="environment">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="development">Development</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger">
              Trigger <span className="text-destructive">*</span>
            </Label>
            <Select value={trigger} onValueChange={setTrigger}>
              <SelectTrigger id="trigger">
                <SelectValue placeholder="Select trigger" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ci">CI</SelectItem>
                <SelectItem value="pull_request">Pull Request</SelectItem>
                <SelectItem value="merge_queue">Merge Queue</SelectItem>
                <SelectItem value="post_deploy">Post Deploy</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch">
              Branch <span className="text-destructive">*</span>
            </Label>
            <Input id="branch" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="commit">Commit SHA (optional)</Label>
            <Input
              id="commit"
              placeholder="a1b2c3d4e5f6"
              value={commit}
              onChange={(e) => setCommit(e.target.value)}
              maxLength={40}
            />
          </div>

          <Tabs value={uploadType} onValueChange={(v) => setUploadType(v as "json" | "zip")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="zip">HTML Report (ZIP)</TabsTrigger>
              <TabsTrigger value="json">JSON Report</TabsTrigger>
            </TabsList>
            <TabsContent value="zip" className="space-y-2">
              <Label htmlFor="file-zip">
                HTML Report ZIP <span className="text-destructive">*</span>
              </Label>
              <Input id="file-zip" type="file" accept=".zip" onChange={handleFileChange} />
              {file && <p className="text-sm text-muted-foreground">{file.name}</p>}
              <p className="text-xs text-muted-foreground">
                Upload the HTML report ZIP file from GitHub Actions (includes screenshots)
              </p>
            </TabsContent>
            <TabsContent value="json" className="space-y-2">
              <Label htmlFor="file-json">
                Test Results JSON <span className="text-destructive">*</span>
              </Label>
              <Input id="file-json" type="file" accept=".json" onChange={handleFileChange} />
              {file && <p className="text-sm text-muted-foreground">{file.name}</p>}
              <p className="text-xs text-muted-foreground">Upload JSON report (screenshots not included)</p>
            </TabsContent>
          </Tabs>

          {result && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                result.success ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
              }`}
            >
              {result.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {result.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !file || !environment || !trigger || !branch}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>

        <div className="mt-4 rounded-lg bg-muted p-4 text-sm space-y-2">
          <p className="font-medium">How to generate test results:</p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">JSON Report:</p>
              <Textarea
                readOnly
                value={`npx playwright test --reporter=json > results.json`}
                className="font-mono text-xs bg-background"
                rows={1}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">HTML Report (with screenshots):</p>
              <Textarea
                readOnly
                value={`npx playwright test --reporter=html
# Then download the playwright-report folder as a ZIP`}
                className="font-mono text-xs bg-background"
                rows={2}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
