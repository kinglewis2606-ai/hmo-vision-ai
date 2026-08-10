// Room detector.
// Uses connected-component labelling on the "light" (non-wall) pixels within
// a floor band to identify individual rooms.

import type { RawImage } from "./loadImage";
import type { Room, RoomType, Rect } from "../types/floorPlan";
import type { DetectedFloorBand } from "./detectFloors";
import { config } from "../config";
import { v4 as uuid } from "uuid";

/**
 * Detect rooms within a floor band using flood-fill connected components.
 * Each connected region of non-wall (light) pixels above the minimum area
 * threshold is treated as a room.
 */
export function detectRooms(
  image: RawImage,
  band: DetectedFloorBand,
  floorIndex: number
): Room[] {
  const { width, data } = image;
  const threshold = config.detection.darkPixelThreshold;
  const minArea = config.detection.minRoomAreaPx2;
  const yTop = band.yTop;
  const yBottom = band.yBottom;
  const bandHeight = yBottom - yTop + 1;

  // Build a local boolean mask: true = light (potential room interior)
  const mask = new Uint8Array(width * bandHeight);
  for (let y = 0; y < bandHeight; y++) {
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = data[(y + yTop) * width + x] >= threshold ? 1 : 0;
    }
  }

  // Label array: 0 = unlabelled
  const labels = new Int32Array(width * bandHeight);
  let nextLabel = 1;
  const componentPixels: Map<number, number[]> = new Map(); // label -> pixel indices

  // Iterative flood-fill (BFS) to avoid stack overflows on large images
  const queue: number[] = [];

  for (let y = 0; y < bandHeight; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 0 || labels[idx] !== 0) continue;

      // Start BFS from this seed
      const label = nextLabel++;
      const pixels: number[] = [];
      queue.length = 0;
      queue.push(idx);
      labels[idx] = label;

      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        pixels.push(cur);
        const cy = Math.floor(cur / width);
        const cx = cur % width;

        const neighbours = [
          cy > 0 ? cur - width : -1,
          cy < bandHeight - 1 ? cur + width : -1,
          cx > 0 ? cur - 1 : -1,
          cx < width - 1 ? cur + 1 : -1,
        ];

        for (const n of neighbours) {
          if (n >= 0 && mask[n] === 1 && labels[n] === 0) {
            labels[n] = label;
            queue.push(n);
          }
        }
      }

      componentPixels.set(label, pixels);
    }
  }

  const rooms: Room[] = [];

  for (const [, pixels] of componentPixels) {
    if (pixels.length < minArea) continue;

    // Compute bounding box
    let minX = width;
    let minY = bandHeight;
    let maxX = 0;
    let maxY = 0;

    for (const p of pixels) {
      const py = Math.floor(p / width);
      const px = p % width;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }

    const bounds: Rect = {
      x: minX,
      y: minY + yTop, // back to full-image coordinates
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };

    // Estimate area in m²: assume ~1 pixel = 0.05 m by default
    const pixelsPerMetre = 20; // rough default: 20 px/m
    const areaM2 =
      (bounds.width * bounds.height) / (pixelsPerMetre * pixelsPerMetre);

    const type = guessRoomType(bounds, areaM2, floorIndex);
    const label = labelForType(type, rooms.filter((r) => r.type === type).length);

    rooms.push({
      id: uuid(),
      label,
      type,
      bounds,
      areaM2: Math.round(areaM2 * 10) / 10,
      floorIndex,
      adjacentRoomIds: [],
      doors: [],
      windows: [],
    });
  }

  // Detect adjacency: two rooms are adjacent if their bounding boxes are close
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (areBoundsAdjacent(rooms[i].bounds, rooms[j].bounds)) {
        rooms[i].adjacentRoomIds.push(rooms[j].id);
        rooms[j].adjacentRoomIds.push(rooms[i].id);
      }
    }
  }

  return rooms;
}

/** Heuristic room type classification based on dimensions and area */
function guessRoomType(
  bounds: Rect,
  areaM2: number,
  floorIndex: number
): RoomType {
  const aspectRatio =
    bounds.width > bounds.height
      ? bounds.width / bounds.height
      : bounds.height / bounds.width;

  if (areaM2 < 2) return "storage";
  if (areaM2 < 4 && aspectRatio < 2.5) return "bathroom";
  if (areaM2 < 6 && aspectRatio > 3) return "hallway";
  if (areaM2 < 8) {
    if (aspectRatio < 1.8) return floorIndex === 0 ? "kitchen" : "bathroom";
    return "bedroom";
  }
  if (areaM2 < 16) return "bedroom";
  return floorIndex === 0 ? "living_room" : "bedroom";
}

function labelForType(type: RoomType, count: number): string {
  const labels: Record<RoomType, string> = {
    bedroom: "Bedroom",
    bathroom: "Bathroom",
    kitchen: "Kitchen",
    living_room: "Living Room",
    dining_room: "Dining Room",
    hallway: "Hallway",
    staircase: "Staircase",
    storage: "Storage",
    utility: "Utility",
    unknown: "Room",
  };
  const base = labels[type] ?? "Room";
  if (count === 0) return base;
  return `${base} ${count + 1}`;
}

function areBoundsAdjacent(a: Rect, b: Rect, gap = 10): boolean {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  const aBottom = a.y + a.height;
  const bBottom = b.y + b.height;

  // Check for horizontal adjacency
  const xOverlap =
    a.x <= bRight + gap && aRight + gap >= b.x;
  const yOverlap =
    a.y <= bBottom + gap && aBottom + gap >= b.y;

  if (!xOverlap || !yOverlap) return false;

  // At least one edge is within `gap` pixels
  const leftRight = Math.abs(aRight - b.x);
  const rightLeft = Math.abs(bRight - a.x);
  const topBottom = Math.abs(aBottom - b.y);
  const bottomTop = Math.abs(bBottom - a.y);

  return (
    Math.min(leftRight, rightLeft, topBottom, bottomTop) <= gap
  );
}
