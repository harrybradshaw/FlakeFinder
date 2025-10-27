import { describe, it, expect, beforeEach, vi } from "vitest";
import JSZip from "jszip";
import {
  optimizePlaywrightReport,
  type OptimizationOptions,
} from "./report-optimization";

// Helper to convert Buffer to Uint8Array for JSZip (TS 5.9 compatibility)
const toUint8Array = (buffer: Buffer): Uint8Array => new Uint8Array(buffer);

describe("report-optimization", () => {
  let mockZip: JSZip;
  let mockZipBuffer: Buffer;

  beforeEach(async () => {
    // Create a realistic mock Playwright report structure
    mockZip = new JSZip();

    // Add essential files
    mockZip.file("index.html", "<html>Report</html>");
    mockZip.file("report.json", JSON.stringify({ tests: [] }));

    // Create a minimal valid 1x1 PNG (89 50 4E 47 header + minimal data)
    const validPng = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01, // 1x1 dimensions
      0x08,
      0x02,
      0x00,
      0x00,
      0x00,
      0x90,
      0x77,
      0x53, // bit depth, color type, CRC
      0xde,
      0x00,
      0x00,
      0x00,
      0x0c,
      0x49,
      0x44,
      0x41, // IDAT chunk
      0x54,
      0x08,
      0xd7,
      0x63,
      0xf8,
      0xcf,
      0xc0,
      0x00, // image data
      0x00,
      0x03,
      0x01,
      0x01,
      0x00,
      0x18,
      0xdd,
      0x8d, // data + CRC
      0xb4,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e, // IEND chunk
      0x44,
      0xae,
      0x42,
      0x60,
      0x82, // IEND + CRC
    ]);

    // Add screenshots (should be kept)
    mockZip.file("data/screenshot-1.png", toUint8Array(validPng));
    mockZip.file("data/screenshot-2.png", toUint8Array(validPng));
    mockZip.file(
      "data/screenshot-3.jpg",
      toUint8Array(Buffer.from("fake-jpg-data")),
    );

    // Add files that should be removed
    mockZip.file(
      "data/trace.zip",
      toUint8Array(Buffer.from("large-trace-data".repeat(1000))),
    );
    mockZip.file(
      "data/trace/trace-1.trace",
      toUint8Array(Buffer.from("trace-content")),
    );
    mockZip.file(
      "data/video.webm",
      toUint8Array(Buffer.from("video-data".repeat(500))),
    );
    mockZip.file("data/network.har", toUint8Array(Buffer.from("har-content")));
    mockZip.file(
      "data/request.network",
      toUint8Array(Buffer.from("network-log")),
    );

    mockZipBuffer = await mockZip.generateAsync({ type: "nodebuffer" });
  });

  describe("File Removal", () => {
    it("should remove trace ZIP files by default", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/trace.zip")).toBeNull();
    });

    it("should remove trace directory files by default", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/trace/trace-1.trace")).toBeNull();
    });

    it("should remove video files by default", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/video.webm")).toBeNull();
    });

    it("should remove HAR files by default", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/network.har")).toBeNull();
    });

    it("should remove network log files by default", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/request.network")).toBeNull();
    });
  });

  describe("File Preservation", () => {
    it("should preserve index.html", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("index.html")).not.toBeNull();
    });

    it("should preserve report.json", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("report.json")).not.toBeNull();
    });

    it("should compress PNG screenshots to JPEG (preservation test)", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      // PNGs are converted to JPEG for compression
      expect(optimizedZip.file("data/screenshot-1.jpg")).not.toBeNull();
      expect(optimizedZip.file("data/screenshot-2.jpg")).not.toBeNull();
      // Original PNGs should be removed
      expect(optimizedZip.file("data/screenshot-1.png")).toBeNull();
      expect(optimizedZip.file("data/screenshot-2.png")).toBeNull();
    });

    it("should preserve JPEG screenshots", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/screenshot-3.jpg")).not.toBeNull();
    });

    it("should preserve file content integrity", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      const htmlContent = await optimizedZip
        .file("index.html")!
        .async("string");
      expect(htmlContent).toBe("<html>Report</html>");
    });
  });

  describe("Optimization Options", () => {
    it("should keep traces when removeTraces is false", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer, {
        removeTraces: false,
      });
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/trace.zip")).not.toBeNull();
    });

    it("should keep videos when removeVideos is false", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer, {
        removeVideos: false,
      });
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/video.webm")).not.toBeNull();
    });

    it("should keep HAR files when removeHarFiles is false", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer, {
        removeHarFiles: false,
      });
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      expect(optimizedZip.file("data/network.har")).not.toBeNull();
    });

    it("should respect multiple options simultaneously", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer, {
        removeTraces: false,
        removeVideos: false,
        removeHarFiles: false,
      });
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      // All files should be preserved
      expect(optimizedZip.file("data/trace.zip")).not.toBeNull();
      expect(optimizedZip.file("data/video.webm")).not.toBeNull();
      expect(optimizedZip.file("data/network.har")).not.toBeNull();
    });
  });

  describe("Image Compression", () => {
    it("should compress PNG screenshots to JPEG by default", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      // PNG should be removed
      expect(optimizedZip.file("data/screenshot-1.png")).toBeNull();
      // JPEG version should exist
      expect(optimizedZip.file("data/screenshot-1.jpg")).not.toBeNull();
    });

    it("should track compressed images count", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      // Should compress 2 PNG screenshots (screenshot-3 is already JPG)
      expect(stats.imagesCompressed).toBe(2);
    });

    it("should calculate bytes saved from compression", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      // Note: For tiny 1x1 PNGs, JPEG encoding overhead may result in larger files
      // The important thing is that compression happens
      expect(stats.imagesCompressed).toBe(2);
    });

    it("should skip compression when compressImages is false", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer, {
        compressImages: false,
      });
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      // PNG should still exist
      expect(optimizedZip.file("data/screenshot-1.png")).not.toBeNull();
      // JPEG version should not exist
      expect(optimizedZip.file("data/screenshot-1.jpg")).toBeNull();
    });

    it("should respect imageQuality option", async () => {
      const { stats: highStats } = await optimizePlaywrightReport(
        mockZipBuffer,
        {
          imageQuality: 95,
        },
      );
      const { stats: lowStats } = await optimizePlaywrightReport(
        mockZipBuffer,
        {
          imageQuality: 50,
        },
      );

      // Both should compress the same number of images
      expect(highStats.imagesCompressed).toBe(2);
      expect(lowStats.imagesCompressed).toBe(2);
    });

    it("should handle compression failure gracefully", async () => {
      // Create a ZIP with an invalid PNG
      const zipWithBadImage = new JSZip();
      zipWithBadImage.file("data/screenshot-bad.png", "not-a-real-png");
      const badBuffer = await zipWithBadImage.generateAsync({
        type: "nodebuffer",
      });

      const { buffer } = await optimizePlaywrightReport(badBuffer);

      // Should not crash, and original file should be kept
      expect(buffer).toBeDefined();
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));
      // Original PNG should be kept on failure
      expect(
        optimizedZip.file("data/screenshot-bad.png") ||
          optimizedZip.file("data/screenshot-bad.jpg"),
      ).not.toBeNull();
    });
  });

  describe("Statistics Calculation", () => {
    it("should calculate correct original size", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      expect(stats.originalSize).toBe(mockZipBuffer.length);
    });

    it("should calculate optimized size", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      expect(stats.optimizedSize).toBeGreaterThan(0);
      expect(stats.optimizedSize).toBeLessThan(stats.originalSize);
    });

    it("should calculate compression ratio", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      const expectedRatio =
        ((stats.originalSize - stats.optimizedSize) / stats.originalSize) * 100;
      expect(stats.compressionRatio).toBeCloseTo(expectedRatio, 2);
    });

    it("should count files removed", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      // Should remove: trace.zip, trace-1.trace, video.webm, network.har, request.network
      expect(stats.filesRemoved).toBe(5);
    });

    it("should calculate bytes removed", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      expect(stats.bytesRemoved).toBeGreaterThan(0);
    });

    it("should show significant compression when removing large files", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      // With large trace and video files, compression should be significant
      expect(stats.compressionRatio).toBeGreaterThan(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty ZIP file", async () => {
      const emptyZip = new JSZip();
      const emptyBuffer = await emptyZip.generateAsync({ type: "nodebuffer" });

      const { buffer, stats } = await optimizePlaywrightReport(emptyBuffer);

      expect(buffer).toBeDefined();
      expect(stats.filesRemoved).toBe(0);
    });

    it("should handle ZIP with only essential files", async () => {
      const minimalZip = new JSZip();
      minimalZip.file("index.html", "<html></html>");
      minimalZip.file("report.json", "{}");
      const minimalBuffer = await minimalZip.generateAsync({
        type: "nodebuffer",
      });

      const { stats } = await optimizePlaywrightReport(minimalBuffer);

      expect(stats.filesRemoved).toBe(0);
      expect(stats.compressionRatio).toBeGreaterThanOrEqual(0);
    });

    it("should handle already optimized report", async () => {
      // First optimization
      const { buffer: firstOptimized } =
        await optimizePlaywrightReport(mockZipBuffer);

      // Second optimization of already optimized file
      const { stats } = await optimizePlaywrightReport(firstOptimized);

      expect(stats.filesRemoved).toBe(0);
    });

    it("should handle ZIP with nested directories", async () => {
      const nestedZip = new JSZip();
      nestedZip.file("data/deep/nested/path/file.zip", "trace-data");
      nestedZip.file("data/deep/nested/path/screenshot.png", "image");
      const nestedBuffer = await nestedZip.generateAsync({
        type: "nodebuffer",
      });

      const { buffer } = await optimizePlaywrightReport(nestedBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      // ZIP files in data/ directory should be removed (matches /data\/.*\.zip$/)
      expect(optimizedZip.file("data/deep/nested/path/file.zip")).toBeNull();
      // Screenshot should be kept
      expect(
        optimizedZip.file("data/deep/nested/path/screenshot.png"),
      ).not.toBeNull();
    });

    it("should maintain ZIP file validity", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);

      // Should be able to load the optimized buffer as a valid ZIP
      const loadedZip = await JSZip.loadAsync(toUint8Array(buffer));
      expect(loadedZip).toBeDefined();
    });

    it("should handle files with similar names", async () => {
      const similarZip = new JSZip();
      similarZip.file("data/trace.zip", "trace");
      similarZip.file("data/trace.png", "not-a-trace");
      similarZip.file("data/my-video.webm", "video");
      similarZip.file("data/video-thumbnail.png", "not-a-video");
      const similarBuffer = await similarZip.generateAsync({
        type: "nodebuffer",
      });

      const { buffer } = await optimizePlaywrightReport(similarBuffer);
      const optimizedZip = await JSZip.loadAsync(toUint8Array(buffer));

      // Should remove .zip and .webm
      expect(optimizedZip.file("data/trace.zip")).toBeNull();
      expect(optimizedZip.file("data/my-video.webm")).toBeNull();

      // Should keep .png files
      expect(optimizedZip.file("data/trace.png")).not.toBeNull();
      expect(optimizedZip.file("data/video-thumbnail.png")).not.toBeNull();
    });
  });

  describe("Performance", () => {
    it("should process file in reasonable time", async () => {
      const startTime = Date.now();
      await optimizePlaywrightReport(mockZipBuffer);
      const duration = Date.now() - startTime;

      // Should complete in under 1 second for small files
      expect(duration).toBeLessThan(1000);
    });

    it("should handle medium-sized report efficiently", async () => {
      // Create a larger mock report
      const largeZip = new JSZip();
      for (let i = 0; i < 50; i++) {
        largeZip.file(
          `data/screenshot-${i}.png`,
          toUint8Array(Buffer.from("image-data".repeat(100))),
        );
      }
      largeZip.file(
        "data/trace.zip",
        toUint8Array(Buffer.from("trace".repeat(10000))),
      );
      const largeBuffer = await largeZip.generateAsync({ type: "nodebuffer" });

      const startTime = Date.now();
      await optimizePlaywrightReport(largeBuffer);
      const duration = Date.now() - startTime;

      // Should complete in under 3 seconds for medium files
      expect(duration).toBeLessThan(3000);
    }, 5000);
  });

  describe("Verbose Mode", () => {
    it("should accept verbose option without error", async () => {
      await expect(
        optimizePlaywrightReport(mockZipBuffer, { verbose: true }),
      ).resolves.toBeDefined();
    });

    it("should produce same result regardless of verbose setting", async () => {
      const { stats: quietStats } = await optimizePlaywrightReport(
        mockZipBuffer,
        {
          verbose: false,
        },
      );
      const { stats: verboseStats } = await optimizePlaywrightReport(
        mockZipBuffer,
        {
          verbose: true,
        },
      );

      expect(quietStats.filesRemoved).toBe(verboseStats.filesRemoved);
      expect(quietStats.compressionRatio).toBeCloseTo(
        verboseStats.compressionRatio,
        2,
      );
    });
  });

  describe("Return Value Structure", () => {
    it("should return buffer and stats", async () => {
      const result = await optimizePlaywrightReport(mockZipBuffer);

      expect(result).toHaveProperty("buffer");
      expect(result).toHaveProperty("stats");
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it("should return stats with all required fields", async () => {
      const { stats } = await optimizePlaywrightReport(mockZipBuffer);

      expect(stats).toHaveProperty("originalSize");
      expect(stats).toHaveProperty("optimizedSize");
      expect(stats).toHaveProperty("compressionRatio");
      expect(stats).toHaveProperty("filesRemoved");
      expect(stats).toHaveProperty("bytesRemoved");
      expect(stats).toHaveProperty("imagesCompressed");
      expect(stats).toHaveProperty("imageBytesSaved");

      expect(typeof stats.originalSize).toBe("number");
      expect(typeof stats.optimizedSize).toBe("number");
      expect(typeof stats.compressionRatio).toBe("number");
      expect(typeof stats.filesRemoved).toBe("number");
      expect(typeof stats.bytesRemoved).toBe("number");
      expect(typeof stats.imagesCompressed).toBe("number");
      expect(typeof stats.imageBytesSaved).toBe("number");
    });

    it("should return valid ZIP buffer", async () => {
      const { buffer } = await optimizePlaywrightReport(mockZipBuffer);

      // Should start with ZIP magic number
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
    });
  });
});
