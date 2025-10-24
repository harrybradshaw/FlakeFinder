import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { readFileSync } from "fs";

// Mock the Supabase client
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              data: null,
              error: null,
            })),
          })),
        })),
      })),
    })),
  })),
}));

describe("POST /api/check-duplicate", () => {
  let testReportFile: File;

  beforeEach(() => {
    // Load the sample test report
    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    testReportFile = new File([buffer], "playwright-report-testing-466.zip", {
      type: "application/zip",
    });

    // Set up environment variables
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-key";
  });

  it("should return 400 when both file and contentHash are missing", async () => {
    const formData = new FormData();
    formData.append("environment", "production");
    formData.append("trigger", "manual");
    formData.append("branch", "main");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
    expect(data.details).toContain("contentHash or file");
  });

  it("should return 400 when environment is missing", async () => {
    const formData = new FormData();
    formData.append("file", testReportFile);
    formData.append("trigger", "manual");
    formData.append("branch", "main");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
    expect(data.details).toContain("environment");
  });

  it("should return 400 when trigger is missing", async () => {
    const formData = new FormData();
    formData.append("file", testReportFile);
    formData.append("environment", "production");
    formData.append("branch", "main");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
    expect(data.details).toContain("trigger");
  });

  it("should return 400 when branch is missing", async () => {
    const formData = new FormData();
    formData.append("file", testReportFile);
    formData.append("environment", "production");
    formData.append("trigger", "manual");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing required fields");
    expect(data.details).toContain("branch");
  });

  it("should process valid request and return duplicate check result", async () => {
    const formData = new FormData();
    formData.append("file", testReportFile);
    formData.append("environment", "production");
    formData.append("trigger", "manual");
    formData.append("branch", "main");
    formData.append("commit", "abc123");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.testCount).toBeGreaterThan(0);
    expect(data.hasDuplicates).toBeDefined();
    expect(data.duplicateCount).toBeDefined();
    expect(data.metadata).toBeDefined();
    expect(data.metadata.environment).toBe("production");
    expect(data.metadata.trigger).toBe("manual");
    expect(data.metadata.branch).toBe("main");
    expect(data.metadata.commit).toBe("abc123");
  });

  it("should handle commit as optional field", async () => {
    const formData = new FormData();
    formData.append("file", testReportFile);
    formData.append("environment", "staging");
    formData.append("trigger", "ci");
    formData.append("branch", "develop");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.metadata.commit).toBeNull();
  });

  it("should calculate consistent hash for same test data", async () => {
    const formData1 = new FormData();
    formData1.append("file", testReportFile);
    formData1.append("environment", "production");
    formData1.append("trigger", "manual");
    formData1.append("branch", "main");
    formData1.append("commit", "abc123");

    const request1 = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData1,
      },
    );

    const response1 = await POST(request1);
    const data1 = await response1.json();

    // Create a second identical request
    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    const testReportFile2 = new File(
      [buffer],
      "playwright-report-testing-466.zip",
      {
        type: "application/zip",
      },
    );

    const formData2 = new FormData();
    formData2.append("file", testReportFile2);
    formData2.append("environment", "production");
    formData2.append("trigger", "manual");
    formData2.append("branch", "main");
    formData2.append("commit", "abc123");

    const request2 = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData2,
      },
    );

    const response2 = await POST(request2);
    const data2 = await response2.json();

    // Both should succeed and have the same test count
    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(data1.testCount).toBe(data2.testCount);
  });

  it("should return error for invalid file format", async () => {
    const invalidFile = new File(["invalid content"], "invalid.txt", {
      type: "text/plain",
    });

    const formData = new FormData();
    formData.append("file", invalidFile);
    formData.append("environment", "production");
    formData.append("trigger", "manual");
    formData.append("branch", "main");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    // Invalid ZIP files return 500 (internal server error)
    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
    expect(data.details).toBeDefined();
  });

  it("should accept hash-only request without file (efficient mode)", async () => {
    const formData = new FormData();
    formData.append("contentHash", "abc123hash456def");
    formData.append("environment", "production");
    formData.append("trigger", "manual");
    formData.append("branch", "main");
    formData.append("commit", "abc123");

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hasDuplicates).toBeDefined();
    expect(data.testCount).toBeUndefined(); // No test count in hash-only mode
    expect(data.metadata).toBeDefined();
    expect(data.metadata.environment).toBe("production");
    expect(data.metadata.trigger).toBe("manual");
    expect(data.metadata.branch).toBe("main");
    expect(data.metadata.commit).toBe("abc123");
  });
});
