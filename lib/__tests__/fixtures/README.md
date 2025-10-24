# Test Fixtures

This directory contains sample data files used in unit tests.

## Files

### `playwright-report-sample.zip`

A real Playwright HTML report used for testing the zip extraction utilities.

**Structure:**

```
playwright-report-sample.zip
├── index.html          # HTML report with embedded test data
└── data/
    ├── *.png          # Screenshot attachments
    ├── *.dat          # Metadata files
    └── *.markdown     # Text attachments
```

**Contains:**

- Multiple test results (passed, failed, flaky)
- CI metadata
- Test execution timestamps
- Screenshots and attachments
- Retry results for flaky tests

**Used by:**

- `lib/zip-extraction-utils.test.ts`

**Source:** Generated from a real Playwright test run
