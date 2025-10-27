# Scripts

This directory contains utility scripts for the test viewer application.

## upload-playwright-report.js

Node.js script for uploading Playwright HTML reports from CI/CD pipelines.

**Key Feature:** Optimizes reports **BEFORE upload** to save bandwidth (60-80% reduction).

### Prerequisites

```bash
# Install jszip for optimization
npm install jszip
```

### Quick Start

```bash
# Set required environment variables
export TEST_VIEWER_API_KEY=ptv_your_api_key_here
export TEST_VIEWER_URL=https://test-viewer.yourcompany.com

# Upload a report (automatically optimized before upload)
node upload-playwright-report.js ./playwright-report.zip
```

### Documentation

See the [CI Upload Guide](../docs/CI_UPLOAD_GUIDE.md) for complete documentation including:

- Database setup instructions
- API key management
- GitHub Actions integration examples
- Troubleshooting guide

### Features

- 🔐 Secure API key authentication
- ⚡ Automatic optimization (removes traces, videos)
- 🤖 Auto-detects metadata from CI environment
- 📊 Duplicate detection
- 🎯 Works with GitHub Actions, GitLab CI, CircleCI, etc.

### Requirements

- Node.js 14+
- Playwright HTML report ZIP file
- Valid API key (starts with `ptv_`)

### Environment Variables

| Variable                  | Required | Description                     |
| ------------------------- | -------- | ------------------------------- |
| `TEST_VIEWER_API_KEY`     | ✅       | Your API key                    |
| `TEST_VIEWER_URL`         | ✅       | Test viewer base URL            |
| `TEST_VIEWER_ENVIRONMENT` | ❌       | Environment (auto-detected)     |
| `TEST_VIEWER_SUITE`       | ❌       | Suite name (default: "default") |

See the full documentation for all available options.
