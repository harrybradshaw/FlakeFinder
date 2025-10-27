#!/usr/bin/env tsx
/**
 * Generate Supabase TypeScript types from database schema
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });

const projectId = process.env.SUPABASE_PROJECT_ID;

if (!projectId) {
  console.error("Error: SUPABASE_PROJECT_ID not found in .env.local");
  process.exit(1);
}

console.log(`Generating types for project: ${projectId}`);

try {
  const command = `npx supabase gen types typescript --project-id "${projectId}" --schema public`;

  console.log("Running:", command);

  const output = execSync(command, {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "inherit"],
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });

  // Write to file
  const typesPath = resolve(process.cwd(), "types/supabase.ts");

  writeFileSync(typesPath, output);

  console.log(`✅ Types generated successfully at ${typesPath}`);
} catch (error) {
  console.error("Failed to generate types:", error);
  process.exit(1);
}
