#!/usr/bin/env tsx
/**
 * One-time migration script to convert base64 screenshots to Supabase Storage
 *
 * This script:
 * 1. Finds all tests with base64-encoded screenshots
 * 2. Decodes the base64 data to binary
 * 3. Uploads to Supabase Storage
 * 4. Generates signed URLs
 * 5. Updates database with new URLs
 *
 * Usage:
 *   tsx scripts/migrate-base64-to-storage.ts [--dry-run] [--batch-size=50]
 */

import { createClient } from "@supabase/supabase-js";

// Configuration
const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = parseInt(
  process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1] ||
    "50",
);

interface Test {
  id: string;
  screenshots: string[];
  test_run_id: string;
}

interface TestResult {
  id: string;
  screenshots: string[];
  test_id: string;
}

async function migrateBase64ToStorage() {
  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Missing required environment variables:");
    console.error("   NEXT_PUBLIC_SUPABASE_URL");
    console.error("   SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("🚀 Starting base64 to storage migration...");
  console.log(
    `   Mode: ${DRY_RUN ? "DRY RUN (no changes will be made)" : "LIVE"}`,
  );
  console.log(`   Batch size: ${BATCH_SIZE}`);
  console.log("");

  let totalTests = 0;
  let totalScreenshots = 0;
  let migratedScreenshots = 0;
  let errors = 0;

  // Step 1: Find tests with base64 screenshots
  console.log("📊 Finding tests with base64 screenshots...");

  const { data: tests, error: testsError } = await supabase
    .from("tests")
    .select("id, screenshots, test_run_id")
    .not("screenshots", "is", null)
    .limit(1000); // Process in chunks

  if (testsError) {
    console.error("❌ Failed to fetch tests:", testsError);
    process.exit(1);
  }

  // Filter tests with base64 screenshots
  const base64Tests = (tests || []).filter((test: Test) =>
    test.screenshots?.some((url: string) => url.startsWith("data:image")),
  );

  totalTests = base64Tests.length;
  console.log(`   Found ${totalTests} tests with base64 screenshots`);
  console.log("");

  if (totalTests === 0) {
    console.log("✅ No base64 screenshots to migrate!");
    return;
  }

  // Step 2: Process tests in batches
  for (let i = 0; i < base64Tests.length; i += BATCH_SIZE) {
    const batch = base64Tests.slice(i, i + BATCH_SIZE);
    console.log(
      `📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(base64Tests.length / BATCH_SIZE)} (${batch.length} tests)...`,
    );

    for (const test of batch) {
      const newScreenshots: string[] = [];

      for (let idx = 0; idx < test.screenshots.length; idx++) {
        const screenshot = test.screenshots[idx];
        totalScreenshots++;

        // Skip if already a URL (not base64)
        if (!screenshot.startsWith("data:image")) {
          newScreenshots.push(screenshot);
          continue;
        }

        try {
          // Parse base64 data
          const matches = screenshot.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!matches) {
            console.warn(
              `   ⚠️  Invalid base64 format for test ${test.id}, screenshot ${idx}`,
            );
            errors++;
            newScreenshots.push(screenshot); // Keep original
            continue;
          }

          const [, imageType, base64Data] = matches;

          if (DRY_RUN) {
            console.log(
              `   [DRY RUN] Would upload screenshot ${idx + 1}/${test.screenshots.length} for test ${test.id}`,
            );
            migratedScreenshots++;
            continue;
          }

          // Decode base64 to buffer
          const buffer = Buffer.from(base64Data, "base64");

          // Generate unique filename
          const timestamp = Date.now();
          const fileName = `migrated-${test.id}-${idx}.${imageType}`;
          const storagePath = `screenshots/${timestamp}-${fileName}`;

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from("test-screenshots")
            .upload(storagePath, buffer, {
              contentType: `image/${imageType}`,
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            console.error(
              `   ❌ Failed to upload screenshot for test ${test.id}:`,
              uploadError.message,
            );
            errors++;
            newScreenshots.push(screenshot); // Keep original on error
            continue;
          }

          // Generate signed URL (valid for 1 year)
          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage
              .from("test-screenshots")
              .createSignedUrl(storagePath, 31536000);

          if (signedUrlError) {
            console.error(
              `   ❌ Failed to generate signed URL for test ${test.id}:`,
              signedUrlError.message,
            );
            errors++;
            // Try to delete the uploaded file
            await supabase.storage
              .from("test-screenshots")
              .remove([storagePath]);
            newScreenshots.push(screenshot); // Keep original on error
            continue;
          }

          newScreenshots.push(signedUrlData.signedUrl);
          migratedScreenshots++;

          // Log progress every 10 screenshots
          if (migratedScreenshots % 10 === 0) {
            console.log(`   ✓ Migrated ${migratedScreenshots} screenshots...`);
          }
        } catch (error) {
          console.error(
            `   ❌ Error processing screenshot for test ${test.id}:`,
            error,
          );
          errors++;
          newScreenshots.push(screenshot); // Keep original on error
        }
      }

      // Update test with new screenshot URLs
      if (!DRY_RUN && newScreenshots.length > 0) {
        const { error: updateError } = await supabase
          .from("tests")
          .update({ screenshots: newScreenshots })
          .eq("id", test.id);

        if (updateError) {
          console.error(
            `   ❌ Failed to update test ${test.id}:`,
            updateError.message,
          );
          errors++;
        }
      }
    }

    console.log(`   ✓ Batch complete`);
    console.log("");
  }

  // Step 3: Migrate test_results screenshots
  console.log("📊 Finding test_results with base64 screenshots...");

  const { data: testResults, error: testResultsError } = await supabase
    .from("test_results")
    .select("id, screenshots, test_id")
    .not("screenshots", "is", null)
    .limit(1000);

  if (!testResultsError && testResults) {
    const base64TestResults = testResults.filter((result: TestResult) =>
      result.screenshots?.some((url: string) => url.startsWith("data:image")),
    );

    console.log(
      `   Found ${base64TestResults.length} test_results with base64 screenshots`,
    );
    console.log("");

    for (const result of base64TestResults) {
      const newScreenshots: string[] = [];

      for (let idx = 0; idx < result.screenshots.length; idx++) {
        const screenshot = result.screenshots[idx];
        totalScreenshots++;

        if (!screenshot.startsWith("data:image")) {
          newScreenshots.push(screenshot);
          continue;
        }

        try {
          const matches = screenshot.match(/^data:image\/(\w+);base64,(.+)$/);
          if (!matches) {
            errors++;
            newScreenshots.push(screenshot);
            continue;
          }

          const [, imageType, base64Data] = matches;

          if (DRY_RUN) {
            migratedScreenshots++;
            continue;
          }

          const buffer = Buffer.from(base64Data, "base64");
          const timestamp = Date.now();
          const fileName = `migrated-result-${result.id}-${idx}.${imageType}`;
          const storagePath = `screenshots/${timestamp}-${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("test-screenshots")
            .upload(storagePath, buffer, {
              contentType: `image/${imageType}`,
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            errors++;
            newScreenshots.push(screenshot);
            continue;
          }

          const { data: signedUrlData, error: signedUrlError } =
            await supabase.storage
              .from("test-screenshots")
              .createSignedUrl(storagePath, 31536000);

          if (signedUrlError) {
            errors++;
            await supabase.storage
              .from("test-screenshots")
              .remove([storagePath]);
            newScreenshots.push(screenshot);
            continue;
          }

          newScreenshots.push(signedUrlData.signedUrl);
          migratedScreenshots++;
        } catch {
          errors++;
          newScreenshots.push(screenshot);
        }
      }

      if (!DRY_RUN && newScreenshots.length > 0) {
        await supabase
          .from("test_results")
          .update({ screenshots: newScreenshots })
          .eq("id", result.id);
      }
    }
  }

  // Summary
  console.log("");
  console.log("═══════════════════════════════════════════");
  console.log("📊 Migration Summary");
  console.log("═══════════════════════════════════════════");
  console.log(`   Tests processed: ${totalTests}`);
  console.log(`   Total screenshots found: ${totalScreenshots}`);
  console.log(`   Screenshots migrated: ${migratedScreenshots}`);
  console.log(`   Errors: ${errors}`);
  console.log("");

  if (DRY_RUN) {
    console.log("ℹ️  This was a DRY RUN - no changes were made");
    console.log("   Run without --dry-run to perform the actual migration");
  } else {
    console.log("✅ Migration complete!");

    if (errors > 0) {
      console.log("");
      console.log(`⚠️  ${errors} errors occurred during migration`);
      console.log("   Check the logs above for details");
      console.log("   Failed screenshots remain as base64 in the database");
    }
  }
}

// Run migration
migrateBase64ToStorage().catch((error) => {
  console.error("💥 Migration failed:", error);
  process.exit(1);
});
