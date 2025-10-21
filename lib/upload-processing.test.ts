import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import {
  processScreenshots,
  processTestsFromZip,
  lookupDatabaseIds,
  verifyUserProjectAccess,
  checkDuplicate,
  insertTestRun,
  type ProcessedUpload,
  type DatabaseIds,
} from "./upload-processing";

// Unused helper - kept for reference but can be removed
// Mock Supabase responses are created inline in each test for clarity

describe("upload-processing", () => {
  describe("processScreenshots", () => {
    it("should process screenshots and upload to Supabase Storage", async () => {
      // Create a mock ZIP with screenshots in data/ directory
      const zip = new JSZip();
      zip.file("data/test-screenshot.png", Buffer.from("fake-image-data"));

      // Set environment variables
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

      const result = await processScreenshots(zip, "[Test]");

      expect(result.screenshotCount).toBe(1);
      expect(result.screenshotUrls).toHaveProperty("data/test-screenshot.png");
    });

    it("should handle screenshots when Supabase is not configured", async () => {
      const zip = new JSZip();
      zip.file("data/test.png", Buffer.from("fake-data"));

      // Clear environment variables
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const result = await processScreenshots(zip, "[Test]");

      expect(result.screenshotCount).toBe(1);
      // Should use base64 encoding
      expect(result.screenshotUrls["data/test.png"]).toMatch(/^data:image\/png;base64,/);
    });

    it("should handle empty ZIP (no screenshots)", async () => {
      const zip = new JSZip();

      const result = await processScreenshots(zip, "[Test]");

      expect(result.screenshotCount).toBe(0);
      expect(Object.keys(result.screenshotUrls)).toHaveLength(0);
    });

    it("should determine correct content type for JPEG", async () => {
      const zip = new JSZip();
      zip.file("data/test.jpg", Buffer.from("fake-data"));

      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const result = await processScreenshots(zip);

      expect(result.screenshotUrls["data/test.jpg"]).toMatch(/^data:image\/jpeg;base64,/);
    });
  });

  describe("processTestsFromZip", () => {
    let mockZip: JSZip;

    beforeEach(async () => {
      // Create a realistic Playwright report structure
      mockZip = new JSZip();
      
      const reportData = {
        config: {
          rootDir: "/test",
          version: "1.0.0",
        },
        suites: [
          {
            title: "",
            file: "test.spec.ts",
            column: 0,
            line: 0,
            specs: [
              {
                title: "should pass",
                ok: true,
                testId: "test-1",
                projectName: "chromium",
                outcome: "expected",
                duration: 1000,
                tests: [
                  {
                    expectedStatus: "passed",
                    timeout: 30000,
                    annotations: [],
                    projectName: "chromium",
                    results: [
                      {
                        workerIndex: 0,
                        status: "passed",
                        duration: 1000,
                        errors: [],
                        attachments: [],
                      },
                    ],
                  },
                ],
                results: [
                  {
                    workerIndex: 0,
                    status: "passed",
                    duration: 1000,
                    errors: [],
                    attachments: [],
                    retry: 0,
                    startTime: new Date().toISOString(),
                  },
                ],
              },
            ],
          },
        ],
      };

      mockZip.file("report.json", JSON.stringify(reportData));
    });

    it("should extract tests from ZIP", async () => {
      const result = await processTestsFromZip(
        mockZip,
        "main",
        "production",
        undefined,
        "[Test]",
      );

      expect(result.tests).toBeDefined();
      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.stats).toBeDefined();
      expect(result.contentHash).toBeDefined();
      expect(result.branch).toBe("main");
      expect(result.environment).toBe("production");
    });

    it("should normalize environment names", async () => {
      const result = await processTestsFromZip(
        mockZip,
        "main",
        "prod", // Should be normalized to "production"
        undefined,
        "[Test]",
      );

      // Environment normalization depends on your implementation
      expect(result.environment).toBeDefined();
    });

    it("should use pre-calculated hash if provided", async () => {
      const preCalculatedHash = "test-hash-123";

      const result = await processTestsFromZip(
        mockZip,
        "main",
        "production",
        preCalculatedHash,
        "[Test]",
      );

      expect(result.contentHash).toBe(preCalculatedHash);
    });

    it("should extract CI metadata if available", async () => {
      // Add CI metadata to ZIP
      mockZip.file(
        "ci-metadata.json",
        JSON.stringify({
          branch: "feature-branch",
          commit: "abc123",
        }),
      );

      const result = await processTestsFromZip(
        mockZip,
        "unknown",
        "production",
        undefined,
        "[Test]",
      );

      expect(result.ciMetadata).toBeDefined();
    });
  });

  describe("verifyUserProjectAccess", () => {
    it("should return success when user has access", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "user_organizations") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  data: [{ organization_id: "org-1" }],
                  error: null,
                })),
              })),
            };
          }
          if (table === "organization_projects") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      data: [{ organization_id: "org-1" }],
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      } as any;

      const result = await verifyUserProjectAccess({
        supabase: mockSupabase,
        userId: "user-1",
        projectId: "project-1",
        projectName: "test-project",
        logPrefix: "[Test]",
      });

      expect(result.success).toBe(true);
    });

    it("should return error when user has no organizations", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      } as any;

      const result = await verifyUserProjectAccess({
        supabase: mockSupabase,
        userId: "user-1",
        projectId: "project-1",
        projectName: "test-project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(403);
    });

    it("should return error when user org has no access to project", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "user_organizations") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  data: [{ organization_id: "org-1" }],
                  error: null,
                })),
              })),
            };
          }
          if (table === "organization_projects") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  in: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      data: [],
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      } as any;

      const result = await verifyUserProjectAccess({
        supabase: mockSupabase,
        userId: "user-1",
        projectId: "project-1",
        projectName: "test-project",
      });

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(403);
    });
  });

  describe("lookupDatabaseIds", () => {
    it("should lookup all required IDs successfully", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "environments") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => ({
                      data: { id: "env-1" },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === "test_triggers") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => ({
                      data: { id: "trigger-1" },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          if (table === "suites") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(() => ({
                      data: { id: "suite-1" },
                      error: null,
                    })),
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      } as any;

      const result = await lookupDatabaseIds({
        supabase: mockSupabase,
        projectId: "project-1",
        environment: "production",
        trigger: "ci",
        suite: "e2e",
        logPrefix: "[Test]",
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      });
    });

    it("should return error when environment not found", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: null,
                  error: { message: "Not found" },
                })),
              })),
            })),
          })),
        })),
      } as any;

      const result = await lookupDatabaseIds({
        supabase: mockSupabase,
        projectId: "project-1",
        environment: "invalid",
        trigger: "ci",
        suite: "e2e",
      });

      expect(result.success).toBe(false);
      expect(result.error?.status).toBe(400);
      expect(result.error?.message).toContain("Environment");
    });

    it("should lookup project by name if projectId not provided", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => {
                  if (table === "projects") {
                    return { data: { id: "project-1" }, error: null };
                  }
                  if (table === "environments") {
                    return { data: { id: "env-1" }, error: null };
                  }
                  if (table === "test_triggers") {
                    return { data: { id: "trigger-1" }, error: null };
                  }
                  if (table === "suites") {
                    return { data: { id: "suite-1" }, error: null };
                  }
                  return { data: null, error: null };
                }),
              })),
            })),
          })),
        })),
      } as any;

      const result = await lookupDatabaseIds({
        supabase: mockSupabase,
        projectName: "test-project",
        environment: "production",
        trigger: "ci",
        suite: "e2e",
      });

      expect(result.success).toBe(true);
      expect(result.data?.projectId).toBe("project-1");
    });
  });

  describe("checkDuplicate", () => {
    it("should return not duplicate when no existing run found", async () => {
      const mockSupabase = {
        from: vi.fn(() => {
          const selectMock = vi.fn(() => {
            const eqMock1 = vi.fn(() => {
              const eqMock2 = vi.fn(() => {
                const orderMock = vi.fn(() => {
                  const limitMock = vi.fn(() => ({
                    data: [],
                    error: null,
                  }));
                  return { limit: limitMock };
                });
                return { order: orderMock };
              });
              return { eq: eqMock2, order: vi.fn(() => ({ limit: vi.fn(() => ({ data: [], error: null })) })) };
            });
            return { eq: eqMock1 };
          });
          return { select: selectMock };
        }),
      } as any;

      const result = await checkDuplicate({
        supabase: mockSupabase,
        contentHash: "hash-123",
        projectId: "project-1",
        logPrefix: "[Test]",
      });

      expect(result.isDuplicate).toBe(false);
    });

    it("should return duplicate when existing run found", async () => {
      const existingRun = {
        id: "run-1",
        timestamp: new Date().toISOString(),
      };

      const mockSupabase = {
        from: vi.fn(() => {
          const selectMock = vi.fn(() => {
            const eqMock1 = vi.fn(() => {
              const eqMock2 = vi.fn(() => {
                const orderMock = vi.fn(() => {
                  const limitMock = vi.fn(() => ({
                    data: [existingRun],
                    error: null,
                  }));
                  return { limit: limitMock };
                });
                return { order: orderMock };
              });
              return { eq: eqMock2, order: vi.fn(() => ({ limit: vi.fn(() => ({ data: [existingRun], error: null })) })) };
            });
            return { eq: eqMock1 };
          });
          return { select: selectMock };
        }),
      } as any;

      const result = await checkDuplicate({
        supabase: mockSupabase,
        contentHash: "hash-123",
        projectId: "project-1",
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.existingRun).toEqual(existingRun);
    });

    it("should check duplicates without project scope if projectId not provided", async () => {
      const mockSupabase = {
        from: vi.fn(() => {
          const selectMock = vi.fn(() => {
            const eqMock = vi.fn(() => {
              const orderMock = vi.fn(() => {
                const limitMock = vi.fn(() => ({
                  data: [],
                  error: null,
                }));
                return { limit: limitMock };
              });
              return { order: orderMock };
            });
            return { eq: eqMock };
          });
          return { select: selectMock };
        }),
      } as any;

      const result = await checkDuplicate({
        supabase: mockSupabase,
        contentHash: "hash-123",
      });

      expect(result.isDuplicate).toBe(false);
    });
  });

  describe("insertTestRun", () => {
    let mockDatabaseIds: DatabaseIds;
    let mockProcessedData: ProcessedUpload;

    beforeEach(() => {
      mockDatabaseIds = {
        projectId: "project-1",
        environmentId: "env-1",
        triggerId: "trigger-1",
        suiteId: "suite-1",
      };

      mockProcessedData = {
        tests: [
          {
            id: "test-1",
            name: "should pass",
            file: "test.spec.ts",
            status: "passed",
            duration: 1000,
            screenshots: [],
            attempts: [],
          },
        ] as any,
        stats: {
          total: 1,
          passed: 1,
          failed: 0,
          flaky: 0,
          skipped: 0,
        },
        contentHash: "hash-123",
        branch: "main",
        environment: "production",
        timestamp: new Date().toISOString(),
        ciMetadata: null,
        totalDuration: 1000,
        durationFormatted: "1s",
      };
    });

    it("should insert test run successfully", async () => {
      const runData = { id: "run-1" };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "test_runs") {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() => ({
                    data: runData,
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === "suite_tests") {
            return {
              upsert: vi.fn(() => ({
                select: vi.fn(() => ({
                  data: [{ id: "st-1", file: "test.spec.ts", name: "should pass" }],
                  error: null,
                })),
              })),
            };
          }
          if (table === "tests") {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  data: [{ id: "t-1" }],
                  error: null,
                })),
              })),
            };
          }
          return {};
        }),
      } as any;

      const result = await insertTestRun({
        supabase: mockSupabase,
        databaseIds: mockDatabaseIds,
        processedData: mockProcessedData,
        commit: "abc123",
        filename: "test.zip",
        logPrefix: "[Test]",
      });

      expect(result.success).toBe(true);
      expect(result.testRunId).toBe("run-1");
    });

    it("should return error when test run insertion fails", async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => ({
                data: null,
                error: { message: "Insert failed" },
              })),
            })),
          })),
        })),
      } as any;

      const result = await insertTestRun({
        supabase: mockSupabase,
        databaseIds: mockDatabaseIds,
        processedData: mockProcessedData,
        commit: "abc123",
        filename: "test.zip",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to create test run");
    });

    it("should insert test results for tests with retries", async () => {
      const processedDataWithRetries = {
        ...mockProcessedData,
        tests: [
          {
            ...mockProcessedData.tests[0],
            attempts: [
              {
                retryIndex: 0,
                status: "failed",
                duration: 500,
                error: "Test failed",
                errorStack: "Error stack",
                screenshots: [],
                attachments: [],
              },
              {
                retryIndex: 1,
                status: "passed",
                duration: 500,
                screenshots: [],
                attachments: [],
              },
            ],
          },
        ] as any,
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "test_runs") {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() => ({
                    data: { id: "run-1" },
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === "suite_tests") {
            return {
              upsert: vi.fn(() => ({
                select: vi.fn(() => ({
                  data: [{ id: "st-1", file: "test.spec.ts", name: "should pass" }],
                  error: null,
                })),
              })),
            };
          }
          if (table === "tests") {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  data: [{ id: "t-1" }],
                  error: null,
                })),
              })),
            };
          }
          if (table === "test_results") {
            return {
              insert: vi.fn(() => ({
                data: null,
                error: null,
              })),
            };
          }
          return {};
        }),
      } as any;

      const result = await insertTestRun({
        supabase: mockSupabase,
        databaseIds: mockDatabaseIds,
        processedData: processedDataWithRetries,
        commit: "abc123",
        filename: "test.zip",
      });

      expect(result.success).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith("test_results");
    });
  });
});
