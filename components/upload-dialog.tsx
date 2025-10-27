"use client";

import type React from "react";

import { useState } from "react";
import { useSWRConfig } from "swr";
import useSWRImmutable from "swr/immutable";
import { extractMetadataFromZip } from "@/lib/upload/metadata-extraction";
import { optimizePlaywrightReportBrowser } from "@/lib/upload/report-optimization.browser";
import type {
  Environment,
  EnvironmentsResponse,
  Trigger,
  TriggersResponse,
  Suite,
  SuitesResponse,
} from "@/types/api";
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
import { uploadZipFormDataFields } from "@/lib/upload/upload-constants";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch");
  return response.json();
};

export function UploadDialog() {
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [environmentName, setEnvironmentName] = useState("");
  const [triggerName, setTriggerName] = useState("");
  const [suiteId, setSuiteId] = useState("");
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

  const { data: environmentsData } = useSWRImmutable<EnvironmentsResponse>(
    "/api/environments",
    fetcher,
  );
  const { data: triggersData } = useSWRImmutable<TriggersResponse>(
    "/api/triggers",
    fetcher,
  );
  const { data: suitesData } = useSWRImmutable<SuitesResponse>(
    "/api/suites",
    fetcher,
  );

  const environments: Environment[] = environmentsData?.environments || [];
  const triggers: Trigger[] = triggersData?.triggers || [];
  const suites: Suite[] = suitesData?.suites || [];

  const appendCommonMetadata = (formData: FormData) => {
    formData.append(uploadZipFormDataFields.environmentName, environmentName);
    formData.append(uploadZipFormDataFields.triggerName, triggerName);
    formData.append(uploadZipFormDataFields.branch, branch);
    formData.append(uploadZipFormDataFields.commit, commit || "");
  };

  const checkForDuplicates = async (suiteIdToCheck: string) => {
    if (!calculatedHash || !environmentName || !triggerName || !branch) {
      return;
    }

    setCheckingDuplicate(true);
    try {
      const formData = new FormData();
      formData.append("contentHash", calculatedHash);
      appendCommonMetadata(formData);
      if (suiteIdToCheck) {
        formData.append("suite", suiteIdToCheck);
      }

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
        } else {
          setIsDuplicate(false);
          setDuplicateInfo(null);
        }
      }
    } catch (error) {
      console.error("[Duplicate Check] Failed:", error);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const handleSuiteChange = (newSuiteId: string) => {
    setSuiteId(newSuiteId);
    if (newSuiteId && calculatedHash && step === 2) {
      void checkForDuplicates(newSuiteId);
    }
  };

  const handleMetadataExtraction = async (file: File) => {
    try {
      setAutoDetecting(true);
      const result = await extractMetadataFromZip({
        file,
        environments,
        triggers,
        currentEnvironment: environmentName,
        currentTrigger: triggerName,
        currentCommit: commit,
      });

      if (result.success) {
        if (result.detectedEnvironment)
          setEnvironmentName(result.detectedEnvironment);
        if (result.detectedTrigger) setTriggerName(result.detectedTrigger);
        if (result.detectedBranch) setBranch(result.detectedBranch);
        if (result.detectedCommit) setCommit(result.detectedCommit);
        if (result.contentHash) setCalculatedHash(result.contentHash);

        // Move to step 2 after successful detection
        setTimeout(() => {
          setStep(2);
        }, 100);

        return result;
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
        await handleMetadataExtraction(selectedFile);
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
          const devEnv = environments.find((e) => e.name === "development");
          detectedEnvironment = devEnv
            ? devEnv.name
            : environments[0]?.name || "development";
        }
        setEnvironmentName(detectedEnvironment);

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
            (t) => t.name === "merge_queue",
          );
          detectedTrigger = mergeQueueTrigger
            ? mergeQueueTrigger.name
            : triggers[0]?.name || "merge_queue";
        }
        setTriggerName(detectedTrigger);

        setBranch("main");
        setTimeout(() => {
          setStep(2);
        }, 100);
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !environmentName || !triggerName || !branch) {
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
            environment: environmentName,
            trigger: triggerName,
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
        const optimizedBlob = await optimizePlaywrightReportBrowser(zip, {
          verbose: true,
        });
        setOptimizing(false);

        const formData = new FormData();
        formData.append(uploadZipFormDataFields.file, optimizedBlob, file.name);
        appendCommonMetadata(formData);
        formData.append(uploadZipFormDataFields.suiteId, suiteId);

        // Send pre-calculated hash if available
        if (calculatedHash) {
          formData.append(uploadZipFormDataFields.contentHash, calculatedHash);
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
      setEnvironmentName("");
      setTriggerName("");
      setSuiteId("");
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
    setEnvironmentName("");
    setTriggerName("");
    setSuiteId("");
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
                <Select
                  value={environmentName}
                  onValueChange={setEnvironmentName}
                >
                  <SelectTrigger id="environment">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    {environments.map((env) => (
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
                <Select value={triggerName} onValueChange={setTriggerName}>
                  <SelectTrigger id="trigger">
                    <SelectValue placeholder="Select trigger" />
                  </SelectTrigger>
                  <SelectContent>
                    {triggers.map((trig) => (
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
                <Select value={suiteId} onValueChange={handleSuiteChange}>
                  <SelectTrigger id="suite">
                    <SelectValue placeholder="Select suite" />
                  </SelectTrigger>
                  <SelectContent>
                    {suites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          {s.project && (
                            <>
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: s.project.color }}
                              />
                              <span className="text-muted-foreground text-xs">
                                {s.project.display_name}
                              </span>
                              <span className="text-muted-foreground">·</span>
                            </>
                          )}
                          <span>{s.name}</span>
                        </div>
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
                !environmentName ||
                !triggerName ||
                !suiteId ||
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
