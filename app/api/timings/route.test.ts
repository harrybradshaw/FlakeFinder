import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

const mockGetFileTimings = vi.fn();
const mockGetEnvironmentByName = vi.fn();
const mockGetTriggerByName = vi.fn();

vi.mock("@/lib/api-key-auth", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("@/lib/repositories", () => ({
  createRepositories: vi.fn(() => ({
    metrics: {
      getFileTimings: mockGetFileTimings,
    },
    lookups: {
      getEnvironmentByName: mockGetEnvironmentByName,
      getTriggerByName: mockGetTriggerByName,
    },
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({})),
}));

import { authenticateApiKey } from "@/lib/api-key-auth";

function buildRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost:3000/api/timings${query}`);
}

describe("GET /api/timings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileTimings.mockReset();
    mockGetEnvironmentByName.mockReset();
    mockGetTriggerByName.mockReset();

    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-key";

    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: true,
      error: "",
      projectId: "project-1",
      suiteId: "suite-1",
    });

    mockGetFileTimings.mockResolvedValue([]);
    mockGetEnvironmentByName.mockResolvedValue(null);
    mockGetTriggerByName.mockResolvedValue(null);
  });

  it("returns 401 when the API key is invalid", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      valid: false,
      error: "Invalid key",
      projectId: "",
      suiteId: "",
    });

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Invalid key");
    expect(mockGetFileTimings).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase env vars are missing", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Database not configured");
    expect(mockGetFileTimings).not.toHaveBeenCalled();
  });

  it("returns 200 with a files map built from repository rows", async () => {
    mockGetFileTimings.mockResolvedValue([
      { file: "a.spec.ts", expected_duration_ms: 1200, sample_size: 4 },
      { file: "b.spec.ts", expected_duration_ms: 800, sample_size: 2 },
    ]);

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.suiteId).toBe("suite-1");
    expect(data.files).toEqual({
      "a.spec.ts": 1200,
      "b.spec.ts": 800,
    });
    expect(typeof data.generatedAt).toBe("string");
  });

  it("defaults windowDays to 14 when not provided", async () => {
    const response = await GET(buildRequest());
    const data = await response.json();

    expect(data.windowDays).toBe(14);
  });

  it("clamps windowDays of 0 up to 1", async () => {
    const response = await GET(buildRequest("?windowDays=0"));
    const data = await response.json();

    expect(data.windowDays).toBe(1);
  });

  it("clamps windowDays of 9999 down to 90", async () => {
    const response = await GET(buildRequest("?windowDays=9999"));
    const data = await response.json();

    expect(data.windowDays).toBe(90);
  });

  it("falls back to 14 when windowDays is not a number", async () => {
    const response = await GET(buildRequest("?windowDays=garbage"));
    const data = await response.json();

    expect(data.windowDays).toBe(14);
  });

  it("resolves environment and trigger names and passes their ids through", async () => {
    mockGetEnvironmentByName.mockResolvedValue({
      id: "env-1",
      name: "production",
    });
    mockGetTriggerByName.mockResolvedValue({ id: "trigger-1", name: "ci" });

    await GET(buildRequest("?environment=production&trigger=ci"));

    expect(mockGetEnvironmentByName).toHaveBeenCalledWith("production");
    expect(mockGetTriggerByName).toHaveBeenCalledWith("ci");
    expect(mockGetFileTimings).toHaveBeenCalledWith(
      "suite-1",
      expect.any(Date),
      "env-1",
      "trigger-1",
    );
  });

  it("silently ignores unknown environment/trigger names", async () => {
    mockGetEnvironmentByName.mockResolvedValue(null);
    mockGetTriggerByName.mockResolvedValue(null);

    const response = await GET(
      buildRequest("?environment=nonexistent&trigger=nonexistent"),
    );

    expect(response.status).toBe(200);
    expect(mockGetFileTimings).toHaveBeenCalledWith(
      "suite-1",
      expect.any(Date),
      undefined,
      undefined,
    );
  });

  it("returns 500 when the repository throws", async () => {
    mockGetFileTimings.mockRejectedValue(new Error("Database exploded"));

    const response = await GET(buildRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch file timings");
    expect(data.details).toBe("Database exploded");
  });
});
