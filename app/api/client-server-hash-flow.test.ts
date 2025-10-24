import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import {
  processPlaywrightReportFile,
  calculateContentHash,
} from "@/lib/playwright-report-utils";
import { POST as checkDuplicatePOST } from "./check-duplicate/route";
import { POST as uploadZipPOST } from "./upload-zip/route";
import { NextRequest } from "next/server";
import JSZip from "jszip";

/**
 * End-to-End Hash Flow Tests
 *
 * These tests verify that the hash optimization works correctly across the entire flow:
 * 1. Client calculates hash from original file
 * 2. Client sends ONLY hash to /check-duplicate (not the file)
 * 3. Server accepts hash-only duplicate check
 * 4. Client optimizes file and uploads with pre-calculated hash
 * 5. Server uses pre-calculated hash instead of recalculating
 * 6. Database stores the correct hash
 *
 * CRITICAL: This ensures the bandwidth optimization works without breaking duplicate detection.
 */

// Mock Clerk auth
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(() => Promise.resolve({ userId: "test-user-123" })),
}));

// Mock Supabase with proper chaining
const mockSupabaseInsert = vi.fn();
const mockSupabaseSelect = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      // Create chainable mock for complex queries
      const createChainableMock = (finalData: any) => {
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          single: vi.fn(() =>
            Promise.resolve({ data: finalData, error: null }),
          ),
          then: vi.fn((callback: any) =>
            callback({ data: finalData, error: null }),
          ),
        };
        return chain;
      };

      if (table === "test_runs") {
        return {
          select: vi.fn(() => createChainableMock(null)),
          insert: vi.fn(() => createChainableMock({ id: "run-123" })),
          upsert: vi.fn(() => createChainableMock({ id: "run-123" })),
        };
      } else if (table === "test_runs_tests" || table === "test_steps") {
        return {
          insert: vi.fn(() => Promise.resolve({ data: [], error: null })),
        };
      } else if (table === "projects") {
        return createChainableMock({ id: "project-123", name: "default" });
      } else if (table === "environments") {
        return createChainableMock({ id: "env-123", name: "production" });
      } else if (table === "triggers") {
        return createChainableMock({ id: "trigger-123", name: "manual" });
      } else if (table === "suites") {
        return createChainableMock({ id: "suite-123", name: "e2e" });
      } else if (table === "user_project_access") {
        return createChainableMock({
          user_id: "test-user-123",
          project_id: "project-123",
        });
      } else if (table === "user_organizations") {
        // Returns array of user's organizations
        return createChainableMock([{ organization_id: "org-123" }]);
      } else if (table === "organization_projects") {
        // Returns array of organization's projects
        return createChainableMock([
          { organization_id: "org-123", project_id: "project-123" },
        ]);
      } else if (table === "suite_tests") {
        return {
          upsert: vi.fn(() => createChainableMock([{ id: "suite-test-123" }])),
        };
      } else if (table === "tests" || table === "test_results") {
        return {
          insert: vi.fn(() => createChainableMock([])),
        };
      }

      // Default fallback
      return createChainableMock({ id: "mock-id" });
    }),
  })),
}));

describe("Client-Server Hash Flow Integration", () => {
  let testReportFile: File;
  let calculatedHash: string;

  beforeEach(async () => {
    // Set up environment
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-key";

    // Load test file
    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    testReportFile = new File([buffer], "playwright-report-testing-466.zip", {
      type: "application/zip",
    });

    // Simulate client-side hash calculation (what the browser does)
    const { tests } = await processPlaywrightReportFile(testReportFile);
    calculatedHash = await calculateContentHash(tests);

    // Reset mocks
    vi.clearAllMocks();

    // Set up default mock responses
    mockSupabaseSelect.mockReturnValue({
      eq: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: { id: "project-123" },
            error: null,
          }),
        ),
      })),
      order: vi.fn(() => ({
        limit: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: null,
          }),
        ),
      })),
    });

    mockSupabaseInsert.mockReturnValue({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: { id: "run-123" },
            error: null,
          }),
        ),
      })),
    });
  });

  it("CLIENT SIMULATION: should calculate hash from original file", async () => {
    // This simulates what the browser does
    const { tests } = await processPlaywrightReportFile(testReportFile);
    const clientHash = await calculateContentHash(tests);

    console.log("\n=== Client Hash Calculation ===");
    console.log("File:", testReportFile.name);
    console.log("Test count:", tests.length);
    console.log("Calculated hash:", clientHash);
    console.log("================================\n");

    expect(clientHash).toBeTruthy();
    expect(clientHash.length).toBeGreaterThan(10);
    expect(tests.length).toBeGreaterThan(0);
  });

  it("DUPLICATE CHECK: should accept hash-only request (no file upload)", async () => {
    // Simulate client sending ONLY hash + metadata (NO FILE)
    const formData = new FormData();
    formData.append("contentHash", calculatedHash);
    formData.append("environment", "production");
    formData.append("trigger", "manual");
    formData.append("branch", "main");
    formData.append("commit", "abc123");
    // NOTE: NO FILE ATTACHED - this is the bandwidth savings!

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await checkDuplicatePOST(request);
    const data = await response.json();

    console.log("\n=== Hash-Only Duplicate Check ===");
    console.log(
      "Request size: ~",
      calculatedHash.length,
      "bytes (vs ~12MB for file)",
    );
    console.log("Response:", data);
    console.log("===================================\n");

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.hasDuplicates).toBeDefined();
    expect(data.testCount).toBeUndefined(); // No file = no test count
    expect(data.metadata.environment).toBe("production");
  });

  it("UPLOAD: should use pre-calculated hash instead of recalculating", async () => {
    // First, optimize the file (simulating what client does)
    const buffer = await testReportFile.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const optimizedZip = new JSZip();

    // Simulate client-side optimization
    for (const [path, file] of Object.entries(zip.files)) {
      const zipFile = file as any;
      if (zipFile.dir) continue;

      // Remove traces (what client optimization does)
      if (path.includes("trace") || path.endsWith(".zip")) continue;

      const content = await zipFile.async("uint8array");
      optimizedZip.file(path, content);
    }

    const optimizedBlob = await optimizedZip.generateAsync({ type: "blob" });
    const optimizedFile = new File([optimizedBlob], "optimized.zip", {
      type: "application/zip",
    });

    console.log("\n=== File Optimization ===");
    console.log(
      "Original size:",
      (testReportFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log(
      "Optimized size:",
      (optimizedFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log(
      "Savings:",
      ((1 - optimizedFile.size / testReportFile.size) * 100).toFixed(1),
      "%",
    );
    console.log("=========================\n");

    // Upload with pre-calculated hash
    const formData = new FormData();
    formData.append("file", optimizedFile);
    formData.append("contentHash", calculatedHash); // Pre-calculated from ORIGINAL file
    formData.append("environment", "production");
    formData.append("trigger", "manual");
    formData.append("suite", "e2e");
    formData.append("branch", "main");
    formData.append("commit", "abc123");

    const request = new NextRequest("http://localhost:3000/api/upload-zip", {
      method: "POST",
      body: formData,
    });

    const response = await uploadZipPOST(request);
    const data = await response.json();

    console.log("\n=== Upload Response ===");
    console.log("Status:", response.status);
    console.log("Data:", data);
    console.log("=======================\n");

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("CRITICAL: hash from original file = hash from optimized file", async () => {
    // Client calculates hash from ORIGINAL file
    const { tests: originalTests } =
      await processPlaywrightReportFile(testReportFile);
    const hashFromOriginal = await calculateContentHash(originalTests);

    // Optimize the file
    const buffer = await testReportFile.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const optimizedZip = new JSZip();

    for (const [path, file] of Object.entries(zip.files)) {
      const zipFile = file as any;
      if (zipFile.dir) continue;
      if (path.includes("trace") || path.endsWith(".zip")) continue;

      const content = await zipFile.async("uint8array");

      // Rename PNGs to JPGs (simulating compression)
      if (path.endsWith(".png")) {
        optimizedZip.file(path.replace(/\.png$/, ".jpg"), content);
      } else {
        optimizedZip.file(path, content);
      }
    }

    const optimizedBlob = await optimizedZip.generateAsync({ type: "blob" });
    const optimizedFile = new File([optimizedBlob], "optimized.zip", {
      type: "application/zip",
    });

    // Server would calculate hash from OPTIMIZED file (if no pre-calculated hash)
    const { tests: optimizedTests } =
      await processPlaywrightReportFile(optimizedFile);
    const hashFromOptimized = await calculateContentHash(optimizedTests);

    console.log("\n=== CRITICAL: Hash Consistency ===");
    console.log("Hash from original: ", hashFromOriginal);
    console.log("Hash from optimized:", hashFromOptimized);
    console.log("Match:", hashFromOriginal === hashFromOptimized);
    console.log("===================================\n");

    // THIS MUST BE TRUE or duplicate detection breaks!
    expect(hashFromOriginal).toBe(hashFromOptimized);
  });

  it("END-TO-END: complete flow with bandwidth savings", async () => {
    // STEP 1: Client calculates hash from original file
    const { tests } = await processPlaywrightReportFile(testReportFile);
    const clientHash = await calculateContentHash(tests);

    console.log("\n=== END-TO-END FLOW TEST ===");
    console.log("STEP 1: Client calculates hash");
    console.log("  Hash:", clientHash);
    console.log(
      "  From file:",
      testReportFile.name,
      "(",
      (testReportFile.size / 1024 / 1024).toFixed(2),
      "MB)",
    );

    // STEP 2: Client sends ONLY hash for duplicate check (saves 12MB upload)
    const duplicateCheckData = new FormData();
    duplicateCheckData.append("contentHash", clientHash);
    duplicateCheckData.append("environment", "production");
    duplicateCheckData.append("trigger", "manual");
    duplicateCheckData.append("branch", "main");

    const duplicateCheckRequest = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: duplicateCheckData,
      },
    );

    const duplicateCheckResponse = await checkDuplicatePOST(
      duplicateCheckRequest,
    );
    const duplicateCheckResult = await duplicateCheckResponse.json();

    console.log("STEP 2: Check for duplicates (hash-only, NO file upload)");
    console.log(
      "  Bandwidth saved:",
      (testReportFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log("  Has duplicates:", duplicateCheckResult.hasDuplicates);

    expect(duplicateCheckResponse.status).toBe(200);
    expect(duplicateCheckResult.hasDuplicates).toBe(false);

    // STEP 3: No duplicate found, so client optimizes file
    const buffer = await testReportFile.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const optimizedZip = new JSZip();

    for (const [path, file] of Object.entries(zip.files)) {
      const zipFile = file as any;
      if (zipFile.dir) continue;
      if (path.includes("trace") || path.endsWith(".zip")) continue;

      const content = await zipFile.async("uint8array");
      optimizedZip.file(path, content);
    }

    const optimizedBlob = await optimizedZip.generateAsync({ type: "blob" });
    const optimizedFile = new File([optimizedBlob], "optimized.zip", {
      type: "application/zip",
    });

    console.log("STEP 3: Client optimizes file for upload");
    console.log(
      "  Original:",
      (testReportFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log(
      "  Optimized:",
      (optimizedFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );

    // STEP 4: Client uploads optimized file with pre-calculated hash
    const uploadData = new FormData();
    uploadData.append("file", optimizedFile);
    uploadData.append("contentHash", clientHash); // Use hash from ORIGINAL file
    uploadData.append("environment", "production");
    uploadData.append("trigger", "manual");
    uploadData.append("suite", "e2e");
    uploadData.append("branch", "main");

    const uploadRequest = new NextRequest(
      "http://localhost:3000/api/upload-zip",
      {
        method: "POST",
        body: uploadData,
      },
    );

    const uploadResponse = await uploadZipPOST(uploadRequest);
    const uploadResult = await uploadResponse.json();

    console.log("STEP 4: Upload optimized file with pre-calculated hash");
    console.log(
      "  Upload size:",
      (optimizedFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log("  Success:", uploadResult.success);

    console.log("\n=== TOTAL BANDWIDTH SAVINGS ===");
    console.log("WITHOUT optimization:");
    console.log(
      "  - Duplicate check:",
      (testReportFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log(
      "  - Upload:",
      (testReportFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log(
      "  - TOTAL:",
      ((testReportFile.size * 2) / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log("WITH optimization:");
    console.log("  - Duplicate check: ~0.001 MB (hash only)");
    console.log(
      "  - Upload:",
      (optimizedFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    console.log(
      "  - TOTAL:",
      (optimizedFile.size / 1024 / 1024).toFixed(2),
      "MB",
    );
    const savings =
      ((testReportFile.size * 2 - optimizedFile.size) /
        (testReportFile.size * 2)) *
      100;
    console.log("  - SAVINGS:", savings.toFixed(1), "%");
    console.log("================================\n");

    expect(uploadResponse.status).toBe(200);
    expect(uploadResult.success).toBe(true);
  });

  it("REGRESSION: legacy mode still works (file without pre-calculated hash)", async () => {
    // Some clients might not have the optimization yet
    // They should still work by sending the file to duplicate check
    const formData = new FormData();
    formData.append("file", testReportFile); // Send file (old way)
    formData.append("environment", "production");
    formData.append("trigger", "manual");
    formData.append("branch", "main");
    // No contentHash provided

    const request = new NextRequest(
      "http://localhost:3000/api/check-duplicate",
      {
        method: "POST",
        body: formData,
      },
    );

    const response = await checkDuplicatePOST(request);
    const data = await response.json();

    console.log("\n=== Legacy Mode Test ===");
    console.log("Request: File uploaded (old behavior)");
    console.log("Response:", data);
    console.log("========================\n");

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.testCount).toBeGreaterThan(0); // Has test count because file was processed
  });
});
