/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { TestCaseDetails } from "./test-case-details";

// Mock Next.js Image component
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

// Mock TestStepsViewer component
vi.mock("./test-steps-viewer", () => ({
  TestStepsViewer: ({ steps, stepsUrl, testResultId }: any) => (
    <div data-testid="test-steps-viewer">
      Steps: {steps?.length || 0}, URL: {stepsUrl || "none"}, ID:{" "}
      {testResultId || "none"}
    </div>
  ),
}));

describe("TestCaseDetails", () => {
  describe("Layout Structure Snapshots", () => {
    it("should render single failed attempt with all sections in one card", () => {
      const testCase = {
        name: "Test Case 1",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            error: "Test timeout of 30000ms exceeded.",
            errorStack:
              "Error: Test timeout of 30000ms exceeded.\n    at Timeout._onTimeout",
            attachments: [
              {
                name: "Test Configuration",
                contentType: "text/plain",
                content: "config data",
              },
              { name: "user", contentType: "text/plain", content: "user data" },
            ],
            screenshots: ["https://example.com/screenshot1.png"],
            steps: [{ title: "Step 1", duration: 100 }],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container).toMatchSnapshot();
    });

    it("should render multiple attempts with separate cards", () => {
      const testCase = {
        name: "Test Case 2",
        file: "test.spec.ts",
        status: "flaky" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 3000,
            error: "First attempt error",
            screenshots: [],
            steps: [],
            attachments: [
              {
                name: "Test Configuration",
                contentType: "text/plain",
                content: "config",
              },
            ],
          },
          {
            attemptIndex: 1,
            status: "passed",
            duration: 2000,
            screenshots: [],
            steps: [],
            attachments: [
              {
                name: "Test Configuration",
                contentType: "text/plain",
                content: "config",
              },
            ],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container).toMatchSnapshot();
    });

    it("should render test context section correctly", () => {
      const testCase = {
        name: "Test Case 3",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            screenshots: [],
            steps: [],
            attachments: [
              {
                name: "Test Configuration",
                contentType: "text/plain",
                content: "config data",
              },
              {
                name: "Route Selection",
                contentType: "text/plain",
                content: "route data",
              },
              {
                name: "stdout",
                contentType: "text/plain",
                content: "console output",
              },
            ],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container).toMatchSnapshot();
    });

    it("should render error and screenshots in grid layout", () => {
      const testCase = {
        name: "Test Case 4",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            error:
              "Error: Timed out 30000ms waiting for expect(locator).toBeVisible()",
            errorStack: `Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for getByTestId('data-shaping-yes')
    - locator {swcMinify: true, reactStrictMode: true}`,
            screenshots: [
              "https://example.com/screenshot1.png",
              "https://example.com/screenshot2.png",
            ],
            steps: [],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container).toMatchSnapshot();
    });

    it("should render with execution steps", () => {
      const testCase = {
        name: "Test Case 5",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            testResultId: "test-123",
            stepsUrl: "https://example.com/steps.json",
            screenshots: [],
            steps: [
              { title: "Navigate to page", duration: 100 },
              { title: "Click button", duration: 50 },
            ],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container).toMatchSnapshot();
    });
  });

  describe("Conditional Rendering", () => {
    it("should not render when no content is available", () => {
      const testCase = {
        name: "Test Case 6",
        file: "test.spec.ts",
        status: "passed" as const,
        duration: "1s",
        attempts: [
          {
            attemptIndex: 0,
            status: "passed",
            duration: 1000,
            screenshots: [],
            steps: [],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container.firstChild).toBeNull();
    });

    it("should skip attempts with no content", () => {
      const testCase = {
        name: "Test Case 7",
        file: "test.spec.ts",
        status: "flaky" as const,
        duration: "3s",
        attempts: [
          {
            attemptIndex: 0,
            status: "passed",
            duration: 1000,
            screenshots: [],
            steps: [],
          },
          {
            attemptIndex: 1,
            status: "failed",
            duration: 2000,
            error: "Test failed",
            screenshots: [],
            steps: [],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      // Should only render the second attempt
      const cards = container.querySelectorAll('[class*="rounded-lg"]');
      expect(cards.length).toBeGreaterThan(0);
    });
  });

  describe("Styling Classes", () => {
    it("should apply correct background color for failed attempts", () => {
      const testCase = {
        name: "Test Case 8",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            error: "Test failed",
            screenshots: [],
            steps: [],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      const card = container.querySelector('[class*="bg-red-50"]');
      expect(card).toBeTruthy();
    });

    it("should apply correct background color for passed attempts", () => {
      const testCase = {
        name: "Test Case 9",
        file: "test.spec.ts",
        status: "passed" as const,
        duration: "1s",
        attempts: [
          {
            attemptIndex: 0,
            status: "passed",
            duration: 1000,
            screenshots: [],
            steps: [],
            attachments: [
              {
                name: "Test Configuration",
                contentType: "text/plain",
                content: "config",
              },
            ],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      const card = container.querySelector('[class*="bg-green-50"]');
      expect(card).toBeTruthy();
    });

    it("should apply grid layout for error and screenshots section", () => {
      const testCase = {
        name: "Test Case 10",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            error: "Test error",
            screenshots: ["https://example.com/screenshot.png"],
            steps: [],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      const gridContainer = container.querySelector('[class*="grid"]');
      expect(gridContainer).toBeTruthy();
      expect(gridContainer?.className).toContain("lg:grid-cols-2");
    });
  });

  describe("Error Message Formatting", () => {
    it("should extract error message from stack trace", () => {
      const testCase = {
        name: "Test Case 11",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            error: `Error: Timed out 30000ms waiting for expect(locator).toBeVisible()
    at Timeout._onTimeout
    at listOnTimeout`,
            screenshots: [],
            steps: [],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container).toMatchSnapshot();
    });

    it("should handle error with separate stack trace", () => {
      const testCase = {
        name: "Test Case 12",
        file: "test.spec.ts",
        status: "failed" as const,
        duration: "5s",
        attempts: [
          {
            attemptIndex: 0,
            status: "failed",
            duration: 5000,
            error: "Error: Test failed",
            errorStack: "Error: Test failed\n    at line 1\n    at line 2",
            screenshots: [],
            steps: [],
          },
        ],
      };

      const { container } = render(<TestCaseDetails testCase={testCase} />);
      expect(container).toMatchSnapshot();
    });
  });
});
