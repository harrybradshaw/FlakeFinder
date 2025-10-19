import JSZip from "jszip";

// Core domain models and types
export interface RetryResult {
  retryIndex: number;
  status: string;
  duration: number;
  error?: string;
  errorStack?: string;
  screenshots: string[];
  attachments?: Array<{
    name: string;
    contentType: string;
    content: string;
  }>;
  startTime?: string;
}

export interface TestResult {
  id: string;
  name: string;
  status: string;
  duration: number;
  file: string;
  error?: string;
  errorStack?: string;
  screenshots: string[];
  retryResults?: RetryResult[];
  annotations?: TestAnnotation[];
  location?: TestLocation;
  worker_index?: number;
  started_at?: string;
}

export interface TestAttachment {
  name: string;
  contentType: string;
  path?: string;
  content?: string;
}

export interface TestLocation {
  file: string;
  line: number;
  column: number;
}

export interface TestAnnotation {
  type: string;
  description?: string;
}

export interface TestResultData {
  testId: string;
  title: string;
  outcome: string;
  duration: number;
  location?: TestLocation;
  annotations?: TestAnnotation[];
  results?: Array<{
    status: string;
    duration?: number;
    retry?: number;
    workerIndex?: number;
    startTime?: string;
    error?: {
      message: string;
      stack?: string;
    };
    errors?: string[];
    attachments?: TestAttachment[];
  }>;
}

export interface TestSuite {
  title: string;
  file: string;
  line: number;
  column: number;
  specs: TestResultData[];
  suites?: TestSuite[];
}

export interface PlaywrightReportData {
  config: {
    rootDir: string;
    configFile?: string;
  };
  suites: TestSuite[];
  stats?: {
    startTime: string;
    duration: number;
  };
  metadata?: {
    ci?: Record<string, any>;
  };
  startTime?: string | number;
}

export interface ProcessedReport {
  tests: TestResult[];
  metadata?: Record<string, any>;
}

export class ReportProcessingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ReportProcessingError';
  }
}

/**
 * Calculate a content hash for duplicate detection
 * This hash is based ONLY on the intrinsic test execution data,
 * NOT on user-selected metadata like environment, trigger, or branch.
 * 
 * @param tests - Array of test results
 * @returns SHA-256 hash as hex string
 */
export async function calculateContentHash(tests: TestResult[]): Promise<string> {
  const hashContent = {
    tests: tests
      .map((test) => ({
        name: test.name,
        file: test.file,
        status: test.status,
        duration: test.duration, // Include duration to detect re-runs
        started_at: test.started_at, // Include timestamp to detect re-runs
      }))
      .sort((a, b) =>
        `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
      ),
  };

  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(hashContent))
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Type guards
function isTestSuiteArray(data: unknown): data is TestSuite[] {
  return Array.isArray(data) && data.every(
    (item): item is TestSuite => 
      item !== null &&
      typeof item === 'object' &&
      'title' in item &&
      'file' in item &&
      'specs' in item
  );
}

function isPlaywrightReport(data: unknown): data is PlaywrightReportData {
  return (
    data !== null &&
    typeof data === 'object' &&
    'config' in (data as PlaywrightReportData) &&
    'suites' in (data as PlaywrightReportData)
  );
}


/**
 * Extracts tests from a ZIP file
 */
async function extractTestsFromZip(zip: JSZip): Promise<{ tests: TestResult[], metadata?: Record<string, any> }> {
  const tests: TestResult[] = [];
  
  for (const fileName of Object.keys(zip.files)) {
    if (!fileName.endsWith('.json')) continue;
    
    try {
      const file = zip.file(fileName);
      if (!file) continue;
      
      const content = await file.async('string');
      const testData = JSON.parse(content) as any;
      
      // Handle test file with tests array
      if (testData.tests && Array.isArray(testData.tests)) {
        for (const test of testData.tests) {
          tests.push(convertToTestResult(test, testData.fileName));
        }
      }
    } catch (error) {
      console.error(`Error processing file ${fileName}:`, error);
      continue;
    }
  }
  
  return { tests };
}

/**
 * Processes test suites recursively
 */
function processTestSuites(suites: TestSuite[], tests: TestResult[] = []): TestResult[] {
  for (const suite of suites) {
    // Process nested suites first
    if (suite.suites) {
      processTestSuites(suite.suites, tests);
    }
    
    // Process specs
    for (const spec of suite.specs) {
      tests.push(convertToTestResult(spec));
    }
  }
  
  return tests;
}

/**
 * Processes a Playwright report file
 */
function processPlaywrightReport(report: PlaywrightReportData, tests: TestResult[] = []): TestResult[] {
  // Process test suites
  if (report.suites) {
    processTestSuites(report.suites, tests);
  }
  
  return tests;
}

/**
 * Converts a test result data to our common format
 */
function convertToTestResult(test: TestResultData, fileName?: string): TestResult {
  const lastResult = test.results?.[test.results.length - 1];
  
  // Extract error from Playwright format (uses 'errors' array)
  let finalError = null;
  let finalErrorStack = null;
  if (lastResult?.errors && lastResult.errors.length > 0) {
    finalError = lastResult.errors[0];
    finalErrorStack = lastResult.errors.join('\n\n');
  } else if (lastResult?.error) {
    finalError = lastResult.error.message;
    finalErrorStack = lastResult.error.stack;
  }
  
  // Determine status based on outcome and last result
  let status = 'unknown';
  if (lastResult) {
    if (lastResult.status === 'skipped') {
      status = 'skipped';
    } else if (test.outcome === 'expected') {
      status = lastResult.status;
    } else if (test.outcome === 'flaky') {
      status = 'flaky';
    } else {
      status = 'failed';
    }
  }
  
  // Calculate total duration as sum of all attempts (retries)
  const totalDuration = test.results?.reduce(
    (sum: number, result) => sum + (result.duration || 0),
    0
  ) || test.duration || 0;
  
  return {
    id: test.testId,
    name: test.title,
    status,
    duration: totalDuration,
    file: test.location?.file || fileName || 'unknown',
    error: finalError || undefined,
    errorStack: finalErrorStack || undefined,
    screenshots: extractScreenshots(test.results || []),
    retryResults: processRetryResults(test.results || []),
    annotations: test.annotations,
    location: test.location,
    worker_index: lastResult?.workerIndex,
    started_at: lastResult?.startTime
  };
}


/**
 * Extracts screenshots from test results
 */
function extractScreenshots(results: Array<{ attachments?: TestAttachment[] }>): string[] {
  const screenshots: string[] = [];
  const lastResult = results[results.length - 1];
  
  if (lastResult?.attachments) {
    for (const attachment of lastResult.attachments) {
      if (attachment.contentType?.startsWith('image/') && attachment.path) {
        screenshots.push(attachment.path);
      }
    }
  }
  
  return screenshots;
}

/**
 * Processes retry results
 */
function processRetryResults(results: Array<{
  status: string;
  duration?: number;
  retry?: number;
  errors?: string[];
  error?: { message: string; stack?: string };
  attachments?: TestAttachment[];
  startTime?: string;
}>): RetryResult[] {
  const retryResults: RetryResult[] = [];
  
  results.forEach((result, index) => {
    const screenshots: string[] = [];
    const attachments: Array<{
      name: string;
      contentType: string;
      content: string;
    }> = [];

    // Extract all attachments
    if (result.attachments) {
      for (const attachment of result.attachments) {
        if (attachment.contentType?.startsWith('image/') && attachment.path) {
          screenshots.push(attachment.path);
        } else if (attachment.content && !attachment.contentType?.startsWith('image/')) {
          attachments.push({
            name: attachment.name || 'Attachment',
            contentType: attachment.contentType || 'text/plain',
            content: attachment.content
          });
        }
      }
    }

    // Extract error
    let errorMessage = null;
    let errorStack = null;
    if (result.errors && result.errors.length > 0) {
      errorMessage = result.errors[0];
      errorStack = result.errors.join('\n\n');
    } else if (result.error) {
      errorMessage = result.error.message;
      errorStack = result.error.stack;
    }

    retryResults.push({
      retryIndex: result.retry ?? index,
      status: result.status,
      duration: result.duration || 0,
      error: errorMessage || undefined,
      errorStack: errorStack || undefined,
      screenshots,
      attachments,
      startTime: result.startTime
    });
  });
  
  return retryResults;
}

/**
 * Extracts embedded report from HTML report
 */
async function extractFromHtmlReport(htmlContent: string): Promise<Uint8Array> {
  const match = htmlContent.match(/window\.playwrightReportBase64 = "([^"]+)"/);
  if (!match) {
    throw new ReportProcessingError('No embedded report found in HTML', 'NO_EMBEDDED_REPORT');
  }
  
  try {
    const dataUri = match[1];
    const base64Data = dataUri.replace('data:application/zip;base64,', '');
    
    // For Node.js environment, use Buffer
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64Data, 'base64'));
    }
    
    // For browser environment
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    throw new ReportProcessingError(
      `Failed to decode embedded report: ${error}`, 
      'DECODE_ERROR'
    );
  }
}

/**
 * Main function to process a Playwright report file
 */
export async function processPlaywrightReportFile(file: File): Promise<ProcessedReport> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  // Check if this is an HTML report with embedded ZIP
  const htmlFile = zip.file('index.html');
  if (htmlFile) {
    const htmlContent = await htmlFile.async('string');
    const embeddedZipData = await extractFromHtmlReport(htmlContent);
    const embeddedZip = await JSZip.loadAsync(embeddedZipData);
    
    const { tests } = await extractTestsFromZip(embeddedZip);
    
    // Extract metadata if available
    let metadata: Record<string, any> = {};
    const reportFile = embeddedZip.file('report.json');
    if (reportFile) {
      try {
        const reportContent = await reportFile.async('string');
        const reportData = JSON.parse(reportContent);
        metadata = reportData.metadata || {};
      } catch (error) {
        console.error('Error parsing report metadata:', error);
      }
    }
    
    return { tests, metadata };
  }
  
  // Process as regular ZIP file
  const { tests } = await extractTestsFromZip(zip);
  return { tests };
}
