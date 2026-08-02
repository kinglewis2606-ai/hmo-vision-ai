import { loadImage } from "./loadImage";
import { DetectedFloor } from "./detectFloors";

export interface WallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const DARK_PIXEL = 160;
const MIN_WALL_LENGTH = 25;

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
  

  console.log(
    `Scanning ${width} x ${height} image`
  );

  const walls: WallLine[] = [];

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

      if (dark) {

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

for (const floor of floors) {

  for (let x = 0; x < width; x++) {

    let runStart = -1;

    for (let y = floor.top; y < floor.bottom; y++) {

      const dark = isDark(
        pixels,
        width,
        x,
        y
      );

      if (dark) {

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

  const filteredWalls = walls.filter((wall) => {
    const length = Math.max(
      Math.abs(wall.x2 - wall.x1),
      Math.abs(wall.y2 - wall.y1)
    );

    return length >= MIN_WALL_LENGTH;
  });

  console.log(
    `Returning ${filteredWalls.length} wall segments`
  );

  return filteredWalls;
}
