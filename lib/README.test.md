# Playwright Report Utils Tests

This directory contains unit tests for the Playwright report processing utilities.

## Test Coverage

The test suite covers:

### Core Functionality
- ✅ Processing valid Playwright HTML reports
- ✅ Extracting test metadata (id, name, status, duration, file)
- ✅ Handling different test statuses (passed, failed, flaky, skipped, timedOut)
- ✅ Extracting retry results for flaky tests
- ✅ Extracting error messages and stack traces
- ✅ Extracting screenshot paths
- ✅ Extracting test location information (file, line, column)
- ✅ Extracting worker index and start time
- ✅ Extracting CI metadata
- ✅ Handling retry results with attachments

### Error Handling
- ✅ Throwing `ReportProcessingError` for invalid files
- ✅ Handling empty test reports gracefully

### Data Validation
- ✅ Validating test result structure consistency
- ✅ Type checking for all fields

## Running Tests

### Run all tests
```bash
pnpm test
```

### Run tests once (CI mode)
```bash
pnpm test:run
```

### Run tests with UI
```bash
pnpm test:ui
```

### Run tests with coverage
```bash
pnpm test:coverage
```

## Test Data

The tests use a real Playwright report file located at:
```
/Users/harbra/Downloads/playwright-report-testing-466.zip
```

This ensures that the tests validate against actual Playwright report format.

## Test Structure

```typescript
describe('playwright-report-utils', () => {
  describe('processPlaywrightReportFile', () => {
    // Main functionality tests
  });
  
  describe('Test result structure validation', () => {
    // Data structure validation tests
  });
  
  describe('ReportProcessingError', () => {
    // Error class tests
  });
});
```

## Adding New Tests

When adding new tests:

1. Follow the existing test structure
2. Use descriptive test names that explain what is being tested
3. Test both success and failure cases
4. Validate data types and structure
5. Use the real test report file when possible

## Example Test

```typescript
it('should extract test metadata correctly', async () => {
  const result = await processPlaywrightReportFile(testReportFile);
  const firstTest = result.tests[0];

  expect(firstTest).toHaveProperty('id');
  expect(firstTest).toHaveProperty('name');
  expect(firstTest).toHaveProperty('status');
  expect(firstTest).toHaveProperty('duration');
  expect(firstTest).toHaveProperty('file');
  expect(firstTest).toHaveProperty('screenshots');
});
```

## CI Integration

These tests can be integrated into your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run tests
  run: pnpm test:run

- name: Generate coverage
  run: pnpm test:coverage
```

## Troubleshooting

### Tests fail with "file not found"
Ensure the test report file exists at the expected path:
```bash
ls -lh /Users/harbra/Downloads/playwright-report-testing-466.zip
```

### Import errors
Make sure all dependencies are installed:
```bash
pnpm install
```

### TypeScript errors
Ensure TypeScript is properly configured and all types are available:
```bash
npx tsc --noEmit
```
