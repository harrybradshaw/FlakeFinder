import { type TestStatus } from "@/lib/upload/zip-extraction-utils";

export interface ExtractedTest {
  id: string;
  name: string;
  status: TestStatus;
  duration: number;
  file: string;
  error?: string;
  errorStack?: string;
  screenshots: string[];
  attempts: ExtractedTestAttempt[];
  worker_index?: number;
  started_at?: string;
  location?: {
    file: string;
    line: number;
    column: number;
  };
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
}

export interface ExtractedTestAttempt {
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
  screenshots: string[];
  attachments?: Array<{
    name: string;
    contentType: string;
    content: string;
  }>;
  startTime?: string;
  started_at?: string; // Legacy support
  steps: any[];
  stepsUrl?: string; // URL to lazy load steps from storage
  lastFailedStep?: {
    title: string;
    duration: number;
    error: string;
  };
}
