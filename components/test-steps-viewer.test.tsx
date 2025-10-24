/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestStepsViewer } from "./test-steps-viewer";

describe("TestStepsViewer", () => {
  describe("Disabled state", () => {
    it("should be disabled when testResultId exists but no stepsUrl", () => {
      render(<TestStepsViewer testResultId="test-123" />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Not available");
    });

    it("should be disabled when no steps, no stepsUrl, and no testResultId", () => {
      render(<TestStepsViewer />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Not available");
    });

    it("should be disabled when inline steps are empty array", () => {
      render(<TestStepsViewer steps={[]} />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("Not available");
    });
  });

  describe("Enabled state", () => {
    it("should be enabled when stepsUrl exists", () => {
      render(<TestStepsViewer stepsUrl="https://example.com/steps.json" />);

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent("Click to view");
    });

    it("should be enabled when inline steps exist", () => {
      render(<TestStepsViewer steps={[{ title: "Step 1", duration: 100 }]} />);

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent("1 step");
    });
  });

  describe("Edge cases", () => {
    it("should be enabled when both testResultId and stepsUrl exist", () => {
      render(
        <TestStepsViewer
          testResultId="test-123"
          stepsUrl="https://example.com/steps.json"
        />,
      );

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent("Click to view");
    });
  });
});
