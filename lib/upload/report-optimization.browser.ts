import JSZip from "jszip";

/**
 * Browser-compatible optimization utility for Playwright HTML reports
 * Removes trace files, videos, and other large unnecessary files to reduce bandwidth
 * Uses canvas-based image compression instead of sharp
 */

export interface OptimizationOptions {
  removeTraces?: boolean;
  removeVideos?: boolean;
  removeHarFiles?: boolean;
  compressImages?: boolean;
  imageQuality?: number;
  verbose?: boolean;
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
 * Browser-compatible optimization for Playwright HTML report ZIP files
 * Uses canvas-based image compression instead of sharp
 */
export async function optimizePlaywrightReportBrowser(
  zip: JSZip,
  options: Omit<OptimizationOptions, "compressImages" | "imageQuality"> & {
    compressImages?: boolean;
    imageQuality?: number;
  } = {},
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const optimizedZip = new JSZip();

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

  for (const [path, file] of Object.entries(zip.files)) {
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
    } else {
      const content = await zipFile.async("uint8array");

      // Compress PNG screenshots to JPEG using canvas
      const isPngScreenshot =
        /\.png$/i.test(path) &&
        (path.includes("screenshot") || path.includes("data/"));

      if (isPngScreenshot && opts.compressImages) {
        try {
          const compressed = await compressImageBrowser(
            content,
            opts.imageQuality || 80,
          );
          // Change extension to .jpg
          const newPath = path.replace(/\.png$/i, ".jpg");
          optimizedZip.file(newPath, compressed);

          if (opts.verbose) {
            const saved = (
              ((content.length - compressed.length) / content.length) *
              100
            ).toFixed(1);
            console.log(
              `[Optimize] Compressed ${path} -> ${newPath} (saved ${saved}%)`,
            );
          }
        } catch (error) {
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

  return await optimizedZip.generateAsync({ type: "blob" });
}

/**
 * Browser-based image compression using Canvas API
 */
async function compressImageBrowser(
  imageData: Uint8Array,
  quality: number,
): Promise<Uint8Array> {
  // Convert to blob (cast to any for TS 5.9 compatibility)
  const blob = new Blob([imageData as any], { type: "image/png" });

  // Create image element
  const img = new Image();
  const imageUrl = URL.createObjectURL(blob);

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imageUrl;
  });

  // Create canvas and compress
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(imageUrl);
    return imageData;
  }

  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(imageUrl);

  // Convert to JPEG with specified quality
  const compressedBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/jpeg", quality / 100);
  });

  return new Uint8Array(await compressedBlob.arrayBuffer());
}
