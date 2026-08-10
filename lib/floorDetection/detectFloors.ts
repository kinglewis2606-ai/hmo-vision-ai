// Floor-level detector.
// Attempts to identify separate floors in a floor-plan image by looking for
// large horizontal whitespace separators between groups of rooms.

import type { RawImage } from "./loadImage";
import { config } from "../config";

export interface DetectedFloorBand {
  /** 0-based floor index (ground = 0) */
  index: number;
  label: string;
  /** Top pixel row of this floor band (inclusive) */
  yTop: number;
  /** Bottom pixel row of this floor band (inclusive) */
  yBottom: number;
}

/**
 * Detect floor bands from a grayscale image.
 *
 * Strategy:
 * 1. Build a horizontal projection (count of dark pixels per row).
 * 2. Find rows that are almost entirely white — these are likely gap separators
 *    between floors drawn stacked vertically on the same plan.
 * 3. If no gaps are found, the image is treated as single-floor.
 */
export function detectFloors(image: RawImage): DetectedFloorBand[] {
  const { width, height, data } = image;
  const threshold = config.detection.darkPixelThreshold;

  // Per-row dark pixel count
  const darkPerRow = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    let dark = 0;
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < threshold) dark++;
    }
    darkPerRow[y] = dark;
  }

  // Find contiguous "gap" rows where <2% of pixels are dark
  const gapThreshold = Math.max(2, Math.floor(width * 0.02));
  const minGapHeight = 20; // minimum rows in a gap

  const gapRows: boolean[] = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    gapRows[y] = darkPerRow[y] < gapThreshold;
  }

  // Identify contiguous gap bands
  const gaps: Array<{ start: number; end: number }> = [];
  let inGap = false;
  let gapStart = 0;
  for (let y = 0; y <= height; y++) {
    const isGap = y < height && gapRows[y];
    if (isGap && !inGap) {
      inGap = true;
      gapStart = y;
    } else if (!isGap && inGap) {
      inGap = false;
      if (y - gapStart >= minGapHeight) {
        gaps.push({ start: gapStart, end: y - 1 });
      }
    }
  }

  if (gaps.length === 0) {
    // Single floor
    return [
      {
        index: 0,
        label: "Ground Floor",
        yTop: 0,
        yBottom: height - 1,
      },
    ];
  }

  // Build floor bands from the gaps
  const bands: DetectedFloorBand[] = [];
  const floorLabels = [
    "Ground Floor",
    "First Floor",
    "Second Floor",
    "Third Floor",
    "Fourth Floor",
  ];

  let bandStart = 0;
  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i];
    if (gap.start > bandStart + 30) {
      // Only add a band if it has meaningful content
      bands.push({
        index: bands.length,
        label: floorLabels[bands.length] ?? `Floor ${bands.length}`,
        yTop: bandStart,
        yBottom: gap.start - 1,
      });
    }
    bandStart = gap.end + 1;
  }

  // Add the last band
  if (bandStart < height - 30) {
    bands.push({
      index: bands.length,
      label: floorLabels[bands.length] ?? `Floor ${bands.length}`,
      yTop: bandStart,
      yBottom: height - 1,
    });
  }

  if (bands.length === 0) {
    return [
      {
        index: 0,
        label: "Ground Floor",
        yTop: 0,
        yBottom: height - 1,
      },
    ];
  }

  return bands;
}
