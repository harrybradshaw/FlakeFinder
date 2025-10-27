import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  formatRunFailure,
  formatTestFailure,
  formatFlakinessAlert,
  formatPerformanceAlert,
  type RunFailureEvent,
  type TestFailureEvent,
  type FlakinessAlertEvent,
  type PerformanceAlertEvent,
} from "../slack-formatter";

describe("Slack Formatter - URL Conversion", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://test-viewer.example.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv;
  });

  describe("formatRunFailure", () => {
    it("should convert relative URLs to absolute URLs", () => {
      const event: RunFailureEvent = {
        projectName: "Test Project",
        environment: "production",
        branch: "main",
        commit: "abc123def456",
        totalTests: 100,
        failedTests: 5,
        flakyTests: 3,
        passRate: 95,
        runUrl: "/runs/test-run-123",
        timestamp: new Date().toISOString(),
      };

      const result = formatRunFailure(event) as any;
      const actionsBlock = result.blocks.find((b: any) => b.type === "actions");

      expect(actionsBlock.elements[0].url).toBe(
        "https://test-viewer.example.com/runs/test-run-123"
      );
    });

    it("should preserve absolute URLs", () => {
      const event: RunFailureEvent = {
        projectName: "Test Project",
        environment: "production",
        branch: "main",
        commit: "abc123def456",
        totalTests: 100,
        failedTests: 5,
        flakyTests: 3,
        passRate: 95,
        runUrl: "https://custom-domain.com/runs/test-run-123",
        timestamp: new Date().toISOString(),
      };

      const result = formatRunFailure(event) as any;
      const actionsBlock = result.blocks.find((b: any) => b.type === "actions");

      expect(actionsBlock.elements[0].url).toBe(
        "https://custom-domain.com/runs/test-run-123"
      );
    });

    it("should use default URL when NEXT_PUBLIC_APP_URL is not set", () => {
      delete process.env.NEXT_PUBLIC_APP_URL;

      const event: RunFailureEvent = {
        projectName: "Test Project",
        environment: "production",
        branch: "main",
        commit: "abc123def456",
        totalTests: 100,
        failedTests: 5,
        flakyTests: 3,
        passRate: 95,
        runUrl: "/runs/test-run-123",
        timestamp: new Date().toISOString(),
      };

      const result = formatRunFailure(event) as any;
      const actionsBlock = result.blocks.find((b: any) => b.type === "actions");

      expect(actionsBlock.elements[0].url).toBe(
        "http://localhost:3000/runs/test-run-123"
      );
    });
  });

  describe("formatTestFailure", () => {
    it("should convert relative URLs to absolute URLs", () => {
      const event: TestFailureEvent = {
        testName: "should do something",
        testFile: "tests/example.spec.ts",
        projectName: "Test Project",
        environment: "production",
        branch: "main",
        commit: "abc123def456",
        runUrl: "/runs/test-run-123",
        testUrl: "/tests/test-123",
        timestamp: new Date().toISOString(),
      };

      const result = formatTestFailure(event) as any;
      const actionsBlock = result.blocks.find((b: any) => b.type === "actions");

      expect(actionsBlock.elements[0].url).toBe(
        "https://test-viewer.example.com/tests/test-123"
      );
      expect(actionsBlock.elements[1].url).toBe(
        "https://test-viewer.example.com/runs/test-run-123"
      );
    });
  });

  describe("formatFlakinessAlert", () => {
    it("should convert relative URLs to absolute URLs", () => {
      const event: FlakinessAlertEvent = {
        testName: "should do something",
        testFile: "tests/example.spec.ts",
        projectName: "Test Project",
        flakyRate: 45.5,
        threshold: 30,
        totalRuns: 100,
        flakyRuns: 45,
        trend: "increasing",
        testUrl: "/tests/test-123",
        timestamp: new Date().toISOString(),
      };

      const result = formatFlakinessAlert(event) as any;
      const actionsBlock = result.blocks.find((b: any) => b.type === "actions");

      expect(actionsBlock.elements[0].url).toBe(
        "https://test-viewer.example.com/tests/test-123"
      );
    });
  });

  describe("formatPerformanceAlert", () => {
    it("should convert relative URLs to absolute URLs", () => {
      const event: PerformanceAlertEvent = {
        testName: "should do something",
        testFile: "tests/example.spec.ts",
        projectName: "Test Project",
        currentDuration: 5000,
        baselineDuration: 2000,
        deviationPercent: 150,
        runUrl: "/runs/test-run-123",
        testUrl: "/tests/test-123",
        timestamp: new Date().toISOString(),
      };

      const result = formatPerformanceAlert(event) as any;
      const actionsBlock = result.blocks.find((b: any) => b.type === "actions");

      expect(actionsBlock.elements[0].url).toBe(
        "https://test-viewer.example.com/tests/test-123"
      );
      expect(actionsBlock.elements[1].url).toBe(
        "https://test-viewer.example.com/runs/test-run-123"
      );
    });
  });
});
