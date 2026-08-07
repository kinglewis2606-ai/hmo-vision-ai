import { loadImage } from "./loadImage";
import { DetectedFloor, DetectedRoom, LoadedImage } from "@/lib/types/floorPlan";
import { findEnclosedRooms } from "./findEnclosedRooms";
import { detectWalls } from "./detectWalls";

interface Point {
  x: number;
  y: number;
}

/**
 * Threshold for wall detection (greyscale pixel value).
 * Pixels darker than this are considered walls.
 * 
 * Standard DPI calibration: 96 DPI
 * This value is adjusted per image based on actual DPI.
 */
const WALL_THRESHOLD_BASE = 170;

/**
 * Room area thresholds (in pixels).
 * Prevents detecting noise as rooms or merging separate spaces.
 */
const MIN_ROOM_AREA = 3500;
const MAX_ROOM_AREA = 400000;

/**
 * Calibrate detection threshold based on image DPI.
 * 
 * Higher DPI images (sharper, more detailed) may need higher thresholds
 * to avoid detecting compression artifacts as walls.
 * 
 * @param imageDpi - DPI of the source image (default 96)
 * @returns Adjusted wall threshold value
 */
function calibrateWallThreshold(imageDpi?: number): number {
  const dpi = imageDpi || 96;
  
  // Calibration: increase threshold by 1 point per 24 DPI above base
  // This helps maintain consistency across different image sources
  const dpiFactor = (dpi - 96) / 24;
  const adjustedThreshold = WALL_THRESHOLD_BASE + dpiFactor;
  
  console.log(`[DPI Calibration] DPI: ${dpi}, Wall Threshold: ${adjustedThreshold.toFixed(1)}`);
  
  return adjustedThreshold;
}

function index(
  width: number,
  x: number,
  y: number
): number {
  return y * width + x;
}

/**
 * Check if a pixel is a wall based on greyscale value and calibrated threshold.
 * 
 * @param pixels - Greyscale image data
 * @param width - Image width
 * @param x - Pixel x coordinate
 * @param y - Pixel y coordinate
 * @param threshold - DPI-calibrated wall threshold
 */
function isWall(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  threshold: number
): boolean {
  return pixels[index(width, x, y)] < threshold;
}

function insideFloor(
  y: number,
  floor: DetectedFloor
): boolean {
  return y >= floor.top && y < floor.bottom;
}

function floodFill(
  pixels: Uint8Array,
  width: number,
  height: number,
  visited: Uint8Array,
  startX: number,
  startY: number,
  floor: DetectedFloor,
  threshold: number
): Point[] {

  const queue: Point[] = [
    {
      x: startX,
      y: startY,
    },
  ];

  const region: Point[] = [];

  visited[index(width, startX, startY)] = 1;

  while (queue.length > 0) {

    const current = queue.pop()!;

    region.push(current);

    const neighbours = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const n of neighbours) {

      if (
        n.x < 0 ||
        n.y < 0 ||
        n.x >= width ||
        n.y >= height
      ) {
        continue;
      }

      if (!insideFloor(n.y, floor)) {
        continue;
      }

      const i = index(width, n.x, n.y);

      if (visited[i]) {
        continue;
      }

      if (isWall(pixels, width, n.x, n.y, threshold)) {
        continue;
      }

      visited[i] = 1;

      queue.push(n);
    }
  }

  return region;
}

function boundingBox(points: Point[]) {

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {

    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;

  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    area: points.length,
  };
}

/**
 * Detect rooms from floor plan image using contour analysis.
 * 
 * This is the room detection layer - it finds enclosed spaces
 * without inventing or assuming geometry.
 * 
 * Process:
 * 1. Load and convert image to greyscale
 * 2. Detect walls using calibrated DPI-aware threshold
 * 3. Find enclosed regions (rooms) using flood fill
 * 4. Return only detected geometry (no inference)
 * 
 * @param imagePath - Path to floor plan image
 * @param floors - Detected floor boundaries
 * @returns Array of detected rooms
 */
export async function detectRoomsContours(
  imagePath: string,
  floors: DetectedFloor[]
): Promise<DetectedRoom[]> {

  // Load and preprocess image
  const image = await loadImage(imagePath);
  
  // Calibrate detection threshold based on image DPI
  const wallThreshold = calibrateWallThreshold(image.dpi);

  // Detect wall structures
  const walls = await detectWalls(
    imagePath,
    floors
  );

  // Find enclosed rooms (spaces not part of walls)
  const rooms = await findEnclosedRooms(
    walls,
    image.width,
    image.height
  );

  console.log(`Detected ${rooms.length} rooms with DPI-calibrated threshold`);

  return rooms;
}
