/**
 * Shared API response types for type-safe communication between API routes and frontend
 */

// Test step structure (hierarchical)
export interface TestStep {
  title: string;
  category?: string; // e.g., "hook", "expect", "pw:api", "test.step"
  startTime?: string;
  duration: number;
  error?:
    | string
    | {
        // Can be string or object
        message: string;
        stack?: string;
      };
  location?: {
    file: string;
    line: number;
    column: number;
  };
  steps?: TestStep[]; // Nested steps for hierarchy
}

// Test attempt/retry structure
export interface TestAttempt {
  attemptIndex: number;
  retry_index?: number; // Legacy support
  retryIndex?: number; // Legacy support
  id?: string; // Test result ID for lazy loading steps
  testResultId?: string; // Alternative field name
  status: string;
  duration: number;
  error?: string;
  errorStack?: string;
  error_stack?: string; // Legacy support
  screenshots?: string[];
  attachments?: Array<{
    name: string;
    contentType: string;
    content: string;
  }>;
  startTime?: string;
  started_at?: string; // Legacy support
  steps?: TestStep[]; // Test execution steps (inline)
  stepsUrl?: string; // URL to lazy load steps from storage
  lastFailedStep?: {
    title: string;
    duration: number;
    error: string;
  };
}

// Test details response from /api/test-runs/[id]/tests/[testId]
export interface TestDetailsResponse {
  test: {
    id: string;
    suite_test_id?: string;
    name: string;
    file: string;
    status: "passed" | "failed" | "flaky" | "skipped" | "timedOut";
    duration: number;
    error?: string;
    screenshots?: string[];
    started_at?: string;
    metadata?: {
      browser?: string;
      tags?: string[];
      annotations?: any[];
      epic?: string;
      labels?: Array<{ name: string; value: string }>;
      parameters?: Array<{ name: string; value: string }>;
      description?: string;
      descriptionHtml?: string;
    };
    attempts: TestAttempt[];
    // Legacy support
    retryResults?: TestAttempt[];
  };
}

// Test in a test run
export interface TestInRun {
  id: string;
  suite_test_id?: string;
  name: string;
  status: "passed" | "failed" | "flaky" | "skipped" | "timedOut";
  duration: number;
  file: string;
  worker_index?: number;
  started_at?: string;
  error?: string;
  screenshots?: string[];
  metadata?: {
    browser?: string;
    tags?: string[];
    annotations?: any[];
    epic?: string;
    labels?: Array<{ name: string; value: string }>;
    parameters?: Array<{ name: string; value: string }>;
    description?: string;
    descriptionHtml?: string;
  };
  attempts?: TestAttempt[];
  // Legacy support
  retryResults?: TestAttempt[];
}

// Test run response
export interface TestRunResponse {
  id: string;
  timestamp: string;
  project?: string;
  project_display?: string;
  project_color?: string;
  environment: string;
  environment_display?: string;
  environment_color?: string;
  trigger: string;
  trigger_display?: string;
  trigger_icon?: string;
  branch: string;
  commit: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped?: number;
  duration: string;
  hasScreenshots?: boolean;
  uploaded_filename?: string;
  ci_metadata?: Record<string, any>;
  tests?: TestInRun[];
}

// Test history item for /api/tests/[testId]
export interface TestHistoryItem {
  testRunId: string;
  timestamp: string;
  status: string;
  duration: number;
  environment?: string;
  trigger?: string;
  branch?: string;
}

// Test detail page response
export interface TestDetailResponse {
  name: string;
  file: string;
  history: TestHistoryItem[];
  summary: {
    totalRuns: number;
    passRate: string;
    failRate: string;
    flakyRate: string;
    avgDuration: number;
  };
}
