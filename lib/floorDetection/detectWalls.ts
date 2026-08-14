import { loadImage } from "./loadImage";
import { DetectedFloor, WallLine } from "@/lib/types/floorPlan";
import { filterWalls } from "./filterWalls";
import { mergeWalls } from "./mergeWalls";

const DARK_PIXEL = 120;
const MIN_WALL_LENGTH = 50;

function isDark(data: Uint8Array, width: number, x: number, y: number): boolean {
  return data[y * width + x] < DARK_PIXEL;
}

export async function detectWalls(
  imagePath: string,
  floors: DetectedFloor[]
): Promise<WallLine[]> {
  const image = await loadImage(imagePath);
  const pixels = image.data;
  const width = image.width;
  const height = image.height;
  const walls: WallLine[] = [];

  console.log(`Scanning ${width} x ${height} image`);

  for (const floor of floors) {
    const left = Math.max(0, floor.left ?? 0);
    const right = Math.min(width, floor.right ?? width);
    const top = Math.max(0, floor.top ?? 0);
    const bottom = Math.min(height, floor.bottom ?? height);

    console.log(`Scanning ${floor.name}: x=${left}-${right}, y=${top}-${bottom}`);

    // Horizontal walls.
    for (let y = top; y < bottom; y++) {
      let runStart = -1;

      for (let x = left; x < right; x++) {
        const dark = isDark(pixels, width, x, y);
        const thick =
          dark &&
          y > 1 &&
          y < height - 2 &&
          isDark(pixels, width, x, y - 1) &&
          isDark(pixels, width, x, y + 1);

        if (thick) {
          if (runStart === -1) runStart = x;
        } else {
          if (runStart !== -1 && x - runStart >= MIN_WALL_LENGTH) {
            walls.push({ x1: runStart, y1: y, x2: x, y2: y });
          }
          runStart = -1;
        }
      }

      if (runStart !== -1 && right - runStart >= MIN_WALL_LENGTH) {
        walls.push({ x1: runStart, y1: y, x2: right, y2: y });
      }
    }

    // Vertical walls.
    for (let x = left; x < right; x++) {
      let runStart = -1;

      for (let y = top; y < bottom; y++) {
        const dark = isDark(pixels, width, x, y);
        const thick =
          dark &&
          x > 1 &&
          x < width - 2 &&
          isDark(pixels, width, x - 1, y) &&
          isDark(pixels, width, x + 1, y);

        if (thick) {
          if (runStart === -1) runStart = y;
        } else {
          if (runStart !== -1 && y - runStart >= MIN_WALL_LENGTH) {
            walls.push({ x1: x, y1: runStart, x2: x, y2: y });
          }
          runStart = -1;
        }
      }

      if (runStart !== -1 && bottom - runStart >= MIN_WALL_LENGTH) {
        walls.push({ x1: x, y1: runStart, x2: x, y2: bottom });
      }
    }
  }

  console.log(`Detected ${walls.length} raw wall segments`);

  const filteredWalls = filterWalls(walls);
  const mergedWalls = mergeWalls(filteredWalls);

  console.log(`Raw walls: ${walls.length}`);
  console.log(`Filtered walls: ${filteredWalls.length}`);
  console.log(`Merged walls: ${mergedWalls.length}`);

  return mergedWalls;
}
