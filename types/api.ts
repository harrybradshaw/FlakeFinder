import { type ExtractedTestAttempt } from "@/types/extracted-test";

export interface TestStep {
  title: string;
  category?: string; // e.g., "hook", "expect", "pw:api", "test.step"
  startTime?: string;
  duration: number;
  error?:
    | string
    | {
        message: string;
        stack?: string;
      };
  location?: {
    file: string;
    line: number;
    column: number;
  };
  steps?: TestStep[];
}

export interface TestAttempt {
  attemptIndex: number;
  retry_index?: number;
  retryIndex?: number;
  id?: string;
  testResultId?: string; // Alternative field name
  status: string;
  duration: number;
  error?: string;
  errorStack?: string;
  error_stack?: string; // Legacy support
  screenshots: string[];
  attachments?: Array<{
    name: string;
    contentType: string;
    content: string;
  }>;
  startTime?: string;
  started_at?: string; // Legacy support
  stepsUrl?: string; // URL to lazy load steps from storage
  lastFailedStep?: {
    title: string;
    duration: number;
    error: string;
  };
}

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
  screenshots: string[];
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
}

export interface TestDetailsResponse {
  test: TestInRun;
}

export interface TestHistoryItem {
  testRunId: string;
  timestamp: string;
  status: string;
  duration: number;
  attempts?: number;
  environment?: string;
  trigger?: string;
  branch?: string;
}

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

export interface Environment {
  id: string;
  name: string;
  display_name: string;
  color?: string;
  active: boolean;
  created_at?: string;
}

export interface Trigger {
  id: string;
  name: string;
  display_name: string;
  icon: string;
  active: boolean;
  created_at?: string;
}

export interface Project {
  id: string;
  name: string;
  display_name: string;
  color: string;
  active?: boolean;
  created_at?: string;
}

export interface Suite {
  id: string;
  name: string;
  description?: string;
  project_id: string;
  project?: Project;
  active?: boolean;
  created_at?: string;
}

// API Response types
export interface EnvironmentsResponse {
  environments: Environment[];
}

export interface TriggersResponse {
  triggers: Trigger[];
}

export interface SuitesResponse {
  suites: Suite[];
}

export interface TestRun {
  id: string;
  timestamp: string;
  project: string;
  project_display: string;
  project_color: string;
  environmentName: string;
  environment_display: string;
  environment_color: string;
  triggerName: string;
  trigger_display: string;
  trigger_icon: string;
  branch: string;
  commit: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  duration: string;
  uploaded_filename?: string | null;
}

export interface TestRunsResponse {
  runs: TestRun[];
  total: number;
}

export interface TestRunDetails extends TestRun {
  ci_metadata?: Record<string, any>;
  environment_data?: Record<string, any>;
  tests: TestInRun[];
}
