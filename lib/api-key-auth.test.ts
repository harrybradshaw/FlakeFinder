import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authenticateApiKey } from "./api-key-auth";

// Mock Next.js headers
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

describe("api-key-auth", () => {
  let mockHeadersGet: ReturnType<typeof vi.fn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Save original env
    originalEnv = { ...process.env };

    // Set up test API key
    process.env.SECRET_API_KEY = "test-secret-key-12345";

    // Create mock headers function
    mockHeadersGet = vi.fn();
    const { headers } = await import("next/headers");
    vi.mocked(headers).mockResolvedValue({
      get: mockHeadersGet,
    } as any);
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("Valid API Keys", () => {
    it("should validate correct API key in Bearer format", async () => {
      mockHeadersGet.mockReturnValue("Bearer test-secret-key-12345");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(true);
      expect(result.projectId).toBeDefined();
      expect(result.projectId).toBeTruthy();
    });

    it("should validate correct API key in plain format", async () => {
      mockHeadersGet.mockReturnValue("test-secret-key-12345");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(true);
      expect(result.projectId).toBeDefined();
    });

    it("should return projectId for valid key", async () => {
      mockHeadersGet.mockReturnValue("test-secret-key-12345");

      const result = await authenticateApiKey();

      expect(result.projectId).toBe("b627095d-1346-4e0a-901b-b07dd4e5e440");
    });
  });

  describe("Invalid API Keys", () => {
    it("should reject invalid API key", async () => {
      mockHeadersGet.mockReturnValue("Bearer invalid-key");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.projectId).toBe("");
    });

    it("should reject missing Authorization header", async () => {
      mockHeadersGet.mockReturnValue(null);

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Missing Authorization header");
      expect(result.projectId).toBe("");
    });

    it("should reject empty API key", async () => {
      mockHeadersGet.mockReturnValue("");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject empty Bearer token", async () => {
      mockHeadersGet.mockReturnValue("Bearer ");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should be case-sensitive for API keys", async () => {
      mockHeadersGet.mockReturnValue("TEST-SECRET-KEY-12345");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle API key with leading whitespace", async () => {
      mockHeadersGet.mockReturnValue("  test-secret-key-12345");

      const result = await authenticateApiKey();

      // Should fail - whitespace should not be trimmed
      expect(result.valid).toBe(false);
    });

    it("should handle API key with trailing whitespace", async () => {
      mockHeadersGet.mockReturnValue("test-secret-key-12345  ");

      const result = await authenticateApiKey();

      // Should fail - whitespace should not be trimmed
      expect(result.valid).toBe(false);
    });

    it("should handle malformed Bearer format", async () => {
      mockHeadersGet.mockReturnValue("Bearer");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
    });

    it("should handle undefined environment variable", async () => {
      delete process.env.SECRET_API_KEY;
      mockHeadersGet.mockReturnValue("test-secret-key-12345");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
    });

    it("should handle very long API key", async () => {
      const longKey = "a".repeat(10000);
      mockHeadersGet.mockReturnValue(longKey);

      const result = await authenticateApiKey();

      expect(result.valid).toBe(false);
    });

    it("should handle special characters in API key", async () => {
      process.env.SECRET_API_KEY = "key-with-$pecial-ch@rs!";
      mockHeadersGet.mockReturnValue("Bearer key-with-$pecial-ch@rs!");

      const result = await authenticateApiKey();

      expect(result.valid).toBe(true);
    });
  });

  describe("Security", () => {
    it("should not leak valid key in error message", async () => {
      mockHeadersGet.mockReturnValue("wrong-key");

      const result = await authenticateApiKey();

      expect(result.error).not.toContain(process.env.SECRET_API_KEY!);
    });

    it("should consistently reject invalid keys", async () => {
      const invalidKeys = [
        "wrong-key-1",
        "wrong-key-2",
        "test-secret-key-1234", // Missing last digit
        "test-secret-key-123456", // Extra digit
      ];

      for (const key of invalidKeys) {
        mockHeadersGet.mockReturnValue(key);
        const result = await authenticateApiKey();
        expect(result.valid).toBe(false);
      }
    });
  });

  describe("Return Value Structure", () => {
    it("should always return valid boolean", async () => {
      mockHeadersGet.mockReturnValue("test-secret-key-12345");

      const result = await authenticateApiKey();

      expect(typeof result.valid).toBe("boolean");
    });

    it("should always return error string", async () => {
      mockHeadersGet.mockReturnValue("invalid");

      const result = await authenticateApiKey();

      expect(typeof result.error).toBe("string");
    });

    it("should always return projectId string", async () => {
      mockHeadersGet.mockReturnValue("test-secret-key-12345");

      const result = await authenticateApiKey();

      expect(typeof result.projectId).toBe("string");
    });

    it("should return empty projectId for invalid key", async () => {
      mockHeadersGet.mockReturnValue("invalid-key");

      const result = await authenticateApiKey();

      expect(result.projectId).toBe("");
    });
  });
});
