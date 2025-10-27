import fs from "fs";
import JSZip from "jszip";

// Helper to convert Buffer to Uint8Array for JSZip (TS 5.9 compatibility)
const toUint8Array = (buffer: Buffer): Uint8Array => new Uint8Array(buffer);

async function checkStepsInReport() {
  const zipPath =
    "lib/__tests__/fixtures/playwright-report-with-allure-metadata.zip";
  const data = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(toUint8Array(data));

  // Extract HTML report
  const htmlFile = zip.file("index.html");
  if (!htmlFile) {
    console.log("❌ No index.html found");
    return;
  }

  const htmlContent = await htmlFile.async("string");
  const match = htmlContent.match(/window\.playwrightReportBase64 = "([^"]+)"/);

  if (!match) {
    console.log("❌ No embedded report found");
    return;
  }

  const reportZip = await JSZip.loadAsync(
    toUint8Array(Buffer.from(match[1], "base64")),
  );

  console.log("📊 Checking for test steps in Playwright report...\n");

  let foundSteps = false;
  let fileCount = 0;

  // Check test files for steps
  for (const fileName of Object.keys(reportZip.files)) {
    if (
      fileName.endsWith(".json") &&
      fileName !== "report.json" &&
      !fileName.startsWith("__MACOSX")
    ) {
      fileCount++;
      const content = await reportZip.file(fileName)?.async("string");
      if (!content) continue;

      const data = JSON.parse(content);

      if (data.tests && data.tests[0] && data.tests[0].results) {
        for (const result of data.tests[0].results) {
          if ("steps" in result) {
            foundSteps = true;
            console.log(`✅ Found steps in: ${fileName}`);
            console.log(`   Test: ${data.tests[0].title}`);
            console.log(`   Steps count: ${result.steps?.length || 0}`);

            if (result.steps && result.steps.length > 0) {
              console.log(`   First step: ${result.steps[0].title}`);
              console.log(
                `   Step structure:`,
                JSON.stringify(result.steps[0], null, 2),
              );
            }
            console.log("");
            break;
          }
        }
      }

      if (fileCount >= 3 && foundSteps) break; // Check first 3 files
    }
  }

  if (!foundSteps) {
    console.log("❌ No steps found in test results");
    console.log("   This Playwright report may not include step data");
    console.log(
      "   Steps are available in Playwright v1.30+ with HTML reporter",
    );
  }

  console.log(`\n📁 Checked ${fileCount} test files`);
}

checkStepsInReport().catch(console.error);
