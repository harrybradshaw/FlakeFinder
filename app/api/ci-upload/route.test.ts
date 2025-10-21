import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Mock all dependencies
vi.mock("@/lib/api-key-auth", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("@/lib/report-optimization", () => ({
  optimizePlaywrightReport: vi.fn(),
}));

vi.mock("@/lib/upload-processing", () => ({
  processScreenshots: vi.fn(),
  processTestsFromZip: vi.fn(),
  lookupDatabaseIds: vi.fn(),
  checkDuplicate: vi.fn(),
  insertTestRun: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/zip-extraction-utils", () => ({
  mapScreenshotPaths: vi.fn(),
}));

import { authenticateApiKey } from "@/lib/api-key-auth";
import { optimizePlaywrightReport } from "@/lib/report-optimization";
import {
  processScreenshots,
  processTestsFromZip,
  lookupDatabaseIds,
  checkDuplicate,
  insertTestRun,
} from "@/lib/upload-processing";

describe("POST /api/ci-upload", () => {
  let mockFile: File;
  let mockZipBuffer: Buffer;

  beforeEach(async () => {
    // Load real test fixture file
    const fixturePath = join(
      __dirname,
      "../../../lib/__tests__/fixtures/playwright-report-sample.zip",
    );
    mockZipBuffer = readFileSync(fixturePath);
    mockFile = new File([mockZipBuffer], "playwright-report.zip", {
      type: "application/zip",
    });

    // Set up environment variables
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-key";

    // Reset all mocks
    vi.clearAllMocks();

    // Set up default mock for optimizePlaywrightReport to return valid ZIP
    vi.mocked(optimizePlaywrightReport).mockResolvedValue({
      buffer: mockZipBuffer,
      stats: {
        originalSize: mockZipBuffer.length,
        optimizedSize: mockZipBuffer.length * 0.5,
        compressionRatio: 50,
        filesRemoved: 10,
        bytesRemoved: mockZipBuffer.length * 0.5,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when API key is invalid", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: false,
      error: "Invalid API key",
      projectId: "",
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Invalid API key");
  });

  it("should return 400 when required fields are missing", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    // Missing environment, trigger, suite

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Missing required fields");
  });

  it("should return 400 when API key has no project", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "", // No projectId
      error: "",
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("not associated with a project");
  });

  it("should optimize report when shouldOptimize is true", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    vi.mocked(processTestsFromZip).mockResolvedValue({
      tests: [] as any,
      stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
      contentHash: "hash-123",
      branch: "main",
      environment: "production",
      timestamp: new Date().toISOString(),
      ciMetadata: null,
      totalDuration: 0,
      durationFormatted: "0s",
    });

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: {},
      screenshotCount: 0,
    });

    vi.mocked(lookupDatabaseIds).mockResolvedValue({
      success: true,
      data: {
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      },
    });

    vi.mocked(checkDuplicate).mockResolvedValue({
      isDuplicate: false,
    });

    vi.mocked(insertTestRun).mockResolvedValue({
      success: true,
      testRunId: "run-1",
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");
    formData.append("branch", "main");
    formData.append("commit", "abc123");
    formData.append("optimize", "true");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(vi.mocked(optimizePlaywrightReport)).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("should skip optimization when shouldOptimize is false", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    vi.mocked(processTestsFromZip).mockResolvedValue({
      tests: [] as any,
      stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
      contentHash: "hash-123",
      branch: "main",
      environment: "production",
      timestamp: new Date().toISOString(),
      ciMetadata: null,
      totalDuration: 0,
      durationFormatted: "0s",
    });

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: {},
      screenshotCount: 0,
    });

    vi.mocked(lookupDatabaseIds).mockResolvedValue({
      success: true,
      data: {
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      },
    });

    vi.mocked(checkDuplicate).mockResolvedValue({
      isDuplicate: false,
    });

    vi.mocked(insertTestRun).mockResolvedValue({
      success: true,
      testRunId: "run-1",
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");
    formData.append("optimize", "false");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    await POST(request);

    expect(vi.mocked(optimizePlaywrightReport)).not.toHaveBeenCalled();
  });

  it("should return 409 when duplicate is detected", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    vi.mocked(processTestsFromZip).mockResolvedValue({
      tests: [] as any,
      stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
      contentHash: "hash-123",
      branch: "main",
      environment: "production",
      timestamp: new Date().toISOString(),
      ciMetadata: null,
      totalDuration: 0,
      durationFormatted: "0s",
    });

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: {},
      screenshotCount: 0,
    });

    vi.mocked(lookupDatabaseIds).mockResolvedValue({
      success: true,
      data: {
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      },
    });

    vi.mocked(checkDuplicate).mockResolvedValue({
      isDuplicate: true,
      existingRun: {
        id: "existing-run-1",
        timestamp: new Date().toISOString(),
      },
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");
    formData.append("branch", "main");
    formData.append("commit", "abc123");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe("Duplicate upload detected");
    expect(data.isDuplicate).toBe(true);
    expect(data.existingRunId).toBe("existing-run-1");
  });

  it("should successfully upload with all required data", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    const mockTests = [
      {
        id: "test-1",
        name: "should pass",
        file: "test.spec.ts",
        status: "passed",
        duration: 1000,
        screenshots: [],
      },
    ];

    vi.mocked(processTestsFromZip).mockResolvedValue({
      tests: mockTests as any,
      stats: { total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0 },
      contentHash: "hash-123",
      branch: "main",
      environment: "production",
      timestamp: new Date().toISOString(),
      ciMetadata: null,
      totalDuration: 1000,
      durationFormatted: "1s",
    });

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: {},
      screenshotCount: 0,
    });

    vi.mocked(lookupDatabaseIds).mockResolvedValue({
      success: true,
      data: {
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      },
    });

    vi.mocked(checkDuplicate).mockResolvedValue({
      isDuplicate: false,
    });

    vi.mocked(insertTestRun).mockResolvedValue({
      success: true,
      testRunId: "run-1",
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");
    formData.append("branch", "main");
    formData.append("commit", "abc123");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.testRunId).toBe("run-1");
    expect(data.testRun).toBeDefined();
    expect(data.testRun.id).toBe("run-1");
    expect(data.testRun.environment).toBe("production");
    expect(data.testRun.branch).toBe("main");
    expect(data.testRun.commit).toBe("abc123");
    expect(data.message).toContain("Successfully uploaded");
  });

  it("should handle database lookup errors", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    vi.mocked(processTestsFromZip).mockResolvedValue({
      tests: [] as any,
      stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
      contentHash: "hash-123",
      branch: "main",
      environment: "invalid",
      timestamp: new Date().toISOString(),
      ciMetadata: null,
      totalDuration: 0,
      durationFormatted: "0s",
    });

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: {},
      screenshotCount: 0,
    });

    vi.mocked(lookupDatabaseIds).mockResolvedValue({
      success: false,
      error: {
        message: "Environment 'invalid' not found",
        status: 400,
      },
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "invalid");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Environment");
  });

  it("should handle insert errors", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    vi.mocked(processTestsFromZip).mockResolvedValue({
      tests: [] as any,
      stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
      contentHash: "hash-123",
      branch: "main",
      environment: "production",
      timestamp: new Date().toISOString(),
      ciMetadata: null,
      totalDuration: 0,
      durationFormatted: "0s",
    });

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: {},
      screenshotCount: 0,
    });

    vi.mocked(lookupDatabaseIds).mockResolvedValue({
      success: true,
      data: {
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      },
    });

    vi.mocked(checkDuplicate).mockResolvedValue({
      isDuplicate: false,
    });

    vi.mocked(insertTestRun).mockResolvedValue({
      success: false,
      error: "Database error",
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");
    formData.append("branch", "main");
    formData.append("commit", "abc123");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to store test results");
    expect(data.details).toBe("Database error");
  });

  it("should return warning when database is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      projectId: "project-1",
      error: "",
    });

    vi.mocked(processTestsFromZip).mockResolvedValue({
      tests: [] as any,
      stats: { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 },
      contentHash: "hash-123",
      branch: "main",
      environment: "production",
      timestamp: new Date().toISOString(),
      ciMetadata: null,
      totalDuration: 0,
      durationFormatted: "0s",
    });

    vi.mocked(processScreenshots).mockResolvedValue({
      screenshotUrls: {},
      screenshotCount: 0,
    });

    const formData = new FormData();
    formData.append("file", mockFile);
    formData.append("environment", "production");
    formData.append("trigger", "ci");
    formData.append("suite", "e2e");
    formData.append("branch", "main");
    formData.append("commit", "abc123");

    const request = new NextRequest("http://localhost:3000/api/ci-upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.warning).toContain("Database not configured");
  });
});
