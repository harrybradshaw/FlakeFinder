/**
 * Shared constants for upload functionality
 * This file can be imported by both client and server code
 */

export const uploadZipFormDataFields = {
  file: "file",
  environmentName: "environment",
  triggerName: "trigger",
  suiteId: "suite",
  branch: "branch",
  commit: "commit",
  contentHash: "contentHash",
} as const;
