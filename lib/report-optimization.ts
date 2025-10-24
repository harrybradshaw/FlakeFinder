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
  compressImages?: boolean;
  imageQuality?: number;
  verbose?: boolean;
}

export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  filesRemoved: number;
  bytesRemoved: number;
  imagesCompressed: number;
  imageBytesSaved: number;
}

const DEFAULT_OPTIONS: Required<OptimizationOptions> = {
  removeTraces: true,
  removeVideos: true,
  removeHarFiles: true,
  compressImages: true,
  imageQuality: 80,
  verbose: false,
};

/**
 * Optimize a Playwright HTML report ZIP file
 * Removes unnecessary files (traces, videos, HAR files) and compresses PNG screenshots to JPEG
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
    imagesCompressed: 0,
    imageBytesSaved: 0,
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

      // Compress PNG screenshots to JPEG
      const isPngScreenshot =
        /\.png$/i.test(path) &&
        (path.includes("screenshot") || path.includes("data/"));

      if (isPngScreenshot && opts.compressImages) {
        try {
          // Dynamically import sharp (it's an optional dependency)
          const sharp = (await import("sharp")).default;
          const originalSize = content.length;

          const compressed = await sharp(content)
            .jpeg({ quality: opts.imageQuality })
            .toBuffer();

          // Change extension to .jpg
          const newPath = path.replace(/\.png$/i, ".jpg");
          optimizedZip.file(newPath, compressed);

          stats.imagesCompressed++;
          stats.imageBytesSaved += originalSize - compressed.length;

          if (opts.verbose) {
            const saved = (
              ((originalSize - compressed.length) / originalSize) *
              100
            ).toFixed(1);
            console.log(
              `[Optimize] Compressed ${path} -> ${newPath} (saved ${saved}%)`,
            );
          }
        } catch (error) {
          // Fallback: keep original if sharp is not available or compression fails
          if (opts.verbose) {
            console.warn(
              `[Optimize] Failed to compress ${path}, keeping original:`,
              error,
            );
          }
          optimizedZip.file(path, content);
        }
      } else {
        optimizedZip.file(path, content);
      }
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
    if (stats.imagesCompressed > 0) {
      console.log(
        `[Optimize] Images: ${stats.imagesCompressed} compressed (saved ${(stats.imageBytesSaved / 1024 / 1024).toFixed(2)} MB)`,
      );
    }
  }

  return { buffer: optimizedBuffer, stats };
}
