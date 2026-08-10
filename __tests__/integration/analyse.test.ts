/**
 * Integration test for the analysis pipeline.
 *
 * This test exercises the full pipeline:
 * loadImage → detectFloors → detectWalls → detectRooms →
 * buildOriginalFloorPlan → applyRoomChanges → renderFloor
 *
 * It does NOT require the OpenAI API or a real HTTP server.
 * It validates that each stage produces correct output shapes.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { buildOriginalFloorPlan } from "../../lib/floorDetection/buildOriginalFloorPlan";
import { applyRoomChanges } from "../../lib/applyRoomChanges";
import { renderFloor } from "../../lib/floorPlanRenderer/renderFloor";
import type { RoomChange, AnalysisPipelineResult } from "../../lib/types/floorPlan";

async function createTestImage(): Promise<string> {
  const filePath = path.join(os.tmpdir(), `integration-test-${Date.now()}.png`);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require("sharp") as typeof import("sharp");
    const width = 600;
    const height = 400;
    const channels = 3;
    const data = Buffer.alloc(width * height * channels, 240); // light grey

    // Draw outer walls
    for (let x = 0; x < width; x++) {
      for (const y of [20, 380]) {
        const i = (y * width + x) * channels;
        data[i] = data[i + 1] = data[i + 2] = 10;
      }
    }
    for (let y = 0; y < height; y++) {
      for (const x of [20, 580]) {
        const i = (y * width + x) * channels;
        data[i] = data[i + 1] = data[i + 2] = 10;
      }
    }

    // Draw internal walls dividing into 3 rooms
    for (let y = 20; y < 380; y++) {
      const i1 = (y * width + 200) * channels;
      data[i1] = data[i1 + 1] = data[i1 + 2] = 10;
      const i2 = (y * width + 400) * channels;
      data[i2] = data[i2 + 1] = data[i2 + 2] = 10;
    }

    await sharp(data, { raw: { width, height, channels } }).png().toFile(filePath);
  } catch {
    // Write minimal PNG fallback
    fs.writeFileSync(
      filePath,
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
        0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
        0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
        0xe2, 0x21, 0xbc, 0x33,
        0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ])
    );
  }

  return filePath;
}

describe("Analysis pipeline integration", () => {
  let testImagePath: string;

  beforeAll(async () => {
    testImagePath = await createTestImage();
  });

  afterAll(() => {
    if (testImagePath && fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  test("buildOriginalFloorPlan produces a valid FloorPlan", async () => {
    const originalFloorPlan = await buildOriginalFloorPlan(testImagePath);

    expect(originalFloorPlan).toBeDefined();
    expect(originalFloorPlan.id).toBeTruthy();
    expect(originalFloorPlan.floors.length).toBeGreaterThanOrEqual(1);
    expect(originalFloorPlan.metadata.imageWidthPx).toBeGreaterThan(0);
    expect(originalFloorPlan.metadata.imageHeightPx).toBeGreaterThan(0);
  });

  test("applyRoomChanges produces a valid proposedFloorPlan from originalFloorPlan", async () => {
    const originalFloorPlan = await buildOriginalFloorPlan(testImagePath);

    // Use only rooms that actually exist in the detected plan
    const firstFloorRooms = originalFloorPlan.floors[0]?.rooms ?? [];
    const changes: RoomChange[] = firstFloorRooms.slice(0, 2).map((room, i) => ({
      type: "ConvertToBedroom" as const,
      roomId: room.id,
      description: `Convert ${room.label} to bedroom`,
      step: i + 1,
    }));

    const proposedFloorPlan = applyRoomChanges(originalFloorPlan, changes);

    expect(proposedFloorPlan).toBeDefined();
    expect(proposedFloorPlan.floors.length).toBe(originalFloorPlan.floors.length);

    // Original is unchanged
    const origJson = JSON.stringify(originalFloorPlan);
    applyRoomChanges(originalFloorPlan, changes); // apply again
    expect(JSON.stringify(originalFloorPlan)).toBe(origJson);
  });

  test("renderFloor produces a data URI for both original and proposed", async () => {
    const originalFloorPlan = await buildOriginalFloorPlan(testImagePath);
    const proposedFloorPlan = applyRoomChanges(originalFloorPlan, []);

    const { imageWidthPx, imageHeightPx } = originalFloorPlan.metadata;

    const origFloor = originalFloorPlan.floors[0];
    const propFloor = proposedFloorPlan.floors[0];

    const [origImg, propImg] = await Promise.all([
      renderFloor(origFloor, imageWidthPx, imageHeightPx),
      renderFloor(propFloor, imageWidthPx, imageHeightPx),
    ]);

    expect(origImg.startsWith("data:image/")).toBe(true);
    expect(propImg.startsWith("data:image/")).toBe(true);
  });

  test("full pipeline produces a result with all required keys", async () => {
    const originalFloorPlan = await buildOriginalFloorPlan(testImagePath);
    const proposedFloorPlan = applyRoomChanges(originalFloorPlan, []);
    const { imageWidthPx, imageHeightPx } = originalFloorPlan.metadata;

    const [originalLayoutImage, proposedLayoutImage] = await Promise.all([
      renderFloor(originalFloorPlan.floors[0], imageWidthPx, imageHeightPx),
      renderFloor(proposedFloorPlan.floors[0], imageWidthPx, imageHeightPx),
    ]);

    // Simulate the final pipeline result shape
    const result: Partial<AnalysisPipelineResult> = {
      originalFloorPlan,
      proposedFloorPlan,
      originalLayoutImage,
      proposedLayoutImage,
      sourceFilename: path.basename(testImagePath),
    };

    expect(result.originalFloorPlan).toBeDefined();
    expect(result.proposedFloorPlan).toBeDefined();
    expect(result.originalLayoutImage).toBeTruthy();
    expect(result.proposedLayoutImage).toBeTruthy();
    expect(result.sourceFilename).toBeTruthy();
  });
});
