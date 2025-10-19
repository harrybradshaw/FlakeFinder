export interface TestRun {
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
  tests?: Array<{
    id: string;
    name: string;
    status: "passed" | "failed" | "flaky" | "skipped" | "timedOut";
    duration: number;
    file: string;
    worker_index?: number;
    started_at?: string;
    error?: string;
    screenshots?: string[];
    retryResults?: Array<{
      id?: string;
      retry_index?: number;
      retryIndex?: number;
      status: string;
      duration: number;
      error?: string;
      error_stack?: string;
      errorStack?: string;
      screenshots?: string[];
      attachments?: Array<{
        name: string;
        contentType: string;
        content: string;
      }>;
      started_at?: string;
      startTime?: string;
    }>;
  }>;
}

export const mockTestRuns: TestRun[] = [
  {
    id: "1",
    timestamp: "2025-01-18T14:30:00Z",
    environment: "production",
    trigger: "post_deploy",
    branch: "main",
    commit: "a1b2c3d4e5f6",
    total: 245,
    passed: 245,
    failed: 0,
    flaky: 0,
    duration: "12m 34s",
    hasScreenshots: true,
  },
  {
    id: "2",
    timestamp: "2025-01-18T10:15:00Z",
    environment: "staging",
    trigger: "pull_request",
    branch: "feature/new-checkout",
    commit: "f6e5d4c3b2a1",
    total: 198,
    passed: 195,
    failed: 2,
    flaky: 1,
    duration: "9m 12s",
    hasScreenshots: false,
  },
  {
    id: "3",
    timestamp: "2025-01-17T16:45:00Z",
    environment: "production",
    trigger: "merge_queue",
    branch: "main",
    commit: "b2c3d4e5f6a1",
    total: 245,
    passed: 242,
    failed: 3,
    flaky: 0,
    duration: "13m 01s",
    hasScreenshots: true,
  },
  {
    id: "4",
    timestamp: "2025-01-17T11:20:00Z",
    environment: "development",
    trigger: "ci",
    branch: "feature/user-profile",
    commit: "c3d4e5f6a1b2",
    total: 156,
    passed: 150,
    failed: 4,
    flaky: 2,
    duration: "7m 45s",
    hasScreenshots: false,
  },
  {
    id: "5",
    timestamp: "2025-01-16T15:30:00Z",
    environment: "staging",
    trigger: "pull_request",
    branch: "main",
    commit: "d4e5f6a1b2c3",
    total: 245,
    passed: 238,
    failed: 5,
    flaky: 2,
    duration: "11m 22s",
    hasScreenshots: true,
  },
  {
    id: "6",
    timestamp: "2025-01-16T09:00:00Z",
    environment: "production",
    trigger: "post_deploy",
    branch: "main",
    commit: "e5f6a1b2c3d4",
    total: 245,
    passed: 245,
    failed: 0,
    flaky: 0,
    duration: "12m 18s",
    hasScreenshots: false,
  },
  {
    id: "7",
    timestamp: "2025-01-15T14:10:00Z",
    environment: "staging",
    trigger: "pull_request",
    branch: "feature/payment-gateway",
    commit: "f6a1b2c3d4e5",
    total: 187,
    passed: 180,
    failed: 6,
    flaky: 1,
    duration: "8m 56s",
    hasScreenshots: true,
  },
  {
    id: "8",
    timestamp: "2025-01-15T08:30:00Z",
    environment: "production",
    trigger: "merge_queue",
    branch: "main",
    commit: "a1b2c3d4e5f7",
    total: 245,
    passed: 240,
    failed: 4,
    flaky: 1,
    duration: "12m 45s",
    hasScreenshots: false,
  },
  {
    id: "9",
    timestamp: "2025-01-14T16:00:00Z",
    environment: "development",
    trigger: "ci",
    branch: "feature/dashboard",
    commit: "b2c3d4e5f6a2",
    total: 134,
    passed: 128,
    failed: 5,
    flaky: 1,
    duration: "6m 30s",
    hasScreenshots: true,
  },
  {
    id: "10",
    timestamp: "2025-01-14T10:45:00Z",
    environment: "production",
    trigger: "post_deploy",
    branch: "main",
    commit: "c3d4e5f6a1b3",
    total: 245,
    passed: 243,
    failed: 2,
    flaky: 0,
    duration: "12m 55s",
    hasScreenshots: false,
  },
];
