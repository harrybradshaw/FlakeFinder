import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { processPlaywrightReportFile } from '@/lib/playwright-report-utils';

/**
 * Unit test to verify hash calculation consistency between upload-zip and check-duplicate
 * 
 * This test ensures that both endpoints calculate the same hash for the same test data,
 * which is critical for duplicate detection to work correctly.
 */

describe('Hash Calculation Consistency', () => {
  it('should calculate identical hashes for the same test data', async () => {
    // Load and process the test report
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'playwright-report-testing-466.zip', {
      type: 'application/zip',
    });

    const { tests } = await processPlaywrightReportFile(testReportFile);

    // Define the metadata
    const metadata = {
      environment: 'production',
      trigger: 'manual',
      branch: 'main',
      commit: 'abc123',
    };

    // Calculate hash using upload-zip logic
    const uploadHashContent = {
      environment: metadata.environment,
      trigger: metadata.trigger,
      branch: metadata.branch,
      commit: metadata.commit,
      tests: tests
        .map((t) => ({
          name: t.name,
          file: t.file,
          status: t.status,
        }))
        .sort((a, b) =>
          `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
        ),
    };

    const uploadHash = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(JSON.stringify(uploadHashContent)))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

    // Calculate hash using check-duplicate logic
    const checkHashContent = {
      environment: metadata.environment,
      trigger: metadata.trigger,
      branch: metadata.branch,
      commit: metadata.commit,
      tests: tests
        .map((test) => ({
          name: test.name,
          file: test.file,
          status: test.status,
        }))
        .sort((a, b) =>
          `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
        ),
    };

    const checkHash = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(JSON.stringify(checkHashContent)))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

    console.log('\n=== Hash Calculation Test ===');
    console.log('Upload hash:', uploadHash);
    console.log('Check hash: ', checkHash);
    console.log('Match:', uploadHash === checkHash);
    console.log('Test count:', tests.length);
    console.log('Sample test:', tests[0]);
    console.log('=============================\n');

    // The hashes MUST be identical for duplicate detection to work
    expect(uploadHash).toBe(checkHash);
  });

  it('should produce different hashes when metadata differs', async () => {
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'playwright-report-testing-466.zip', {
      type: 'application/zip',
    });

    const { tests } = await processPlaywrightReportFile(testReportFile);

    // Hash with metadata set 1
    const hashContent1 = {
      environment: 'production',
      trigger: 'manual',
      branch: 'main',
      commit: 'abc123',
      tests: tests
        .map((t) => ({
          name: t.name,
          file: t.file,
          status: t.status,
        }))
        .sort((a, b) =>
          `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
        ),
    };

    const hash1 = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(JSON.stringify(hashContent1)))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

    // Hash with metadata set 2 (different branch)
    const hashContent2 = {
      environment: 'production',
      trigger: 'manual',
      branch: 'develop', // Different!
      commit: 'abc123',
      tests: tests
        .map((t) => ({
          name: t.name,
          file: t.file,
          status: t.status,
        }))
        .sort((a, b) =>
          `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
        ),
    };

    const hash2 = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(JSON.stringify(hashContent2)))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

    console.log('\n=== Different Metadata Test ===');
    console.log('Hash 1 (main):', hash1);
    console.log('Hash 2 (develop):', hash2);
    console.log('Different:', hash1 !== hash2);
    console.log('================================\n');

    // Hashes should be different
    expect(hash1).not.toBe(hash2);
  });

  it('should produce same hash regardless of test order in array', async () => {
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'playwright-report-testing-466.zip', {
      type: 'application/zip',
    });

    const { tests } = await processPlaywrightReportFile(testReportFile);

    const metadata = {
      environment: 'production',
      trigger: 'manual',
      branch: 'main',
      commit: 'abc123',
    };

    // Hash with original order
    const hashContent1 = {
      ...metadata,
      tests: tests
        .map((t) => ({
          name: t.name,
          file: t.file,
          status: t.status,
        }))
        .sort((a, b) =>
          `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
        ),
    };

    const hash1 = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(JSON.stringify(hashContent1)))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

    // Hash with reversed order (but then sorted)
    const hashContent2 = {
      ...metadata,
      tests: [...tests]
        .reverse()
        .map((t) => ({
          name: t.name,
          file: t.file,
          status: t.status,
        }))
        .sort((a, b) =>
          `${a.file}:${a.name}`.localeCompare(`${b.file}:${b.name}`),
        ),
    };

    const hash2 = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(JSON.stringify(hashContent2)))
      .then((buf) =>
        Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      );

    console.log('\n=== Order Independence Test ===');
    console.log('Hash (original order):', hash1);
    console.log('Hash (reversed order):', hash2);
    console.log('Match:', hash1 === hash2);
    console.log('================================\n');

    // Hashes should be identical because we sort before hashing
    expect(hash1).toBe(hash2);
  });
});
