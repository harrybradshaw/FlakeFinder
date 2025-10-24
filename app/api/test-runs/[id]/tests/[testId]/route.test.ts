import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

// Mock Supabase
const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mockSupabase),
}));

describe("GET /api/test-runs/[id]/tests/[testId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-key";
  });

  it("should return test details with attemptIndex field mapped from retry_index", async () => {
    const mockTest = {
      id: "test-123",
      suite_test_id: "suite-test-456",
      test_run_id: "run-789",
      status: "failed",
      duration: 5000,
      error: "Test failed",
      screenshots: ["screenshot1.png"],
      started_at: "2025-01-20T10:00:00Z",
      suite_test: {
        name: "Test Name",
        file: "test.spec.ts",
      },
    };

    const mockAttempts = [
      {
        id: "attempt-1",
        test_id: "test-123",
        retry_index: 0,
        status: "failed",
        duration: 2000,
        error: "First attempt failed",
        error_stack: "Stack trace 1",
        screenshots: ["screenshot1.png"],
        attachments: [],
        started_at: "2025-01-20T10:00:00Z",
      },
      {
        id: "attempt-2",
        test_id: "test-123",
        retry_index: 1,
        status: "failed",
        duration: 3000,
        error: "Second attempt failed",
        error_stack: "Stack trace 2",
        screenshots: ["screenshot2.png"],
        attachments: [],
        started_at: "2025-01-20T10:00:05Z",
      },
    ];

    // Mock the database queries
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "tests") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockTest,
                  error: null,
                }),
              }),
            }),
          }),
        };
      } else if (table === "test_results") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockAttempts,
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const request = new NextRequest(
      "http://localhost:3000/api/test-runs/run-789/tests/suite-test-456",
    );
    const params = Promise.resolve({ id: "run-789", testId: "suite-test-456" });

    const response = await GET(request, { params });
    const data = await response.json();

    // Verify response structure
    expect(response.status).toBe(200);
    expect(data).toHaveProperty("test");
    expect(data.test).toHaveProperty("id", "test-123");
    expect(data.test).toHaveProperty("name", "Test Name");
    expect(data.test).toHaveProperty("file", "test.spec.ts");
    expect(data.test).toHaveProperty("status", "failed");
    expect(data.test).toHaveProperty("duration", 5000);
    expect(data.test).toHaveProperty("attempts");

    // CRITICAL: Verify attemptIndex is mapped correctly
    expect(data.test.attempts).toHaveLength(2);
    expect(data.test.attempts[0]).toHaveProperty("attemptIndex", 0);
    expect(data.test.attempts[1]).toHaveProperty("attemptIndex", 1);

    // Verify all attempt fields are present
    expect(data.test.attempts[0]).toEqual({
      attemptIndex: 0,
      retry_index: 0,
      retryIndex: 0,
      id: expect.any(String),
      testResultId: expect.any(String),
      status: "failed",
      duration: 2000,
      error: "First attempt failed",
      error_stack: "Stack trace 1",
      errorStack: "Stack trace 1",
      screenshots: ["screenshot1.png"],
      attachments: [],
      started_at: "2025-01-20T10:00:00Z",
      startTime: "2025-01-20T10:00:00Z",
      stepsUrl: undefined,
      hasSteps: false,
      lastFailedStep: undefined,
    });
  });

  it("should return 404 when test is not found", async () => {
    mockSupabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Not found" },
            }),
          }),
        }),
      }),
    }));

    const request = new NextRequest(
      "http://localhost:3000/api/test-runs/run-789/tests/suite-test-456",
    );
    const params = Promise.resolve({ id: "run-789", testId: "suite-test-456" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toHaveProperty("error", "Test not found");
  });

  it("should handle tests with no attempts", async () => {
    const mockTest = {
      id: "test-123",
      suite_test_id: "suite-test-456",
      test_run_id: "run-789",
      status: "passed",
      duration: 1000,
      error: null,
      screenshots: [],
      started_at: "2025-01-20T10:00:00Z",
      suite_test: {
        name: "Test Name",
        file: "test.spec.ts",
      },
    };

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "tests") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockTest,
                  error: null,
                }),
              }),
            }),
          }),
        };
      } else if (table === "test_results") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const request = new NextRequest(
      "http://localhost:3000/api/test-runs/run-789/tests/suite-test-456",
    );
    const params = Promise.resolve({ id: "run-789", testId: "suite-test-456" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.test.attempts).toEqual([]);
  });

  it("should return 500 when database is not configured", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const request = new NextRequest(
      "http://localhost:3000/api/test-runs/run-789/tests/suite-test-456",
    );
    const params = Promise.resolve({ id: "run-789", testId: "suite-test-456" });

    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toHaveProperty("error", "Database not configured");
  });
});
