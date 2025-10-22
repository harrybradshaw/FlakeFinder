import { describe, it, expect } from "vitest";
import { extractTestsFromZip } from "./zip-extraction-utils";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

describe("Test Steps Feature", () => {
  const testZipBuffer = fs.readFileSync(
    path.join(__dirname, "__tests__/fixtures/playwright-report-sample.zip"),
  );

  it("should extract test steps from Playwright reports", async () => {
    const zip = await JSZip.loadAsync(testZipBuffer);
    const result = await extractTestsFromZip(zip);

    // Find tests that have steps
    const testsWithSteps = result.tests.filter(
      (test) =>
        test.attempts &&
        test.attempts.some((attempt) => attempt.steps && attempt.steps.length > 0),
    );

    expect(testsWithSteps.length).toBeGreaterThan(0);

    // Check structure of first test with steps
    const testWithSteps = testsWithSteps[0];
    const attemptWithSteps = testWithSteps.attempts!.find(
      (attempt) => attempt.steps && attempt.steps.length > 0,
    );

    expect(attemptWithSteps).toBeDefined();
    expect(attemptWithSteps!.steps).toBeDefined();
    expect(Array.isArray(attemptWithSteps!.steps)).toBe(true);
    expect(attemptWithSteps!.steps!.length).toBeGreaterThan(0);

    // Verify step structure
    const firstStep = attemptWithSteps!.steps![0];
    expect(firstStep).toHaveProperty("title");
    expect(firstStep).toHaveProperty("duration");
    expect(typeof firstStep.title).toBe("string");
    expect(typeof firstStep.duration).toBe("number");

    // Steps can have optional fields
    if (firstStep.category) {
      expect(typeof firstStep.category).toBe("string");
    }
    if (firstStep.error) {
      // Error can be string or object
      expect(
        typeof firstStep.error === "string" ||
          (typeof firstStep.error === "object" && "message" in firstStep.error),
      ).toBe(true);
    }
  });

  it("should handle nested steps (hierarchical structure)", async () => {
    const zip = await JSZip.loadAsync(testZipBuffer);
    const result = await extractTestsFromZip(zip);

    // Find tests with nested steps
    const testsWithNestedSteps = result.tests.filter((test) =>
      test.attempts?.some(
        (attempt) =>
          attempt.steps &&
          attempt.steps.some((step) => step.steps && step.steps.length > 0),
      ),
    );

    if (testsWithNestedSteps.length > 0) {
      const test = testsWithNestedSteps[0];
      const attempt = test.attempts!.find(
        (a) =>
          a.steps && a.steps.some((s) => s.steps && s.steps.length > 0),
      );

      const stepWithNesting = attempt!.steps!.find(
        (s) => s.steps && s.steps.length > 0,
      );

      expect(stepWithNesting).toBeDefined();
      expect(stepWithNesting!.steps).toBeDefined();
      expect(Array.isArray(stepWithNesting!.steps)).toBe(true);
      expect(stepWithNesting!.steps!.length).toBeGreaterThan(0);

      // Verify nested step structure
      const nestedStep = stepWithNesting!.steps![0];
      expect(nestedStep).toHaveProperty("title");
      expect(nestedStep).toHaveProperty("duration");
    }
  });

  it("should handle both string and object error formats in steps", async () => {
    const zip = await JSZip.loadAsync(testZipBuffer);
    const result = await extractTestsFromZip(zip);

    // Find steps with errors
    const stepsWithErrors: any[] = [];
    result.tests.forEach((test) => {
      test.attempts?.forEach((attempt) => {
        if (attempt.steps) {
          const collectStepsWithErrors = (steps: any[]) => {
            steps.forEach((step) => {
              if (step.error) {
                stepsWithErrors.push(step);
              }
              if (step.steps) {
                collectStepsWithErrors(step.steps);
              }
            });
          };
          collectStepsWithErrors(attempt.steps);
        }
      });
    });

    if (stepsWithErrors.length > 0) {
      stepsWithErrors.forEach((step) => {
        // Error should be either a string or an object with message property
        const isStringError = typeof step.error === "string";
        const isObjectError =
          typeof step.error === "object" &&
          step.error !== null &&
          "message" in step.error;

        expect(isStringError || isObjectError).toBe(true);
      });
    }
  });

  it("should include step categories when available", async () => {
    const zip = await JSZip.loadAsync(testZipBuffer);
    const result = await extractTestsFromZip(zip);

    const allSteps: any[] = [];
    result.tests.forEach((test) => {
      test.attempts?.forEach((attempt) => {
        if (attempt.steps) {
          const collectAllSteps = (steps: any[]) => {
            steps.forEach((step) => {
              allSteps.push(step);
              if (step.steps) {
                collectAllSteps(step.steps);
              }
            });
          };
          collectAllSteps(attempt.steps);
        }
      });
    });

    // If there are steps, check for categories
    if (allSteps.length > 0) {
      const stepsWithCategories = allSteps.filter((s) => s.category);
      
      // Categories are optional in Playwright, but if present, should be valid
      if (stepsWithCategories.length > 0) {
        const categories = new Set(stepsWithCategories.map((s) => s.category));
        const commonCategories = ["hook", "expect", "pw:api", "test.step"];
        const hasCommonCategory = Array.from(categories).some((cat) =>
          commonCategories.includes(cat),
        );
        expect(hasCommonCategory).toBe(true);
      }
    } else {
      // No steps in this report, test passes
      expect(allSteps.length).toBe(0);
    }
  });
});
