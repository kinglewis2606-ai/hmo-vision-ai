// Wall detector.
// Detects horizontal and vertical wall segments from a greyscale floor-plan image.
// Uses a simple run-length scan approach: consecutive dark pixels along rows/columns
// that exceed the minimum wall length are treated as wall segments.

import type { RawImage } from "./loadImage";
import type { Wall } from "../types/floorPlan";
import type { DetectedFloorBand } from "./detectFloors";
import { config } from "../config";
import { v4 as uuid } from "uuid";

/**
 * Detect wall segments within a floor band.
 * Returns walls in image-pixel coordinates.
 */
export function detectWalls(
  image: RawImage,
  band: DetectedFloorBand
): Wall[] {
  const { width, data } = image;
  const threshold = config.detection.darkPixelThreshold;
  const minLen = config.detection.minWallLengthPx;
  const yTop = band.yTop;
  const yBottom = band.yBottom;
  const walls: Wall[] = [];

  // Scan each row for horizontal runs of dark pixels
  for (let y = yTop; y <= yBottom; y++) {
    let runStart = -1;
    for (let x = 0; x <= width; x++) {
      const isDark = x < width && data[y * width + x] < threshold;
      if (isDark && runStart === -1) {
        runStart = x;
      } else if (!isDark && runStart !== -1) {
        const runLen = x - runStart;
        if (runLen >= minLen) {
          walls.push({
            id: uuid(),
            start: { x: runStart, y },
            end: { x: x - 1, y },
            thickness: 1,
          });
        }
        runStart = -1;
      }
    }
  }

  // Scan each column for vertical runs of dark pixels
  for (let x = 0; x < width; x++) {
    let runStart = -1;
    for (let y = yTop; y <= yBottom + 1; y++) {
      const isDark =
        y <= yBottom && data[y * width + x] < threshold;
      if (isDark && runStart === -1) {
        runStart = y;
      } else if (!isDark && runStart !== -1) {
        const runLen = y - runStart;
        if (runLen >= minLen) {
          walls.push({
            id: uuid(),
            start: { x, y: runStart },
            end: { x, y: y - 1 },
            thickness: 1,
          });
        }
        runStart = -1;
      }
    }
  }

  return mergeCloseWalls(walls);
}

/**
 * Merge walls that are parallel and very close together (likely representing
 * thick walls drawn as double lines).  Two walls on the same row/column within
 * 3 pixels of each other are merged into a single thicker wall.
 */
function mergeCloseWalls(walls: Wall[]): Wall[] {
  const maxGap = 3;
  const merged: Wall[] = [];
  const used = new Set<number>();

  for (let i = 0; i < walls.length; i++) {
    if (used.has(i)) continue;
    const a = walls[i];
    const isHoriz = a.start.y === a.end.y;
    let best = a;

    for (let j = i + 1; j < walls.length; j++) {
      if (used.has(j)) continue;
      const b = walls[j];
      const bHoriz = b.start.y === b.end.y;

      if (isHoriz !== bHoriz) continue;

      if (isHoriz) {
        // Both horizontal: same row or adjacent rows, overlapping x range
        const rowDiff = Math.abs(a.start.y - b.start.y);
        if (rowDiff > maxGap) continue;
        const overlapStart = Math.max(a.start.x, b.start.x);
        const overlapEnd = Math.min(a.end.x, b.end.x);
        if (overlapEnd >= overlapStart - maxGap) {
          best = {
            id: best.id,
            start: {
              x: Math.min(best.start.x, b.start.x),
              y: Math.round((best.start.y + b.start.y) / 2),
            },
            end: {
              x: Math.max(best.end.x, b.end.x),
              y: Math.round((best.end.y + b.end.y) / 2),
            },
            thickness: Math.max(best.thickness, rowDiff + 1),
          };
          used.add(j);
        }
      } else {
        // Both vertical: same column or adjacent columns, overlapping y range
        const colDiff = Math.abs(a.start.x - b.start.x);
        if (colDiff > maxGap) continue;
        const overlapStart = Math.max(a.start.y, b.start.y);
        const overlapEnd = Math.min(a.end.y, b.end.y);
        if (overlapEnd >= overlapStart - maxGap) {
          best = {
            id: best.id,
            start: {
              x: Math.round((best.start.x + b.start.x) / 2),
              y: Math.min(best.start.y, b.start.y),
            },
            end: {
              x: Math.round((best.end.x + b.end.x) / 2),
              y: Math.max(best.end.y, b.end.y),
            },
            thickness: Math.max(best.thickness, colDiff + 1),
          };
          used.add(j);
        }
      }
    }

    merged.push(best);
  }

  return merged;
}
