import { loadImage } from "./loadImage";
import { DetectedFloor, WallLine } from "@/lib/types/floorPlan";
import { filterWalls } from "./filterWalls";
import { mergeWalls } from "./mergeWalls";

const DARK_PIXEL = 90;
const MIN_WALL_LENGTH = 80;

function isDark(
  data: Uint8Array,
  width: number,
  x: number,
  y: number
): boolean {
  const index = y * width + x;
  return data[index] < DARK_PIXEL;
}

export async function detectWalls(
  imagePath: string,
  floors: DetectedFloor[]
): Promise<WallLine[]> {

  const image = await loadImage(imagePath);

  const pixels = image.data;
  const width = image.width;
  const height = image.height;

  console.log(
    `Scanning ${width} x ${height} image`
  );

  const walls: WallLine[] = [];

  //
  // Horizontal walls
  //
  for (const floor of floors) {

    console.log(`Scanning ${floor.name}`);

    for (let y = floor.top; y < floor.bottom; y++) {

      let runStart = -1;

      for (let x = 0; x < width; x++) {

        const dark = isDark(
          pixels,
          width,
          x,
          y
        );

        const thick =
          dark &&
          y > 1 &&
          y < height - 2 &&
          isDark(pixels, width, x, y - 1) &&
          isDark(pixels, width, x, y + 1);

        if (thick) {

          if (runStart === -1) {
            runStart = x;
          }

        } else {

          if (
            runStart !== -1 &&
            x - runStart >= MIN_WALL_LENGTH
          ) {

            walls.push({
              x1: runStart,
              y1: y,
              x2: x,
              y2: y,
            });

          }

          runStart = -1;

        }

      }

      if (
        runStart !== -1 &&
        width - runStart >= MIN_WALL_LENGTH
      ) {

        walls.push({
          x1: runStart,
          y1: y,
          x2: width,
          y2: y,
        });

      }

    }

  }

  //
  // Vertical walls
  //
  for (const floor of floors) {    for (let x = 0; x < width; x++) {

      let runStart = -1;

      for (let y = floor.top; y < floor.bottom; y++) {

        const dark = isDark(
          pixels,
          width,
          x,
          y
        );

        const thick =
          dark &&
          x > 1 &&
          x < width - 2 &&
          isDark(pixels, width, x - 1, y) &&
          isDark(pixels, width, x + 1, y);

        if (thick) {

          if (runStart === -1) {
            runStart = y;
          }

        } else {

          if (
            runStart !== -1 &&
            y - runStart >= MIN_WALL_LENGTH
          ) {

            walls.push({
              x1: x,
              y1: runStart,
              x2: x,
              y2: y,
            });

          }

          runStart = -1;

        }

      }

      if (
        runStart !== -1 &&
        floor.bottom - runStart >= MIN_WALL_LENGTH
      ) {

        walls.push({
          x1: x,
          y1: runStart,
          x2: x,
          y2: floor.bottom,
        });

      }

    }

  }

  console.log(
    `Detected ${walls.length} raw wall segments`
  );

  const filteredWalls = filterWalls(walls);
  const mergedWalls = mergeWalls(filteredWalls);

  console.log(`Raw walls: ${walls.length}`);
  console.log(`Filtered walls: ${filteredWalls.length}`);
  console.log(`Merged walls: ${mergedWalls.length}`);

  return mergedWalls;
}
