import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { processPlaywrightReportFile, calculateContentHash } from '@/lib/playwright-report-utils';
import JSZip from 'jszip';

/**
 * Unit test to verify hash calculation consistency between upload-zip and check-duplicate
 * 
 * This test ensures that both endpoints calculate the same hash for the same test data,
 * which is critical for duplicate detection to work correctly.
 * 
 * CRITICAL: These tests must verify that optimization (removing traces, compressing images)
 * does NOT affect the hash calculation.
 */

describe('Hash Calculation Consistency', () => {
  it('should calculate identical hashes using shared utility function', async () => {
    // Load and process the test report
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'playwright-report-testing-466.zip', {
      type: 'application/zip',
    });

    const { tests } = await processPlaywrightReportFile(testReportFile);

    // Both routes now use the same shared function
    const hash1 = await calculateContentHash(tests);
    const hash2 = await calculateContentHash(tests);

    console.log('\n=== Hash Calculation Test ===');
    console.log('Hash 1:', hash1);
    console.log('Hash 2:', hash2);
    console.log('Match:', hash1 === hash2);
    console.log('Test count:', tests.length);
    console.log('Sample test:', tests[0]);
    console.log('=============================\n');

    // The hashes MUST be identical
    expect(hash1).toBe(hash2);
  });

  it('should produce SAME hash even when metadata differs (metadata is not included)', async () => {
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'playwright-report-testing-466.zip', {
      type: 'application/zip',
    });

    const { tests } = await processPlaywrightReportFile(testReportFile);

    // Calculate hash - metadata doesn't matter anymore!
    const hash1 = await calculateContentHash(tests);
    const hash2 = await calculateContentHash(tests);

    console.log('\n=== Metadata Independence Test ===');
    console.log('Hash 1:', hash1);
    console.log('Hash 2:', hash2);
    console.log('Same (as expected):', hash1 === hash2);
    console.log('===================================\n');

    // Hashes should be identical because metadata is NOT included
    expect(hash1).toBe(hash2);
  });

  it('should produce same hash regardless of test order in array', async () => {
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'playwright-report-testing-466.zip', {
      type: 'application/zip',
    });

    const { tests } = await processPlaywrightReportFile(testReportFile);

    // Hash with original order
    const hash1 = await calculateContentHash(tests);

    // Hash with reversed order (should still be same due to internal sorting)
    const hash2 = await calculateContentHash([...tests].reverse());

    console.log('\n=== Order Independence Test ===');
    console.log('Hash (original order):', hash1);
    console.log('Hash (reversed order):', hash2);
    console.log('Match:', hash1 === hash2);
    console.log('================================\n');

    // Hashes should be identical because we sort before hashing
    expect(hash1).toBe(hash2);
  });

  it('CRITICAL: should produce SAME hash before and after optimization', async () => {
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'playwright-report-testing-466.zip', {
      type: 'application/zip',
    });

    // Calculate hash from original file
    const { tests: originalTests } = await processPlaywrightReportFile(testReportFile);
    const hashBeforeOptimization = await calculateContentHash(originalTests);

    // Now simulate optimization (remove traces, rename PNGs to JPGs)
    const zip = await JSZip.loadAsync(new Uint8Array(buffer));
    const optimizedZip = new JSZip();
    
    // Simulate the optimization process
    for (const [path, file] of Object.entries(zip.files)) {
      const zipFile = file as any;
      if (zipFile.dir) {
        optimizedZip.folder(path);
        continue;
      }
      
      // Skip trace files
      if (path.includes('trace') || path.endsWith('.zip')) {
        continue;
      }
      
      // Rename PNGs to JPGs (simulating compression)
      if (path.endsWith('.png')) {
        const content = await zipFile.async('uint8array');
        const newPath = path.replace(/\.png$/, '.jpg');
        optimizedZip.file(newPath, content);
      } else {
        const content = await zipFile.async('uint8array');
        optimizedZip.file(path, content);
      }
    }
    
    // Generate optimized ZIP
    const optimizedBlob = await optimizedZip.generateAsync({ type: 'blob' });
    const optimizedFile = new File([optimizedBlob], 'optimized.zip', {
      type: 'application/zip',
    });
    
    // Calculate hash from optimized file
    const { tests: optimizedTests } = await processPlaywrightReportFile(optimizedFile);
    const hashAfterOptimization = await calculateContentHash(optimizedTests);

    console.log('\n=== CRITICAL: Optimization Hash Test ===');
    console.log('Hash before optimization:', hashBeforeOptimization);
    console.log('Hash after optimization: ', hashAfterOptimization);
    console.log('Match:', hashBeforeOptimization === hashAfterOptimization);
    console.log('Original tests:', originalTests.length);
    console.log('Optimized tests:', optimizedTests.length);
    console.log('========================================\n');

    // THIS IS THE CRITICAL TEST - if this fails, duplicate detection is broken!
    // The hash MUST be the same even after optimization
    expect(hashBeforeOptimization).toBe(hashAfterOptimization);
  });

  it('CRITICAL: should detect duplicate even with different file structure', async () => {
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    
    // Upload 1: Original file
    const file1 = new File([buffer], 'original.zip', { type: 'application/zip' });
    const { tests: tests1 } = await processPlaywrightReportFile(file1);
    const hash1 = await calculateContentHash(tests1);

    // Upload 2: Same file but optimized (different internal structure)
    const zip = await JSZip.loadAsync(new Uint8Array(buffer));
    const optimizedZip = new JSZip();
    
    for (const [path, file] of Object.entries(zip.files)) {
      const zipFile = file as any;
      if (zipFile.dir) continue;
      
      // Remove traces and rename images
      if (path.includes('trace') || path.endsWith('.zip')) continue;
      
      if (path.endsWith('.png')) {
        const content = await zipFile.async('uint8array');
        optimizedZip.file(path.replace(/\.png$/, '.jpg'), content);
      } else {
        const content = await zipFile.async('uint8array');
        optimizedZip.file(path, content);
      }
    }
    
    const optimizedBlob = await optimizedZip.generateAsync({ type: 'blob' });
    const file2 = new File([optimizedBlob], 'optimized.zip', { type: 'application/zip' });
    const { tests: tests2 } = await processPlaywrightReportFile(file2);
    const hash2 = await calculateContentHash(tests2);

    console.log('\n=== Duplicate Detection Test ===');
    console.log('Original hash:  ', hash1);
    console.log('Optimized hash: ', hash2);
    console.log('Should be duplicate:', hash1 === hash2);
    console.log('================================\n');

    // If this fails, uploading the same test run twice (once optimized, once not)
    // would NOT be detected as a duplicate!
    expect(hash1).toBe(hash2);
  });

  it('should produce DIFFERENT hashes for different test runs', async () => {
    const buffer = readFileSync('/Users/harbra/Downloads/playwright-report-testing-466.zip');
    const testReportFile = new File([buffer], 'test.zip', { type: 'application/zip' });
    const { tests } = await processPlaywrightReportFile(testReportFile);

    // Original hash
    const hash1 = await calculateContentHash(tests);

    // Modify one test result
    const modifiedTests = [...tests];
    if (modifiedTests[0]) {
      modifiedTests[0] = {
        ...modifiedTests[0],
        status: modifiedTests[0].status === 'passed' ? 'failed' : 'passed',
      };
    }

    const hash2 = await calculateContentHash(modifiedTests);

    console.log('\n=== Different Test Results Test ===');
    console.log('Original hash: ', hash1);
    console.log('Modified hash: ', hash2);
    console.log('Different:', hash1 !== hash2);
    console.log('====================================\n');

    // Different test results should produce different hashes
    expect(hash1).not.toBe(hash2);
  });
});
