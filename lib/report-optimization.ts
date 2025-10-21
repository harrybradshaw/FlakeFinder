import JSZip from "jszip";

/**
 * Server-side optimization utility for Playwright HTML reports
 * Removes trace files, videos, and other large unnecessary files to reduce bandwidth
 * Note: Image compression requires the 'sharp' package which is optional
 */

export interface OptimizationOptions {
  removeTraces?: boolean;
  removeVideos?: boolean;
  removeHarFiles?: boolean;
  verbose?: boolean;
}

export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  filesRemoved: number;
  bytesRemoved: number;
}

const DEFAULT_OPTIONS: Required<OptimizationOptions> = {
  removeTraces: true,
  removeVideos: true,
  removeHarFiles: true,
  verbose: false,
};

/**
 * Optimize a Playwright HTML report ZIP file
 * This removes unnecessary files and compresses images
 */
export async function optimizePlaywrightReport(
  zipBuffer: Buffer,
  options: OptimizationOptions = {},
): Promise<{ buffer: Buffer; stats: OptimizationResult }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const zip = await JSZip.loadAsync(zipBuffer);
  const optimizedZip = new JSZip();

  const stats: OptimizationResult = {
    originalSize: zipBuffer.length,
    optimizedSize: 0,
    compressionRatio: 0,
    filesRemoved: 0,
    bytesRemoved: 0,
  };

  // Patterns to exclude (large files we don't need)
  const excludePatterns: RegExp[] = [];

  if (opts.removeTraces) {
    excludePatterns.push(
      /data\/.*\.zip$/, // All ZIPs in data folder (traces, etc.)
      /data\/trace\//, // Entire trace directory
      /\.trace$/, // Raw trace files
    );
  }

  if (opts.removeVideos) {
    excludePatterns.push(/video\.webm$/);
  }

  if (opts.removeHarFiles) {
    excludePatterns.push(
      /\.har$/, // HAR files (network logs)
      /\.network$/, // Network logs
    );
  }

  const files = Object.entries(zip.files);

  for (const [path, file] of files) {
    const zipFile = file as JSZip.JSZipObject;

    if (zipFile.dir) {
      optimizedZip.folder(path);
      continue;
    }

    const shouldExclude = excludePatterns.some((pattern) => pattern.test(path));

    if (shouldExclude) {
      if (opts.verbose) {
        console.log(`[Optimize] Removing: ${path}`);
      }
      const fileSize = (await zipFile.async("nodebuffer")).length;
      stats.filesRemoved++;
      stats.bytesRemoved += fileSize;
    } else {
      const content = await zipFile.async("nodebuffer");
      optimizedZip.file(path, content);
    }
  }

  const optimizedBuffer = await optimizedZip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  stats.optimizedSize = optimizedBuffer.length;
  stats.compressionRatio =
    ((stats.originalSize - stats.optimizedSize) / stats.originalSize) * 100;

  if (opts.verbose) {
    console.log(
      `[Optimize] Original: ${(stats.originalSize / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(
      `[Optimize] Optimized: ${(stats.optimizedSize / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(
      `[Optimize] Saved: ${stats.compressionRatio.toFixed(1)}% (${stats.filesRemoved} files removed, ${(stats.bytesRemoved / 1024 / 1024).toFixed(2)} MB)`,
    );
  }

  return { buffer: optimizedBuffer, stats };
}
