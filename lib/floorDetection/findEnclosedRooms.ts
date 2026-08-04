export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function findEnclosedRooms(
  walls: any[],
  imageWidth: number,
  imageHeight: number
): Promise<DetectedRoom[]> {

  console.log("Building occupancy grid...");

  const grid = Array.from(
    { length: imageHeight },
    () => new Uint8Array(imageWidth)
  );

  for (const wall of walls) {

    const minX = Math.min(wall.x1, wall.x2);
    const maxX = Math.max(wall.x1, wall.x2);

    const minY = Math.min(wall.y1, wall.y2);
    const maxY = Math.max(wall.y1, wall.y2);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {

        if (
          x >= 0 &&
          y >= 0 &&
          x < imageWidth &&
          y < imageHeight
        ) {
          grid[y][x] = 1;
        }

      }
    }
  }

  console.log("Occupancy grid built");

  return [];
}
