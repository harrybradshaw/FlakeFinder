import { calculateContentHash } from "@/lib/playwright-report-utils";
import type { Environment, Trigger } from "@/types/api";

interface CIMetadata {
  commitHash?: string;
  GITHUB_HEAD_REF?: string;
  GITHUB_REF_NAME?: string;
  BRANCH?: string;
  GIT_BRANCH?: string;
  CI_COMMIT_BRANCH?: string;
  prTitle?: string;
  prHref?: string;
  commitHref?: string;
  buildHref?: string;
}

interface MetadataExtractionResult {
  success: boolean;
  metadata?: CIMetadata;
  detectedEnvironment?: string;
  detectedTrigger?: string;
  detectedBranch?: string;
  detectedCommit?: string;
  contentHash?: string;
}

interface MetadataExtractionOptions {
  file: File;
  environments: Environment[];
  triggers: Trigger[];
  currentEnvironment?: string;
  currentTrigger?: string;
  currentCommit?: string;
}

export async function extractMetadataFromZip(
  options: MetadataExtractionOptions,
): Promise<MetadataExtractionResult> {
  const {
    file,
    environments,
    triggers,
    currentEnvironment,
    currentTrigger,
    currentCommit,
  } = options;

  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);

    // Extract info from filename
    const filename = file.name.toLowerCase();

    // Detect environment from filename by checking against database values
    let detectedEnvironment = currentEnvironment;
    if (!detectedEnvironment && environments.length > 0) {
      for (const env of environments) {
        const envName = env.name.toLowerCase();
        // Check if filename contains environment name or common variations
        if (
          filename.includes(envName) ||
          (envName === "production" && filename.includes("prod")) ||
          (envName === "staging" && filename.includes("stage")) ||
          (envName === "development" &&
            (filename.includes("dev") || filename.includes("preview")))
        ) {
          detectedEnvironment = env.name;
          console.log(
            `[Auto-detect] Detected environment from filename: ${env.name}`,
          );
          break;
        }
      }
    }

    // Detect trigger from filename by checking against database values
    let detectedTrigger = currentTrigger;
    if (!detectedTrigger && triggers.length > 0) {
      for (const trig of triggers) {
        const trigName = trig.name.toLowerCase();
        // Check if filename contains trigger name with common variations
        if (
          filename.includes(trigName) ||
          filename.includes(trigName.replace("_", "-")) ||
          (trigName === "pull_request" && filename.includes("pr"))
        ) {
          detectedTrigger = trig.name;
          break;
        }
      }
      // Default to merge_queue if no match found
      if (!detectedTrigger) {
        const mergeQueueTrigger = triggers.find(
          (t) => t.name === "merge_queue",
        );
        if (mergeQueueTrigger) {
          detectedTrigger = mergeQueueTrigger.name;
        }
      }
    }

    // Check for HTML report
    const htmlFile = zip.file("index.html");
    if (htmlFile) {
      const htmlContent = await htmlFile.async("string");
      const match = htmlContent.match(
        /window\.playwrightReportBase64 = "([^"]+)"/,
      );
      if (match) {
        const dataUri = match[1];
        const base64Data = dataUri.replace("data:application/zip;base64,", "");

        // Decode base64 in browser
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const embeddedZip = await JSZip.loadAsync(bytes);
        const reportFile = embeddedZip.file("report.json");

        if (reportFile) {
          const reportContent = await reportFile.async("string");
          const reportData = JSON.parse(reportContent);
          // Extract metadata
          const metadata = reportData.metadata?.ci || {};

          // Auto-fill commit if available
          let detectedCommit = currentCommit;
          if (metadata.commitHash && !detectedCommit) {
            detectedCommit = metadata.commitHash;
          }

          // Extract branch from CI metadata (prefer CI env vars over URL parsing)
          let detectedBranch =
            metadata.GITHUB_HEAD_REF || // GitHub PR branch
            metadata.GITHUB_REF_NAME || // GitHub branch/tag name
            metadata.BRANCH ||
            metadata.GIT_BRANCH ||
            metadata.CI_COMMIT_BRANCH ||
            null;

          // If we have PR metadata but no branch, extract from PR title
          if (!detectedBranch && metadata.prTitle) {
            // Try to extract ticket/issue key from PR title (e.g., "WS-2938: Fix something" -> "WS-2938")
            const ticketMatch = metadata.prTitle.match(/^([A-Z]+-\d+)/);
            if (ticketMatch) {
              detectedBranch = ticketMatch[1];
            } else {
              // If no ticket pattern, use PR number from URL
              const prMatch = metadata.prHref?.match(/\/pull\/(\d+)$/);
              if (prMatch) {
                detectedBranch = `pr-${prMatch[1]}`;
              }
            }
          }

          // Fallback: try to extract from commit URL if CI metadata didn't have it
          if (!detectedBranch && metadata.commitHref) {
            const branchMatch = metadata.commitHref.match(/\/tree\/([^/]+)/);
            if (branchMatch) {
              detectedBranch = branchMatch[1];
            }
          }

          // Final fallback to "main" if nothing found
          if (!detectedBranch) {
            detectedBranch = "main";
          }

          // Try to infer environment from branch name if not detected from filename
          if (!detectedEnvironment && detectedBranch) {
            const branchName = detectedBranch.toLowerCase();
            if (
              branchName.includes("prod") ||
              branchName === "main" ||
              branchName === "master"
            ) {
              detectedEnvironment = "production";
            } else if (
              branchName.includes("staging") ||
              branchName.includes("stage")
            ) {
              detectedEnvironment = "staging";
            } else {
              detectedEnvironment = "development";
            }
          }

          // Try to infer trigger from URL patterns if not detected from filename
          if (!detectedTrigger && metadata.buildHref) {
            if (metadata.buildHref.includes("pull_request")) {
              detectedTrigger = "pull_request";
            } else if (metadata.buildHref.includes("workflow_dispatch")) {
              detectedTrigger = "ci";
            } else {
              detectedTrigger = "merge_queue";
            }
          } else if (!detectedTrigger) {
            detectedTrigger = "merge_queue";
          }

          // Calculate hash for later duplicate checking
          let contentHash: string | undefined;
          try {
            const { processPlaywrightReportFile } = await import(
              "@/lib/playwright-report-utils"
            );
            const { tests } = await processPlaywrightReportFile(file);
            contentHash = await calculateContentHash(tests);
            console.log("[Upload] Calculated hash:", contentHash);
          } catch (error) {
            console.error("[Upload] Failed to calculate hash:", error);
          }

          return {
            success: true,
            metadata,
            detectedEnvironment,
            detectedTrigger,
            detectedBranch,
            detectedCommit,
            contentHash,
          };
        }
      }
    }
  } catch (error) {
    console.error("Failed to extract metadata:", error);
  }

  return { success: false };
}
