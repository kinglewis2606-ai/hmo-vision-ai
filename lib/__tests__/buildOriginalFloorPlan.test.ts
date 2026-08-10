import { buildOriginalFloorPlan } from "../floorDetection/buildOriginalFloorPlan";
import type { FloorPlan } from "../types/floorPlan";
import fs from "fs";
import path from "path";
import os from "os";

/** Create a minimal valid PNG (1×1 white pixel) as a Buffer */
function makeMinimalPNG(): Buffer {
  // Minimal valid PNG: 1x1 white pixel
  return Buffer.from([
    // PNG signature
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // IHDR chunk: length=13
    0x00, 0x00, 0x00, 0x0d,
    // Type: IHDR
    0x49, 0x48, 0x44, 0x52,
    // Width: 1
    0x00, 0x00, 0x00, 0x01,
    // Height: 1
    0x00, 0x00, 0x00, 0x01,
    // Bit depth: 8, Color type: 2 (RGB)
    0x08, 0x02,
    // Compression, filter, interlace
    0x00, 0x00, 0x00,
    // CRC (pre-computed)
    0x90, 0x77, 0x53, 0xde,
    // IDAT chunk: length=12
    0x00, 0x00, 0x00, 0x0c,
    // Type: IDAT
    0x49, 0x44, 0x41, 0x54,
    // Deflate-compressed row: filter=0, R=255, G=255, B=255
    0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
    // CRC
    0xe2, 0x21, 0xbc, 0x33,
    // IEND chunk
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
}

/** Create a larger synthetic PNG that has some dark pixels (simulated walls) */
async function makeSyntheticFloorPlanJPEG(): Promise<string> {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `test-floorplan-${Date.now()}.png`);

  try {
    // Try using sharp to create a real test image
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require("sharp") as typeof import("sharp");

    // Create a 400×300 white image with some dark pixels to simulate walls
    const width = 400;
    const height = 300;
    const channels = 3;
    const data = Buffer.alloc(width * height * channels, 255); // white

    // Draw horizontal walls
    for (let x = 0; x < width; x++) {
      // Top wall
      const topIdx = (10 * width + x) * channels;
      data[topIdx] = data[topIdx + 1] = data[topIdx + 2] = 0;

      // Bottom wall
      const botIdx = (290 * width + x) * channels;
      data[botIdx] = data[botIdx + 1] = data[botIdx + 2] = 0;

      // Middle divider
      const midIdx = (150 * width + x) * channels;
      data[midIdx] = data[midIdx + 1] = data[midIdx + 2] = 0;
    }

    // Draw vertical walls
    for (let y = 0; y < height; y++) {
      const leftIdx = (y * width + 10) * channels;
      data[leftIdx] = data[leftIdx + 1] = data[leftIdx + 2] = 0;

      const rightIdx = (y * width + 390) * channels;
      data[rightIdx] = data[rightIdx + 1] = data[rightIdx + 2] = 0;

      const midIdx = (y * width + 200) * channels;
      data[midIdx] = data[midIdx + 1] = data[midIdx + 2] = 0;
    }

    await sharp(data, { raw: { width, height, channels } })
      .png()
      .toFile(filePath);
  } catch {
    // Sharp not available — write the minimal PNG as fallback
    fs.writeFileSync(filePath, makeMinimalPNG());
  }

  return filePath;
}

describe("buildOriginalFloorPlan", () => {
  let testImagePath: string;

  beforeAll(async () => {
    testImagePath = await makeSyntheticFloorPlanJPEG();
  });

  afterAll(() => {
    if (testImagePath && fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test("returns a valid FloorPlan with correct shape", async () => {
    const plan = await buildOriginalFloorPlan(testImagePath);

    expect(plan).toBeDefined();
    expect(plan.id).toBeTruthy();
    expect(Array.isArray(plan.floors)).toBe(true);
    expect(plan.floors.length).toBeGreaterThanOrEqual(1);
    expect(plan.metadata).toBeDefined();
    expect(plan.metadata.sourceFilename).toBeTruthy();
    expect(plan.metadata.imageWidthPx).toBeGreaterThan(0);
    expect(plan.metadata.imageHeightPx).toBeGreaterThan(0);
  });

  test("each floor has rooms and walls arrays", async () => {
    const plan = await buildOriginalFloorPlan(testImagePath);

    for (const floor of plan.floors) {
      expect(typeof floor.index).toBe("number");
      expect(typeof floor.label).toBe("string");
      expect(Array.isArray(floor.rooms)).toBe(true);
      expect(Array.isArray(floor.walls)).toBe(true);
    }
  });

  test("rooms have valid bounds and floorIndex", async () => {
    const plan = await buildOriginalFloorPlan(testImagePath);

    for (const floor of plan.floors) {
      for (const room of floor.rooms) {
        expect(room.id).toBeTruthy();
        expect(room.bounds.width).toBeGreaterThan(0);
        expect(room.bounds.height).toBeGreaterThan(0);
        expect(room.floorIndex).toBe(floor.index);
        expect(Array.isArray(room.adjacentRoomIds)).toBe(true);
        expect(Array.isArray(room.doors)).toBe(true);
        expect(Array.isArray(room.windows)).toBe(true);
      }
    }
  });

  test("metadata detectedAt is a valid ISO timestamp", async () => {
    const plan = await buildOriginalFloorPlan(testImagePath);
    expect(() => new Date(plan.metadata.detectedAt)).not.toThrow();
    expect(new Date(plan.metadata.detectedAt).getTime()).toBeGreaterThan(0);
  });

  test("rejects non-existent file", async () => {
    await expect(
      buildOriginalFloorPlan("/tmp/nonexistent-file-xyz.jpg")
    ).rejects.toThrow();
  });
});
