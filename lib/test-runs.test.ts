import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getTestRunById, getTestRun } from "./test-runs";

// Mock Supabase
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

describe("test-runs", () => {
  let mockSupabaseClient: any;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock Supabase client
    mockSupabaseClient = {
      from: vi.fn(),
    };

    const { createClient } = await import("@supabase/supabase-js");
    vi.mocked(createClient).mockReturnValue(mockSupabaseClient);

    // Set environment variables
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getTestRunById", () => {
    it("should fetch and transform test run with attempts correctly", async () => {
      const mockTestRun = {
        id: "run-123",
        timestamp: "2025-01-20T10:00:00Z",
        project_id: "proj-1",
        branch: "main",
        commit: "abc123",
        total: 10,
        passed: 7,
        failed: 2,
        flaky: 1,
        skipped: 0,
        duration: 120000,
        ci_metadata: { buildHref: "https://github.com/test/actions/123" },
        project: { name: "test-project", display_name: "Test Project", color: "#ff0000" },
        environment: { name: "production", display_name: "Production", color: "#00ff00" },
        trigger: { name: "ci", display_name: "CI", icon: "🔄" },
      };

      const mockTests = [
        {
          id: "test-1",
          suite_test_id: "suite-test-1",
          status: "flaky",
          duration: 5000,
          worker_index: 1,
          started_at: "2025-01-20T10:00:05Z",
          error: null,
          screenshots: ["screenshot1.png"],
          suite_test: { id: "suite-test-1", name: "Test 1", file: "test1.spec.ts" },
        },
        {
          id: "test-2",
          suite_test_id: "suite-test-2",
          status: "passed",
          duration: 3000,
          worker_index: 2,
          started_at: "2025-01-20T10:00:10Z",
          error: null,
          screenshots: [],
          suite_test: { id: "suite-test-2", name: "Test 2", file: "test2.spec.ts" },
        },
      ];

      const mockTestAttempts = [
        // Test 1 - flaky with 2 attempts
        {
          id: "attempt-1",
          test_id: "test-1",
          retry_index: 0,
          status: "failed",
          duration: 2500,
          error: "Test failed on first attempt",
          error_stack: "Error stack trace",
          screenshots: ["screenshot1-attempt1.png"],
          attachments: [{ name: "log.txt", contentType: "text/plain", content: "logs" }],
          started_at: "2025-01-20T10:00:05Z",
        },
        {
          id: "attempt-2",
          test_id: "test-1",
          retry_index: 1,
          status: "passed",
          duration: 2500,
          error: null,
          error_stack: null,
          screenshots: ["screenshot1-attempt2.png"],
          attachments: [],
          started_at: "2025-01-20T10:00:07.5Z",
        },
        // Test 2 - passed with 1 attempt
        {
          id: "attempt-3",
          test_id: "test-2",
          retry_index: 0,
          status: "passed",
          duration: 3000,
          error: null,
          error_stack: null,
          screenshots: [],
          attachments: [],
          started_at: "2025-01-20T10:00:10Z",
        },
      ];

      // Mock test_runs query
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockTestRun, error: null }),
              }),
            }),
          };
        }
        if (table === "tests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ data: mockTests, error: null }),
              }),
            }),
          };
        }
        if (table === "test_results") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({ data: mockTestAttempts, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRunById("run-123");

      expect(result).toBeDefined();
      expect(result?.id).toBe("run-123");
      expect(result?.project).toBe("test-project");
      expect(result?.project_display).toBe("Test Project");
      expect(result?.project_color).toBe("#ff0000");
      expect(result?.environment).toBe("production");
      expect(result?.environment_display).toBe("Production");
      expect(result?.environment_color).toBe("#00ff00");
      expect(result?.trigger).toBe("ci");
      expect(result?.trigger_display).toBe("CI");
      expect(result?.trigger_icon).toBe("🔄");
      expect(result?.branch).toBe("main");
      expect(result?.commit).toBe("abc123");
      expect(result?.duration).toBe("2m 0s");
      expect(result?.ci_metadata).toEqual({ buildHref: "https://github.com/test/actions/123" });

      // Verify tests transformation
      expect(result?.tests).toHaveLength(2);

      // Test 1 - flaky with attempts
      const test1 = result?.tests?.[0];
      expect(test1?.id).toBe("test-1");
      expect(test1?.name).toBe("Test 1");
      expect(test1?.file).toBe("test1.spec.ts");
      expect(test1?.status).toBe("flaky");
      expect(test1?.duration).toBe(5000);
      expect(test1?.attempts).toHaveLength(2);

      // Verify retry_index -> attemptIndex transformation
      expect(test1?.attempts?.[0]).toMatchObject({
        attemptIndex: 0,
        status: "failed",
        duration: 2500,
        error: "Test failed on first attempt",
        errorStack: "Error stack trace",
        screenshots: ["screenshot1-attempt1.png"],
        startTime: "2025-01-20T10:00:05Z",
      });
      expect(test1?.attempts?.[0].attachments).toHaveLength(1);

      expect(test1?.attempts?.[1]).toMatchObject({
        attemptIndex: 1,
        status: "passed",
        duration: 2500,
        screenshots: ["screenshot1-attempt2.png"],
        startTime: "2025-01-20T10:00:07.5Z",
      });

      // Test 2 - passed with single attempt
      const test2 = result?.tests?.[1];
      expect(test2?.id).toBe("test-2");
      expect(test2?.name).toBe("Test 2");
      expect(test2?.attempts).toHaveLength(1);
      expect(test2?.attempts?.[0]).toMatchObject({
        attemptIndex: 0,
        status: "passed",
        duration: 3000,
      });
    });

    it("should handle test run with no attempts", async () => {
      const mockTestRun = {
        id: "run-456",
        timestamp: "2025-01-20T11:00:00Z",
        project_id: "proj-1",
        branch: "feature",
        commit: "def456",
        total: 1,
        passed: 1,
        failed: 0,
        flaky: 0,
        skipped: 0,
        duration: 5000,
        ci_metadata: {},
        project: { name: "test-project", display_name: "Test Project", color: "#ff0000" },
        environment: { name: "staging", display_name: "Staging", color: "#00ff00" },
        trigger: { name: "manual", display_name: "Manual", icon: "👤" },
      };

      const mockTests = [
        {
          id: "test-3",
          suite_test_id: "suite-test-3",
          status: "passed",
          duration: 5000,
          worker_index: null,
          started_at: null,
          error: null,
          screenshots: [],
          suite_test: { id: "suite-test-3", name: "Test 3", file: "test3.spec.ts" },
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockTestRun, error: null }),
              }),
            }),
          };
        }
        if (table === "tests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ data: mockTests, error: null }),
              }),
            }),
          };
        }
        if (table === "test_results") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRunById("run-456");

      expect(result).toBeDefined();
      expect(result?.tests).toHaveLength(1);
      expect(result?.tests?.[0].attempts).toEqual([]);
    });

    it("should return null when test run not found", async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: { code: "PGRST116" } }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRunById("nonexistent");

      expect(result).toBeNull();
    });

    it("should throw error when database query fails", async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: "PGRST500", message: "Database error" },
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(getTestRunById("run-123")).rejects.toThrow(
        "Error fetching test run: Database error",
      );
    });

    it("should handle missing suite_test data gracefully", async () => {
      const mockTestRun = {
        id: "run-789",
        timestamp: "2025-01-20T12:00:00Z",
        project_id: "proj-1",
        branch: "main",
        commit: "ghi789",
        total: 1,
        passed: 1,
        failed: 0,
        flaky: 0,
        skipped: 0,
        duration: 2000,
        ci_metadata: null,
        project: { name: "test-project", display_name: "Test Project", color: "#ff0000" },
        environment: { name: "production", display_name: "Production", color: "#00ff00" },
        trigger: { name: "ci", display_name: "CI", icon: "🔄" },
      };

      const mockTests = [
        {
          id: "test-4",
          suite_test_id: null,
          status: "passed",
          duration: 2000,
          worker_index: null,
          started_at: null,
          error: null,
          screenshots: [],
          suite_test: null,
        },
      ];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockTestRun, error: null }),
              }),
            }),
          };
        }
        if (table === "tests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ data: mockTests, error: null }),
              }),
            }),
          };
        }
        if (table === "test_results") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRunById("run-789");

      expect(result).toBeDefined();
      expect(result?.tests?.[0].name).toBe("Unknown Test");
      expect(result?.tests?.[0].file).toBe("unknown");
      expect(result?.tests?.[0].suite_test_id).toBeUndefined();
    });

    it("should handle null ci_metadata correctly", async () => {
      const mockTestRun = {
        id: "run-999",
        timestamp: "2025-01-20T13:00:00Z",
        project_id: "proj-1",
        branch: "main",
        commit: "jkl999",
        total: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
        duration: 0,
        ci_metadata: null,
        project: { name: "test-project", display_name: "Test Project", color: "#ff0000" },
        environment: { name: "production", display_name: "Production", color: "#00ff00" },
        trigger: { name: "ci", display_name: "CI", icon: "🔄" },
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockTestRun, error: null }),
              }),
            }),
          };
        }
        if (table === "tests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "test_results") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRunById("run-999");

      expect(result).toBeDefined();
      expect(result?.ci_metadata).toEqual({});
    });

    it("should handle array ci_metadata correctly", async () => {
      const mockTestRun = {
        id: "run-888",
        timestamp: "2025-01-20T14:00:00Z",
        project_id: "proj-1",
        branch: "main",
        commit: "mno888",
        total: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
        duration: 0,
        ci_metadata: ["invalid", "array"],
        project: { name: "test-project", display_name: "Test Project", color: "#ff0000" },
        environment: { name: "production", display_name: "Production", color: "#00ff00" },
        trigger: { name: "ci", display_name: "CI", icon: "🔄" },
      };

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockTestRun, error: null }),
              }),
            }),
          };
        }
        if (table === "tests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "test_results") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRunById("run-888");

      expect(result).toBeDefined();
      expect(result?.ci_metadata).toEqual({});
    });

    it("should throw error when SUPABASE_URL is not set", async () => {
      delete process.env.SUPABASE_URL;

      await expect(getTestRunById("run-123")).rejects.toThrow(
        "Database not configured",
      );
    });

    it("should throw error when SUPABASE_ANON_KEY is not set", async () => {
      delete process.env.SUPABASE_ANON_KEY;

      await expect(getTestRunById("run-123")).rejects.toThrow(
        "Database not configured",
      );
    });
  });

  describe("getTestRun (with authorization)", () => {
    it("should fetch test run when user has access", async () => {
      const mockTestRun = {
        id: "run-auth-1",
        timestamp: "2025-01-20T15:00:00Z",
        project_id: "proj-1",
        branch: "main",
        commit: "pqr111",
        total: 5,
        passed: 5,
        failed: 0,
        flaky: 0,
        skipped: 0,
        duration: 10000,
        ci_metadata: {},
        project: { name: "test-project", display_name: "Test Project", color: "#ff0000" },
        environment: { name: "production", display_name: "Production", color: "#00ff00" },
        trigger: { name: "ci", display_name: "CI", icon: "🔄" },
      };

      const mockUserOrgs = [{ organization_id: "org-1" }];
      const mockOrgProjects = [{ project_id: "proj-1", organization_id: "org-1" }];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "user_organizations") {
          return {
            select: () => ({
              eq: () => ({ data: mockUserOrgs, error: null }),
            }),
          };
        }
        if (table === "organization_projects") {
          return {
            select: () => ({
              in: () => ({ data: mockOrgProjects, error: null }),
            }),
          };
        }
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockTestRun, error: null }),
              }),
            }),
          };
        }
        if (table === "tests") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "test_results") {
          return {
            select: () => ({
              in: () => ({
                order: () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRun("run-auth-1", "user-123");

      expect(result).toBeDefined();
      expect(result?.id).toBe("run-auth-1");
    });

    it("should return null when user has no organizations", async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "user_organizations") {
          return {
            select: () => ({
              eq: () => ({ data: [], error: null }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRun("run-auth-1", "user-123");

      expect(result).toBeNull();
    });

    it("should return null when user has no accessible projects", async () => {
      const mockUserOrgs = [{ organization_id: "org-1" }];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "user_organizations") {
          return {
            select: () => ({
              eq: () => ({ data: mockUserOrgs, error: null }),
            }),
          };
        }
        if (table === "organization_projects") {
          return {
            select: () => ({
              in: () => ({ data: [], error: null }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRun("run-auth-1", "user-123");

      expect(result).toBeNull();
    });

    it("should return null when user does not have access to test run project", async () => {
      const mockTestRun = {
        id: "run-auth-2",
        timestamp: "2025-01-20T16:00:00Z",
        project_id: "proj-2",
        branch: "main",
        commit: "stu222",
        total: 5,
        passed: 5,
        failed: 0,
        flaky: 0,
        skipped: 0,
        duration: 10000,
        ci_metadata: {},
        project: { name: "test-project", display_name: "Test Project", color: "#ff0000" },
        environment: { name: "production", display_name: "Production", color: "#00ff00" },
        trigger: { name: "ci", display_name: "CI", icon: "🔄" },
      };

      const mockUserOrgs = [{ organization_id: "org-1" }];
      const mockOrgProjects = [{ project_id: "proj-1", organization_id: "org-1" }];

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === "user_organizations") {
          return {
            select: () => ({
              eq: () => ({ data: mockUserOrgs, error: null }),
            }),
          };
        }
        if (table === "organization_projects") {
          return {
            select: () => ({
              in: () => ({ data: mockOrgProjects, error: null }),
            }),
          };
        }
        if (table === "test_runs") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: mockTestRun, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const result = await getTestRun("run-auth-2", "user-123");

      expect(result).toBeNull();
    });
  });
});
