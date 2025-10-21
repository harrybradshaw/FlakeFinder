import { z } from "zod";

// Schema for Playwright test annotations
const AnnotationSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});

// Schema for test location
const LocationSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number(),
});

// Schema for test error
const ErrorSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
});

// Schema for test attachment
const AttachmentSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  path: z.string().optional(),
  body: z.string().optional(), // Inline attachment content
});

// Schema for test result
const TestResultSchema = z.object({
  workerIndex: z.number().optional(), // May be undefined in some reports
  status: z.enum(["passed", "failed", "timedOut", "skipped"]),
  duration: z.number(),
  error: ErrorSchema.optional(),
  errors: z.array(z.string()).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  retry: z.number(),
  startTime: z.string(),
});

// Schema for individual test
const PlaywrightTestSchema = z.object({
  testId: z.string(),
  title: z.string(),
  projectName: z.string(),
  location: LocationSchema.optional(),
  outcome: z.enum(["expected", "unexpected", "flaky", "skipped"]), // Can also be "skipped"
  duration: z.number(),
  annotations: z.array(AnnotationSchema).optional(),
  results: z.array(TestResultSchema),
});

type TestSuite = {
  title: string;
  file: string;
  line: number;
  column: number;
  specs?: PlaywrightTest[];
  suites?: TestSuite[];
};

const TestSuiteSchema: z.ZodType<TestSuite> = z.lazy(() =>
  z.object({
    title: z.string(),
    file: z.string(),
    line: z.number(),
    column: z.number(),
    specs: z.array(PlaywrightTestSchema).optional(),
    suites: z.array(TestSuiteSchema).optional(),
  }),
);

// Schema for Playwright JSON report
export const PlaywrightReportSchema = z.object({
  config: z.object({
    rootDir: z.string(),
    configFile: z.string().optional(),
  }),
  suites: z.array(TestSuiteSchema),
  stats: z
    .object({
      startTime: z.string(),
      duration: z.number(),
    })
    .optional(),
});

// Schema for HTML report test file structure - be lenient to handle various formats
export const HTMLReportTestFileSchema = z
  .object({
    fileId: z.string().optional(),
    fileName: z.string().optional(),
    tests: z.array(PlaywrightTestSchema).optional(),
  })
  .passthrough(); // Allow additional fields we don't know about

// Export types
export type PlaywrightReport = z.infer<typeof PlaywrightReportSchema>;
export type PlaywrightTest = z.infer<typeof PlaywrightTestSchema>;
export type TestResult = z.infer<typeof TestResultSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
