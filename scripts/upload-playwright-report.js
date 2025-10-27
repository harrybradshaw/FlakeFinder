#!/usr/bin/env node

/**
 * Playwright Test Report Upload Script
 *
 * This script uploads Playwright HTML reports to the test viewer application
 * from CI/CD environments. It optimizes reports BEFORE upload to reduce bandwidth.
 *
 * Installation:
 *   npm install jszip
 *
 * Usage:
 *   node upload-playwright-report.js <report-path> [options]
 *
 * Required Environment Variables:
 *   TEST_VIEWER_API_KEY - API key for authentication (starts with ptv_)
 *   TEST_VIEWER_URL - Base URL of the test viewer application
 *
 * Required Arguments:
 *   report-path - Path to the Playwright HTML report ZIP file
 *
 * Optional Environment Variables:
 *   TEST_VIEWER_ENVIRONMENT - Environment name (e.g., production, staging)
 *   TEST_VIEWER_TRIGGER - Trigger type (e.g., merge_queue, pull_request)
 *   TEST_VIEWER_SUITE - Test suite name
 *   TEST_VIEWER_BRANCH - Git branch name (auto-detected from CI)
 *   TEST_VIEWER_COMMIT - Git commit SHA (auto-detected from CI)
 *   TEST_VIEWER_OPTIMIZE - Enable optimization (default: true)
 *
 * Example:
 *   TEST_VIEWER_API_KEY=ptv_xxx TEST_VIEWER_URL=https://test-viewer.app \
 *   node upload-playwright-report.js ./playwright-report.zip
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Check for JSZip dependency (only needed if optimization is enabled)
let JSZip = null;
try {
  JSZip = require("jszip");
} catch (_err) {
  // Will check later if optimization is requested
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Playwright Test Report Upload Script

Usage: node upload-playwright-report.js <report-path> [options]

Required Environment Variables:
  TEST_VIEWER_API_KEY       API key for authentication (starts with ptv_)
  TEST_VIEWER_URL           Base URL of the test viewer application

Optional Environment Variables:
  TEST_VIEWER_ENVIRONMENT   Environment name (default: from CI or "development")
  TEST_VIEWER_TRIGGER       Trigger type (default: from CI or "ci")
  TEST_VIEWER_SUITE         Test suite name (default: "default")
  TEST_VIEWER_BRANCH        Git branch name (auto-detected from CI)
  TEST_VIEWER_COMMIT        Git commit SHA (auto-detected from CI)
  TEST_VIEWER_OPTIMIZE      Enable optimization (default: true)
  TEST_VIEWER_PROJECT       Project name (optional, uses API key default)

Arguments:
  report-path              Path to the Playwright HTML report ZIP file

Examples:
  # Basic usage
  node upload-playwright-report.js ./playwright-report.zip

  # With explicit metadata
  TEST_VIEWER_ENVIRONMENT=production TEST_VIEWER_SUITE=e2e \\
    node upload-playwright-report.js ./playwright-report.zip
`);
  process.exit(0);
}

const reportPath = args[0];

// Validate required environment variables
const apiKey = process.env.TEST_VIEWER_API_KEY;
const baseUrl = process.env.TEST_VIEWER_URL;

if (!apiKey) {
  console.error(
    "❌ Error: TEST_VIEWER_API_KEY environment variable is required",
  );
  process.exit(1);
}

if (!baseUrl) {
  console.error("❌ Error: TEST_VIEWER_URL environment variable is required");
  process.exit(1);
}

if (!apiKey.startsWith("ptv_")) {
  console.error(
    '❌ Error: Invalid API key format. API keys must start with "ptv_"',
  );
  process.exit(1);
}

// Validate report file exists
if (!fs.existsSync(reportPath)) {
  console.error(`❌ Error: Report file not found: ${reportPath}`);
  process.exit(1);
}

const reportStats = fs.statSync(reportPath);
if (!reportStats.isFile()) {
  console.error(`❌ Error: Report path is not a file: ${reportPath}`);
  process.exit(1);
}

// Auto-detect CI metadata
function detectEnvironment() {
  // Check explicit setting
  if (process.env.TEST_VIEWER_ENVIRONMENT) {
    return process.env.TEST_VIEWER_ENVIRONMENT;
  }

  // Detect from GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    const ref = process.env.GITHUB_REF || "";
    if (ref.includes("main") || ref.includes("master")) {
      return "production";
    }
    if (ref.includes("staging") || ref.includes("stage")) {
      return "staging";
    }
    return "development";
  }

  // Default
  return "development";
}

function detectTrigger() {
  // Check explicit setting
  if (process.env.TEST_VIEWER_TRIGGER) {
    return process.env.TEST_VIEWER_TRIGGER;
  }

  // Detect from GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    const eventName = process.env.GITHUB_EVENT_NAME || "";
    if (eventName === "pull_request") {
      return "pull_request";
    }
    if (eventName === "merge_group") {
      return "merge_queue";
    }
    if (eventName === "workflow_dispatch") {
      return "ci";
    }
    if (eventName === "push") {
      return "merge_queue";
    }
  }

  // Default
  return "ci";
}

function detectBranch() {
  // Check explicit setting
  if (process.env.TEST_VIEWER_BRANCH) {
    return process.env.TEST_VIEWER_BRANCH;
  }

  // Detect from GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    return (
      process.env.GITHUB_HEAD_REF || // PR branch
      process.env.GITHUB_REF_NAME || // Branch/tag name
      "main"
    );
  }

  // Detect from Git
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    return "main";
  }
}

function detectCommit() {
  // Check explicit setting
  if (process.env.TEST_VIEWER_COMMIT) {
    return process.env.TEST_VIEWER_COMMIT;
  }

  // Detect from GitHub Actions
  if (process.env.GITHUB_ACTIONS) {
    return process.env.GITHUB_SHA || "";
  }

  // Detect from Git
  try {
    const { execSync } = require("child_process");
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// Collect upload parameters
const params = {
  environment: detectEnvironment(),
  trigger: detectTrigger(),
  suite: process.env.TEST_VIEWER_SUITE || "default",
  branch: detectBranch(),
  commit: detectCommit(),
  optimize: process.env.TEST_VIEWER_OPTIMIZE !== "false",
  project: process.env.TEST_VIEWER_PROJECT || null,
};

console.log("📤 Uploading Playwright Report");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`📁 File:        ${reportPath}`);
console.log(
  `📊 Size:        ${(reportStats.size / 1024 / 1024).toFixed(2)} MB`,
);
console.log(`🌍 Environment: ${params.environment}`);
console.log(`🔔 Trigger:     ${params.trigger}`);
console.log(`📦 Suite:       ${params.suite}`);
console.log(`🌿 Branch:      ${params.branch}`);
console.log(`📝 Commit:      ${params.commit || "(none)"}`);
console.log(`⚡ Optimize:    ${params.optimize ? "yes" : "no"}`);
console.log(`🔗 Endpoint:    ${baseUrl}/api/ci-upload`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Optimize report before upload if requested
async function optimizeReport(filePath) {
  if (!JSZip) {
    console.error("❌ Error: jszip package is required for optimization");
    console.error("   Run: npm install jszip");
    process.exit(1);
  }

  console.log("⚙️  Optimizing report before upload...\n");

  const fileBuffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(fileBuffer);
  const optimizedZip = new JSZip();

  // Patterns to exclude (large files we don't need)
  const excludePatterns = [
    /data\/.*\.zip$/, // All ZIPs in data folder (traces, etc.)
    /data\/trace\//, // Entire trace directory
    /\.trace$/, // Raw trace files
    /video\.webm$/, // Videos (we only use screenshots)
    /\.har$/, // HAR files (network logs)
    /\.network$/, // Network logs
  ];

  let filesRemoved = 0;
  let bytesRemoved = 0;
  let filesKept = 0;

  for (const [filePath, file] of Object.entries(zip.files)) {
    if (file.dir) {
      optimizedZip.folder(filePath);
      continue;
    }

    const shouldExclude = excludePatterns.some((pattern) =>
      pattern.test(filePath),
    );

    if (shouldExclude) {
      const content = await file.async("nodebuffer");
      filesRemoved++;
      bytesRemoved += content.length;
    } else {
      const content = await file.async("nodebuffer");
      optimizedZip.file(filePath, content);
      filesKept++;
    }
  }

  const optimizedBuffer = await optimizedZip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const originalSize = fileBuffer.length;
  const optimizedSize = optimizedBuffer.length;
  const savings = (
    ((originalSize - optimizedSize) / originalSize) *
    100
  ).toFixed(1);

  console.log(`✅ Optimization complete:`);
  console.log(`   Original:  ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Optimized: ${(optimizedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `   Saved:     ${(bytesRemoved / 1024 / 1024).toFixed(2)} MB (${savings}%)`,
  );
  console.log(`   Removed:   ${filesRemoved} files`);
  console.log(`   Kept:      ${filesKept} files\n`);

  return optimizedBuffer;
}

// Create form data
async function uploadReport(fileBuffer) {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/ci-upload", baseUrl);
    const protocol = url.protocol === "https:" ? https : http;

    // Generate multipart form data boundary
    const boundary = `----WebKitFormBoundary${Date.now()}`;

    const fileName = path.basename(reportPath);

    // Build multipart form data
    const parts = [];

    // Add file
    parts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
        `Content-Type: application/zip\r\n\r\n`,
    );
    parts.push(fileBuffer);
    parts.push("\r\n");

    // Add metadata fields
    // Note: optimize is set to false because we already optimized client-side
    const fields = {
      environment: params.environment,
      trigger: params.trigger,
      suite: params.suite,
      branch: params.branch,
      commit: params.commit,
      optimize: "false", // Already optimized before upload
    };

    if (params.project) {
      fields.project = params.project;
    }

    for (const [key, value] of Object.entries(fields)) {
      if (value) {
        parts.push(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
            `${value}\r\n`,
        );
      }
    }

    // Add closing boundary
    parts.push(`--${boundary}--\r\n`);

    // Calculate content length
    let contentLength = 0;
    for (const part of parts) {
      if (Buffer.isBuffer(part)) {
        contentLength += part.length;
      } else {
        contentLength += Buffer.byteLength(part);
      }
    }

    // Build request
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": contentLength,
      },
    };

    console.log("🚀 Uploading...\n");
    const startTime = Date.now();

    const req = protocol.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        try {
          const response = JSON.parse(data);

          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log("✅ Upload successful!\n");
            console.log(`⏱️  Duration: ${duration}s`);
            console.log(`📊 Tests: ${response.testRun.total || "N/A"}`);
            console.log(`✓  Passed: ${response.testRun.passed || 0}`);
            console.log(`✗  Failed: ${response.testRun.failed || 0}`);
            if (response.testRun.flaky > 0) {
              console.log(`⚠  Flaky: ${response.testRun.flaky}`);
            }
            if (response.optimized !== undefined) {
              console.log(`⚡ Optimized: ${response.optimized ? "yes" : "no"}`);
            }
            console.log(`\n📝 Test Run ID: ${response.testRunId}`);

            if (response.message) {
              console.log(`\n💬 ${response.message}`);
            }

            resolve(response);
          } else if (res.statusCode === 409) {
            console.warn("⚠️  Duplicate upload detected\n");
            console.warn(
              `💬 ${response.message || "This test run was already uploaded"}`,
            );
            if (response.existingRunId) {
              console.warn(`📝 Existing Run ID: ${response.existingRunId}`);
            }
            resolve(response);
          } else {
            console.error(`❌ Upload failed (HTTP ${res.statusCode})\n`);
            console.error(
              `💬 ${response.error || response.message || "Unknown error"}`,
            );
            if (response.details) {
              console.error(`📋 Details: ${response.details}`);
            }
            reject(new Error(response.error || `HTTP ${res.statusCode}`));
          }
        } catch (error) {
          console.error("❌ Failed to parse response\n");
          console.error(`HTTP ${res.statusCode}: ${data}`);
          reject(new Error(`Invalid response: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => {
      console.error("❌ Upload failed\n");
      console.error(`💬 ${error.message}`);
      reject(error);
    });

    // Write form data
    for (const part of parts) {
      req.write(part);
    }

    req.end();
  });
}

// Execute upload
async function main() {
  let fileBuffer;

  if (params.optimize) {
    // Check if JSZip is available
    if (!JSZip) {
      console.warn("⚠️  Warning: jszip not installed, skipping optimization");
      console.warn("   Install with: npm install jszip");
      console.warn("   Uploading unoptimized report...\n");
      fileBuffer = fs.readFileSync(reportPath);
    } else {
      fileBuffer = await optimizeReport(reportPath);
    }
  } else {
    console.log("⏭️  Skipping optimization (disabled)\n");
    fileBuffer = fs.readFileSync(reportPath);
  }

  await uploadReport(fileBuffer);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Upload failed:", error.message);
    process.exit(1);
  });
