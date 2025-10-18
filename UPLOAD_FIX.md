# Upload Route Fix

## Problem
The upload route was not extracting tests from Playwright HTML reports. It was only looking for JSON format reports.

## Root Cause
Playwright generates HTML reports with embedded data stored as a base64-encoded zip file within the HTML. The data structure is:
- Outer ZIP contains `index.html` and `data/` folder
- `index.html` contains `window.playwrightReportBase64` with base64-encoded zip
- Embedded zip contains individual test files as `{hash}.json` files
- Each test file has a `tests` array with test results

## Solution
Updated `/app/api/upload-zip/route.ts` to:
1. Detect HTML report format by checking for `index.html`
2. Extract base64-encoded zip from HTML
3. Parse individual test JSON files from embedded zip
4. Build tests array from the extracted test data
5. Fall back to old JSON format if HTML not found

## Testing
Your example report at `/Users/harbra/Downloads/playwright-report-staging-463.zip` should now work correctly.

The route will extract:
- 39 total tests
- Test names, statuses, durations
- Error messages for failed tests
- Screenshot attachments
- File paths for each test
