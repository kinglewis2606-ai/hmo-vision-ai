// buildOriginalFloorPlan.ts
// Orchestrates the detection pipeline to produce a canonical FloorPlan
// from an uploaded image file.

import path from "path";
import { v4 as uuid } from "uuid";
import { loadImage } from "./loadImage";
import { detectFloors } from "./detectFloors";
import { detectWalls } from "./detectWalls";
import { detectRooms } from "./detectRooms";
import type { FloorPlan, Floor } from "../types/floorPlan";
import { config } from "../config";
import { logger } from "../logger";

/**
 * Build the original (detected) floor plan from an uploaded image.
 * @param filePath Absolute path to the uploaded image file.
 * @returns A canonical FloorPlan containing all detected floors, walls, and rooms.
 */
export async function buildOriginalFloorPlan(filePath: string): Promise<FloorPlan> {
  const start = Date.now();
  logger.info("detection started", { filePath: path.basename(filePath) });

  const detectionTimeoutMs = config.detection.timeoutMs;

  // Wrap the entire detection in a timeout promise
  const detection = async (): Promise<FloorPlan> => {
    const image = await loadImage(filePath);
    logger.debug("image loaded", {
      width: image.width,
      height: image.height,
      dpi: image.dpi,
    });

    const floorBands = detectFloors(image);
    logger.debug("floors detected", { count: floorBands.length });

    const floors: Floor[] = floorBands.map((band) => {
      const walls = detectWalls(image, band);
      const rooms = detectRooms(image, band, band.index);

      logger.debug("floor processed", {
        floor: band.label,
        walls: walls.length,
        rooms: rooms.length,
      });

      return {
        index: band.index,
        label: band.label,
        rooms,
        walls,
        yRange: { top: band.yTop, bottom: band.yBottom },
      };
    });

    const floorPlan: FloorPlan = {
      id: uuid(),
      floors,
      metadata: {
        sourceFilename: path.basename(filePath),
        imageDpi: image.dpi,
        imageWidthPx: image.width,
        imageHeightPx: image.height,
        scale: image.dpi ? 1 / (image.dpi * 39.3701) : undefined, // metres per pixel
        detectedAt: new Date().toISOString(),
      },
    };

    const elapsed = Date.now() - start;
    logger.info("detection completed", {
      floors: floors.length,
      totalRooms: floors.reduce((s, f) => s + f.rooms.length, 0),
      totalWalls: floors.reduce((s, f) => s + f.walls.length, 0),
      durationMs: elapsed,
    });

    return floorPlan;
  };

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Detection timed out after ${detectionTimeoutMs}ms`)),
      detectionTimeoutMs
    )
  );

  return Promise.race([detection(), timeout]);
}
