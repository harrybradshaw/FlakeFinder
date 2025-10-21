"use client";

import type React from "react";

import { useState } from "react";
import { useSWRConfig } from "swr";
import useSWRImmutable from "swr/immutable";
import { calculateContentHash } from "@/lib/playwright-report-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Upload, XCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
};

export function UploadDialog() {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [environment, setEnvironment] = useState("");
  const [trigger, setTrigger] = useState("");
  const [suite, setSuite] = useState("");
  const [branch, setBranch] = useState("");
  const [commit, setCommit] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [uploadType, setUploadType] = useState<"json" | "zip">("zip");
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1); // Step 1: File selection, Step 2: Metadata review
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    timestamp: string;
    id: string;
  } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [calculatedHash, setCalculatedHash] = useState<string | null>(null);

  // Fetch environments, triggers, and suites dynamically
  const { data: environmentsData } = useSWRImmutable(
    "/api/environments",
    fetcher,
  );
  const { data: triggersData } = useSWRImmutable("/api/triggers", fetcher);
  const { data: suitesData } = useSWRImmutable("/api/suites", fetcher);

  const environments = environmentsData?.environments || [];
  const triggers = triggersData?.triggers || [];
  const suites = suitesData?.suites || [];

  const compressImage = async (
    imageData: Uint8Array,
    filename: string,
  ): Promise<Uint8Array> => {
    try {
      // Convert to blob
      const blob = new Blob([imageData], { type: "image/png" });

      // Create image element
      const img = new Image();
      const imageUrl = URL.createObjectURL(blob);

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Create canvas and compress
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return imageData;

      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(imageUrl);

      // Convert to JPEG with 80% quality (much smaller than PNG)
      const compressedBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.8);
      });

      return new Uint8Array(await compressedBlob.arrayBuffer());
    } catch {
      console.warn(`[Optimize] Failed to compress ${filename}, using original`);
      return imageData;
    }
  };

  const optimizeZip = async (zip: any): Promise<Blob> => {
    // Create a new ZIP with only essential files
    const JSZip = (await import("jszip")).default;
    const optimizedZip = new JSZip();

    // Patterns to exclude (large files we don't use)
    const excludePatterns = [
      /data\/.*\.zip$/, // All ZIPs in data folder (traces, etc.)
      /data\/trace\//, // Entire trace directory
      /\.trace$/, // Raw trace files
      /video\.webm$/, // Videos (we only use screenshots)
      /\.har$/, // HAR files (network logs)
      /\.network$/, // Network logs
    ];

    for (const [path, file] of Object.entries(zip.files)) {
      const zipFile = file as any;
      if (zipFile.dir) {
        optimizedZip.folder(path);
        continue;
      }

      const shouldExclude = excludePatterns.some((pattern) =>
        pattern.test(path),
      );

      if (shouldExclude) {
        console.log(`[Optimize] Removing: ${path}`);
      } else {
        const content = await zipFile.async("uint8array");

        // Compress PNG screenshots to JPEG
        if (
          path.endsWith(".png") &&
          (path.includes("screenshot") || path.includes("data/"))
        ) {
          const compressed = await compressImage(content, path);
          // Change extension to .jpg
          const newPath = path.replace(/\.png$/, ".jpg");
          optimizedZip.file(newPath, compressed);
        } else {
          optimizedZip.file(path, content);
        }
      }
    }

    return await optimizedZip.generateAsync({ type: "blob" });
  };

  const extractMetadataFromZip = async (file: File) => {
    try {
      setAutoDetecting(true);
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(file);

      // Extract info from filename
      const filename = file.name.toLowerCase();

      // Detect environment from filename by checking against database values
      let detectedEnvironment = environment;
      if (!detectedEnvironment && environments.length > 0) {
        for (const env of environments) {
          const envName = env.name.toLowerCase();
          // Check if filename contains environment name or common variations
          if (
            filename.includes(envName) ||
            (envName === "production" && filename.includes("prod")) ||
            (envName === "staging" && filename.includes("stage")) ||
            (envName === "development" &&
              (filename.includes("dev") || filename.includes("preview")))
          ) {
            detectedEnvironment = env.name;
            console.log(
              `[Auto-detect] Detected environment from filename: ${env.name}`,
            );
            break;
          }
        }
      }

      // Detect trigger from filename by checking against database values
      let detectedTrigger = trigger;
      if (!detectedTrigger && triggers.length > 0) {
        for (const trig of triggers) {
          const trigName = trig.name.toLowerCase();
          // Check if filename contains trigger name with common variations
          if (
            filename.includes(trigName) ||
            filename.includes(trigName.replace("_", "-")) ||
            (trigName === "pull_request" && filename.includes("pr"))
          ) {
            detectedTrigger = trig.name;
            break;
          }
        }
        // Default to merge_queue if no match found
        if (!detectedTrigger) {
          const mergeQueueTrigger = triggers.find(
            (t: any) => t.name === "merge_queue",
          );
          if (mergeQueueTrigger) {
            detectedTrigger = mergeQueueTrigger.name;
          }
        }
      }

      // Check for HTML report
      const htmlFile = zip.file("index.html");
      if (htmlFile) {
        const htmlContent = await htmlFile.async("string");
        const match = htmlContent.match(
          /window\.playwrightReportBase64 = "([^"]+)"/,
        );
        if (match) {
          const dataUri = match[1];
          const base64Data = dataUri.replace(
            "data:application/zip;base64,",
            "",
          );

          // Decode base64 in browser
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const embeddedZip = await JSZip.loadAsync(bytes);
          const reportFile = embeddedZip.file("report.json");

          if (reportFile) {
            const reportContent = await reportFile.async("string");
            const reportData = JSON.parse(reportContent);
            // Extract metadata
            const metadata = reportData.metadata?.ci || {};

            // Auto-fill commit if available
            if (metadata.commitHash && !commit) {
              setCommit(metadata.commitHash);
            }

            // Extract branch from CI metadata (prefer CI env vars over URL parsing)
            let detectedBranch =
              metadata.GITHUB_HEAD_REF || // GitHub PR branch
              metadata.GITHUB_REF_NAME || // GitHub branch/tag name
              metadata.BRANCH ||
              metadata.GIT_BRANCH ||
              metadata.CI_COMMIT_BRANCH ||
              null;

            // If we have PR metadata but no branch, extract from PR title
            if (!detectedBranch && metadata.prTitle) {
              // Try to extract ticket/issue key from PR title (e.g., "WS-2938: Fix something" -> "WS-2938")
              const ticketMatch = metadata.prTitle.match(/^([A-Z]+-\d+)/);
              if (ticketMatch) {
                detectedBranch = ticketMatch[1];
              } else {
                // If no ticket pattern, use PR number from URL
                const prMatch = metadata.prHref?.match(/\/pull\/(\d+)$/);
                if (prMatch) {
                  detectedBranch = `pr-${prMatch[1]}`;
                }
              }
            }

            // Fallback: try to extract from commit URL if CI metadata didn't have it
            if (!detectedBranch && metadata.commitHref) {
              const branchMatch = metadata.commitHref.match(/\/tree\/([^/]+)/);
              if (branchMatch) {
                detectedBranch = branchMatch[1];
              }
            }

            // Final fallback to "main" if nothing found
            if (!detectedBranch) {
              detectedBranch = "main";
            }

            setBranch(detectedBranch);

            // Try to infer environment from branch name if not detected from filename
            if (!detectedEnvironment && detectedBranch) {
              const branchName = detectedBranch.toLowerCase();
              if (
                branchName.includes("prod") ||
                branchName === "main" ||
                branchName === "master"
              ) {
                detectedEnvironment = "production";
              } else if (
                branchName.includes("staging") ||
                branchName.includes("stage")
              ) {
                detectedEnvironment = "staging";
              } else {
                detectedEnvironment = "development";
              }
            }

            // Try to infer trigger from URL patterns if not detected from filename
            if (!detectedTrigger && metadata.buildHref) {
              if (metadata.buildHref.includes("pull_request")) {
                detectedTrigger = "pull_request";
              } else if (metadata.buildHref.includes("workflow_dispatch")) {
                detectedTrigger = "ci";
              } else {
                detectedTrigger = "merge_queue";
              }
            } else if (!detectedTrigger) {
              detectedTrigger = "merge_queue";
            }

            // Set detected values
            if (detectedEnvironment) setEnvironment(detectedEnvironment);
            if (detectedTrigger) setTrigger(detectedTrigger);

            setCheckingDuplicate(true);
            try {
              // Process the report data to extract tests in the same format as the backend
              const { processPlaywrightReportFile } = await import(
                "@/lib/playwright-report-utils"
              );
              const { tests } = await processPlaywrightReportFile(file);
              const contentHash = await calculateContentHash(tests);

              console.log("[Duplicate Check] Calculated hash:", contentHash);

              // Store hash for later use in upload
              setCalculatedHash(contentHash);

              const formData = new FormData();
              formData.append("contentHash", contentHash);
              formData.append(
                "environment",
                detectedEnvironment || environment,
              );
              formData.append("trigger", detectedTrigger || trigger);
              formData.append("branch", detectedBranch || branch || "main");
              formData.append(
                "commit",
                commit || metadata.commitHash || "unknown",
              );

              const response = await fetch("/api/check-duplicate", {
                method: "POST",
                body: formData,
              });

              if (response.ok) {
                const data = await response.json();
                if (data.hasDuplicates && data.existingRun) {
                  setIsDuplicate(true);
                  setDuplicateInfo({
                    timestamp: data.existingRun.timestamp,
                    id: data.existingRun.id,
                  });
                  console.log(
                    "[Duplicate Check] Duplicate detected, showing warning",
                  );
                } else {
                  setIsDuplicate(false);
                  setDuplicateInfo(null);
                  console.log("[Duplicate Check] No duplicate found");
                }
              }
            } catch (error) {
              console.error("[Duplicate Check] Failed:", error);
            } finally {
              setCheckingDuplicate(false);
            }

            // Move to step 2 after successful detection
            setTimeout(() => {
              setStep(2);
            }, 100);

            return { success: true, metadata };
          }
        }
      }
    } catch (error) {
      console.error("Failed to extract metadata:", error);
    } finally {
      setAutoDetecting(false);
    }
    return { success: false };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResult(null);
      setIsDuplicate(false);
      setDuplicateInfo(null);

      // Try to auto-detect metadata from ZIP
      if (uploadType === "zip" && selectedFile.name.endsWith(".zip")) {
        await extractMetadataFromZip(selectedFile);
      } else if (uploadType === "json") {
        // For JSON, extract from filename and use defaults
        const filename = selectedFile.name.toLowerCase();

        // Detect environment from filename by checking against database values
        let detectedEnvironment = null;
        if (environments.length > 0) {
          for (const env of environments) {
            const envName = env.name.toLowerCase();
            if (
              filename.includes(envName) ||
              (envName === "production" && filename.includes("prod")) ||
              (envName === "staging" && filename.includes("stage")) ||
              (envName === "development" && filename.includes("dev"))
            ) {
              detectedEnvironment = env.name;
              break;
            }
          }
        }
        // Default to development if no match
        if (!detectedEnvironment) {
          const devEnv = environments.find(
            (e: any) => e.name === "development",
          );
          detectedEnvironment = devEnv
            ? devEnv.name
            : environments[0]?.name || "development";
        }
        setEnvironment(detectedEnvironment);

        // Detect trigger from filename by checking against database values
        let detectedTrigger = null;
        if (triggers.length > 0) {
          for (const trig of triggers) {
            const trigName = trig.name.toLowerCase();
            if (
              filename.includes(trigName) ||
              filename.includes(trigName.replace("_", "-")) ||
              (trigName === "pull_request" && filename.includes("pr"))
            ) {
              detectedTrigger = trig.name;
              break;
            }
          }
        }
        // Default to merge_queue if no match
        if (!detectedTrigger) {
          const mergeQueueTrigger = triggers.find(
            (t: any) => t.name === "merge_queue",
          );
          detectedTrigger = mergeQueueTrigger
            ? mergeQueueTrigger.name
            : triggers[0]?.name || "merge_queue";
        }
        setTrigger(detectedTrigger);

        setBranch("main");
        setTimeout(() => {
          setStep(2);
        }, 100);
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !environment || !trigger || !branch) {
      setResult({
        success: false,
        message: "Please fill in all required fields",
      });
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      if (uploadType === "json") {
        const fileContent = await file.text();
        const results = JSON.parse(fileContent);

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
        });

        const data = await response.json();

        if (response.ok) {
          setResult({
            success: true,
            message: `Successfully uploaded ${data.testRun.total} tests (${data.testRun.passed} passed, ${data.testRun.failed} failed)`,
          });
          // Revalidate all test-runs queries
          await mutate(
            (key) =>
              typeof key === "string" && key.startsWith("/api/test-runs"),
          );
          resetForm();
        } else {
          setResult({ success: false, message: data.error || "Upload failed" });
        }
      } else {
        // Handle ZIP file upload - optimize first to remove trace files
        setOptimizing(true);

        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);
        const optimizedBlob = await optimizeZip(zip);
        setOptimizing(false);

        const formData = new FormData();
        formData.append("file", optimizedBlob, file.name);
        formData.append("environment", environment);
        formData.append("trigger", trigger);
        formData.append("suite", suite);
        formData.append("branch", branch);
        formData.append("commit", commit || "");

        // Send pre-calculated hash if available
        if (calculatedHash) {
          formData.append("contentHash", calculatedHash);
        }

        const response = await fetch("/api/upload-zip", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          setResult({
            success: true,
            message: `Successfully uploaded ${data.testRun.total} tests (${data.testRun.passed} passed, ${data.testRun.failed} failed)`,
          });
          // Revalidate all test-runs queries
          await mutate(
            (key) =>
              typeof key === "string" && key.startsWith("/api/test-runs"),
          );
          resetForm();
        } else {
          // Handle duplicate detection specially
          if (response.status === 409 && data.isDuplicate) {
            setResult({
              success: false,
              message: `⚠️ ${data.message}`,
            });
          } else {
            setResult({
              success: false,
              message: data.error || "Upload failed",
            });
          }
        }
      }
    } catch {
      setResult({
        success: false,
        message: "Failed to parse or upload test results",
      });
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setTimeout(() => {
      setOpen(false);
      setEnvironment("");
      setTrigger("");
      setSuite("");
      setBranch("");
      setCommit("");
      setFile(null);
      setResult(null);
      setStep(1);
      setIsDuplicate(false);
      setDuplicateInfo(null);
    }, 2000);
  };

  const handleBack = () => {
    setStep(1);
    setFile(null);
    setEnvironment("");
    setTrigger("");
    setSuite("");
    setBranch("");
    setCommit("");
    setResult(null);
    setIsDuplicate(false);
    setDuplicateInfo(null);
  };

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
          <DialogTitle>
            Upload Test Results {step === 2 && "- Review Metadata"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Select your Playwright test report file to begin"
              : "Review and edit the detected metadata before uploading"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step 1: File Selection */}
          {step === 1 && (
            <>
              <Tabs
                value={uploadType}
                onValueChange={(v) => setUploadType(v as "json" | "zip")}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="zip">HTML Report (ZIP)</TabsTrigger>
                  <TabsTrigger value="json">JSON Report</TabsTrigger>
                </TabsList>
                <TabsContent value="zip" className="space-y-2">
                  <Label htmlFor="file-zip">
                    HTML Report ZIP <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="file-zip"
                    type="file"
                    accept=".zip"
                    onChange={handleFileChange}
                    disabled={autoDetecting}
                  />
                  {autoDetecting && (
                    <p className="text-sm text-blue-500">
                      🔍 Auto-detecting metadata...
                    </p>
                  )}
                  {file && !autoDetecting && (
                    <p className="text-sm text-muted-foreground">{file.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Upload the HTML report ZIP file from GitHub Actions
                    (includes screenshots). Metadata will be auto-detected.
                  </p>
                </TabsContent>
                <TabsContent value="json" className="space-y-2">
                  <Label htmlFor="file-json">
                    Test Results JSON{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="file-json"
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                  />
                  {file && (
                    <p className="text-sm text-muted-foreground">{file.name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Upload JSON report (screenshots not included)
                  </p>
                </TabsContent>
              </Tabs>

              <div className="mt-4 rounded-lg bg-muted p-4 text-sm space-y-2">
                <p className="font-medium">How to generate test results:</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      JSON Report:
                    </p>
                    <Textarea
                      readOnly
                      value={`npx playwright test --reporter=json > results.json`}
                      className="font-mono text-xs bg-background"
                      rows={1}
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      HTML Report (with screenshots):
                    </p>
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
            </>
          )}

          {/* Step 2: Metadata Review */}
          {step === 2 && (
            <>
              {/* Duplicate Warning */}
              {checkingDuplicate && (
                <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    <p className="text-sm text-blue-800">
                      Checking for duplicates...
                    </p>
                  </div>
                </div>
              )}

              {isDuplicate && duplicateInfo && (
                <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div className="flex-1">
                      <h4 className="font-semibold text-yellow-900">
                        Duplicate Test Run Detected
                      </h4>
                      <p className="text-sm text-yellow-800 mt-1">
                        This test run (executed at{" "}
                        {new Date(duplicateInfo.timestamp).toLocaleString()})
                        already exists in the database.
                      </p>
                      <p className="text-xs text-yellow-700 mt-2">
                        Uploading this again will be rejected. If you want to
                        re-upload, please delete the existing run first.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="environment">
                  Environment <span className="text-destructive">*</span>
                </Label>
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger id="environment">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((env: any) => (
                      <SelectItem key={env.id} value={env.name}>
                        {env.display_name}
                      </SelectItem>
                    ))}
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
                    {triggers.map((trig: any) => (
                      <SelectItem key={trig.id} value={trig.name}>
                        {trig.icon} {trig.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="suite">
                  Suite <span className="text-destructive">*</span>
                </Label>
                <Select value={suite} onValueChange={setSuite}>
                  <SelectTrigger id="suite">
                    <SelectValue placeholder="Select suite" />
                  </SelectTrigger>
                  <SelectContent>
                    {suites.map((s: any) => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch">
                  Branch <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="branch"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
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

              {result && (
                <div
                  className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                    result.success
                      ? "bg-green-500/10 text-green-500"
                      : "bg-red-500/10 text-red-500"
                  }`}
                >
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {result.message}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {step === 2 && (
            <Button variant="outline" onClick={handleBack} disabled={uploading}>
              Back
            </Button>
          )}
          {step === 1 && (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
          {step === 2 && (
            <Button
              onClick={handleUpload}
              disabled={
                uploading ||
                optimizing ||
                !file ||
                !environment ||
                !trigger ||
                !suite ||
                !branch ||
                isDuplicate ||
                checkingDuplicate
              }
            >
              {optimizing
                ? "Optimizing..."
                : uploading
                  ? "Uploading..."
                  : checkingDuplicate
                    ? "Checking..."
                    : isDuplicate
                      ? "Duplicate - Cannot Upload"
                      : "Upload"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
