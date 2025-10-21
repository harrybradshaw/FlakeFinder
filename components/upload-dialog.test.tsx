import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { UploadDialog } from "./upload-dialog";
import { readFileSync } from "fs";

/**
 * Component tests for UploadDialog
 *
 * These tests verify the UI behavior, especially duplicate detection warnings
 */

// Mock SWR
vi.mock("swr", () => ({
  default: () => ({
    data: undefined,
    error: undefined,
    isLoading: false,
  }),
  useSWRConfig: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock("swr/immutable", () => ({
  default: () => ({
    data: {
      environments: [
        { id: "1", name: "production" },
        { id: "2", name: "staging" },
      ],
      triggers: [
        { id: "1", name: "manual" },
        { id: "2", name: "CI" },
      ],
      suites: [{ id: "1", name: "e2e" }],
    },
    error: undefined,
    isLoading: false,
  }),
}));

// Mock fetch
global.fetch = vi.fn();

describe.skip("UploadDialog - Duplicate Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock crypto.subtle.digest for hash calculation
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new ArrayBuffer(32));
  });

  it("should show duplicate warning when duplicate is detected", async () => {
    // Mock the check-duplicate API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        testCount: 10,
        hasDuplicates: true,
        duplicateCount: 1,
        existingRun: {
          id: "1067b1a1-4abd-43a7-a0ff-904eb2803806",
          timestamp: "2025-10-19T15:54:08.856+00:00",
        },
        metadata: {
          environment: "production",
          trigger: "manual",
          branch: "main",
          commit: "abc123",
        },
      }),
    });

    render(<UploadDialog />);

    // Open the dialog
    const uploadButton = screen.getByRole("button", {
      name: /upload results/i,
    });
    fireEvent.click(uploadButton);

    // Load test file
    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    const file = new File([buffer], "test-report.zip", {
      type: "application/zip",
    });

    // Find file input and upload
    const fileInput = screen.getByLabelText(
      /html report zip/i,
    ) as HTMLInputElement;

    // Simulate file selection
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Wait for duplicate check to complete
    await waitFor(
      () => {
        // Should show duplicate warning
        expect(
          screen.getByText(/duplicate test run detected/i),
        ).toBeInTheDocument();
      },
      { timeout: 15000 },
    );

    // Should show existing run info
    expect(screen.getByText(/1067b1a1/)).toBeInTheDocument();
  }, 20000);

  it("should NOT show duplicate warning when no duplicate exists", async () => {
    // Mock the check-duplicate API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        testCount: 10,
        hasDuplicates: false,
        duplicateCount: 0,
        metadata: {
          environment: "production",
          trigger: "manual",
          branch: "main",
          commit: "abc123",
        },
      }),
    });

    render(<UploadDialog />);

    // Open the dialog
    const uploadButton = screen.getByRole("button", {
      name: /upload results/i,
    });
    fireEvent.click(uploadButton);

    // Load test file
    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    const file = new File([buffer], "test-report.zip", {
      type: "application/zip",
    });

    // Find file input and upload
    const fileInput = screen.getByLabelText(
      /html report zip/i,
    ) as HTMLInputElement;

    // Simulate file selection
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Wait for processing
    await waitFor(
      () => {
        // Should NOT show duplicate warning
        expect(
          screen.queryByText(/duplicate test run detected/i),
        ).not.toBeInTheDocument();
      },
      { timeout: 15000 },
    );
  }, 20000);

  it("should call check-duplicate API with pre-calculated hash", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        testCount: 10,
        hasDuplicates: false,
        duplicateCount: 0,
        metadata: {},
      }),
    });

    global.fetch = mockFetch;

    render(<UploadDialog />);

    // Open the dialog
    const uploadButton = screen.getByRole("button", {
      name: /upload results/i,
    });
    fireEvent.click(uploadButton);

    // Load test file
    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    const file = new File([buffer], "test-report.zip", {
      type: "application/zip",
    });

    // Find file input and upload
    const fileInput = screen.getByLabelText(
      /html report zip/i,
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Wait for API call
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/check-duplicate",
          expect.objectContaining({
            method: "POST",
          }),
        );
      },
      { timeout: 15000 },
    );

    // Verify the FormData includes contentHash
    const callArgs = mockFetch.mock.calls[0];
    const formData = callArgs[1].body as FormData;

    expect(formData.get("contentHash")).toBeTruthy();
    expect(typeof formData.get("contentHash")).toBe("string");

    // Hash should be 64 characters (SHA-256 hex)
    const hash = formData.get("contentHash") as string;
    expect(hash.length).toBe(64);
  }, 20000);

  it("should show checking status during duplicate check", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        testCount: 10,
        hasDuplicates: false,
        duplicateCount: 0,
        metadata: {},
      }),
    });

    render(<UploadDialog />);

    // Open the dialog
    const uploadButton = screen.getByRole("button", {
      name: /upload results/i,
    });
    fireEvent.click(uploadButton);

    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    const file = new File([buffer], "test-report.zip", {
      type: "application/zip",
    });

    const fileInput = screen.getByLabelText(
      /html report zip/i,
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Should show "Checking..." status during duplicate check
    await waitFor(
      () => {
        expect(screen.getByText(/checking/i)).toBeInTheDocument();
      },
      { timeout: 15000 },
    );
  }, 20000);

  it("CRITICAL: should use same hash for duplicate check and upload", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          testCount: 10,
          hasDuplicates: false,
          duplicateCount: 0,
          metadata: {},
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          testRun: {
            id: "test-run-id",
            total: 10,
            passed: 8,
            failed: 2,
          },
        }),
      });

    global.fetch = mockFetch;

    render(<UploadDialog />);

    // Open the dialog
    const uploadButton = screen.getByRole("button", {
      name: /upload results/i,
    });
    fireEvent.click(uploadButton);

    const buffer = readFileSync(
      "/Users/harbra/Downloads/playwright-report-testing-466.zip",
    );
    const file = new File([buffer], "test-report.zip", {
      type: "application/zip",
    });

    const fileInput = screen.getByLabelText(
      /html report zip/i,
    ) as HTMLInputElement;

    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Wait for duplicate check
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/check-duplicate",
          expect.any(Object),
        );
      },
      { timeout: 15000 },
    );

    // Get hash from duplicate check
    const duplicateCheckFormData = mockFetch.mock.calls[0][1].body as FormData;
    const duplicateCheckHash = duplicateCheckFormData.get(
      "contentHash",
    ) as string;

    // Now proceed to upload
    const submitButton = screen.getByRole("button", { name: /upload/i });
    fireEvent.click(submitButton);

    // Wait for upload
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/upload-zip",
          expect.any(Object),
        );
      },
      { timeout: 15000 },
    );

    // Get hash from upload
    const uploadFormData = mockFetch.mock.calls[1][1].body as FormData;
    const uploadHash = uploadFormData.get("contentHash") as string;

    // CRITICAL: Both hashes must be identical!
    expect(duplicateCheckHash).toBe(uploadHash);
    expect(duplicateCheckHash).toBeTruthy();
  }, 40000);
});
