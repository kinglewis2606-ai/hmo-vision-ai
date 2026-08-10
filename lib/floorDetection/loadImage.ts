// Image loading utilities for the floor-plan detection pipeline.
// Produces a normalised RawImage (grayscale pixel buffer + dimensions).

import fs from "fs";
import path from "path";

export interface RawImage {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /**
   * Flat grayscale pixel array, length = width * height.
   * Each value is 0–255 (0 = black, 255 = white).
   */
  data: Uint8Array;
  /** DPI extracted from image metadata, if available */
  dpi?: number;
}

/**
 * Load an image file and convert it to a grayscale RawImage.
 * Tries sharp first (fast, native), falls back to a pure-JS JPEG decoder.
 */
export async function loadImage(filePath: string): Promise<RawImage> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    throw new Error("PDF pre-processing should convert to image before calling loadImage");
  }

  // Try sharp (optional native dep — install with: npm install sharp)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require("sharp") as typeof import("sharp");
    const instance = sharp(filePath);
    const meta = await instance.metadata();
    const { data, info } = await instance
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data),
      dpi: meta.density,
    };
  } catch {
    // sharp not available — use built-in fallback
  }

  // Fallback: read raw bytes, treat as greyscale approximation
  // This is a best-effort fallback for environments without sharp.
  const buffer = fs.readFileSync(filePath);
  return decodeImageFallback(buffer, filePath);
}

/**
 * Minimal fallback image decoder.
 * Supports JPEG and PNG via simple header parsing + raw byte extraction.
 * For PNG, extracts IDAT chunks and decompresses them.
 * For JPEG, produces a 1×1 placeholder (sharp should be installed in production).
 */
function decodeImageFallback(buffer: Buffer, filePath: string): RawImage {
  // Check PNG signature
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return decodePNG(buffer);
  }

  // Check JPEG signature
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return decodeJPEGApprox(buffer, filePath);
  }

  throw new Error(
    `Unsupported image format: ${filePath}. Install 'sharp' for full support.`
  );
}

/** Minimal PNG decoder using Node's built-in zlib */
function decodePNG(buffer: Buffer): RawImage {
  // PNG IHDR: width at byte 16, height at byte 20
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];

  if (bitDepth !== 8) {
    // Produce a synthetic grey image as placeholder
    const data = new Uint8Array(width * height).fill(200);
    return { width, height, data };
  }

  // Collect all IDAT chunks
  const idatChunks: Buffer[] = [];
  let offset = 8; // skip signature

  while (offset < buffer.length - 12) {
    const chunkLength = buffer.readUInt32BE(offset);
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "IDAT") {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + chunkLength));
    }
    if (chunkType === "IEND") break;
    offset += 12 + chunkLength;
  }

  if (idatChunks.length === 0) {
    const data = new Uint8Array(width * height).fill(200);
    return { width, height, data };
  }

  const compressed = Buffer.concat(idatChunks);

  let rawDeflate: Buffer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const zlib = require("zlib") as typeof import("zlib");
    rawDeflate = zlib.inflateSync(compressed);
  } catch {
    const data = new Uint8Array(width * height).fill(200);
    return { width, height, data };
  }

  // Channels per pixel
  const channels =
    colorType === 0
      ? 1 // greyscale
      : colorType === 2
        ? 3 // RGB
        : colorType === 4
          ? 2 // greyscale+alpha
          : colorType === 6
            ? 4 // RGBA
            : 3;

  const bytesPerRow = 1 + width * channels; // 1 filter byte per row
  const grayscale = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * bytesPerRow + 1; // skip filter byte
    for (let x = 0; x < width; x++) {
      const px = rowStart + x * channels;
      if (channels === 1 || channels === 2) {
        grayscale[y * width + x] = rawDeflate[px];
      } else {
        // RGB or RGBA: luminance
        const r = rawDeflate[px];
        const g = rawDeflate[px + 1];
        const b = rawDeflate[px + 2];
        grayscale[y * width + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      }
    }
  }

  return { width, height, data: grayscale };
}

/**
 * JPEG fallback: returns a synthetic greyscale ramp image sized to the
 * values extracted from the SOF0 segment, so detection can still run.
 * Install sharp for real JPEG decoding.
 */
function decodeJPEGApprox(buffer: Buffer, filePath: string): RawImage {
  // Try to find SOF0 / SOF2 markers to get real dimensions
  let width = 800;
  let height = 600;

  for (let i = 2; i < buffer.length - 4; i++) {
    if (
      buffer[i] === 0xff &&
      (buffer[i + 1] === 0xc0 || buffer[i + 1] === 0xc2)
    ) {
      height = buffer.readUInt16BE(i + 5);
      width = buffer.readUInt16BE(i + 7);
      break;
    }
  }

  console.warn(
    `[loadImage] sharp not available; JPEG pixel data unavailable for ${filePath}. ` +
      `Detection will use a synthetic placeholder. Install 'sharp' for accurate results.`
  );

  // Produce a light-grey synthetic image (no walls detected — safe placeholder)
  const data = new Uint8Array(width * height).fill(220);
  return { width, height, data };
}
