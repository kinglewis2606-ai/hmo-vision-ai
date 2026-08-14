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

  const visited = Array.from(
  { length: imageHeight },
  () => new Uint8Array(imageWidth)
);

const rooms: DetectedRoom[] = [];

const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

for (let startY = 0; startY < imageHeight; startY++) {
  for (let startX = 0; startX < imageWidth; startX++) {

    if (grid[startY][startX] === 1) continue;
    if (visited[startY][startX]) continue;

    const queue = [[startX, startY]];
    visited[startY][startX] = 1;

    let minX = startX;
    let maxX = startX;
    let minY = startY;
    let maxY = startY;

    let pixels = 0;

    while (queue.length) {

      const [x, y] = queue.shift()!;

      pixels++;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      for (const [dx, dy] of directions) {

        const nx = x + dx;
        const ny = y + dy;

        if (
          nx < 0 ||
          ny < 0 ||
          nx >= imageWidth ||
          ny >= imageHeight
        ) {
          continue;
        }

        if (visited[ny][nx]) continue;
        if (grid[ny][nx] === 1) continue;

        visited[ny][nx] = 1;
        queue.push([nx, ny]);
      }
    }

    // Ignore tiny blobs
    if (pixels < 500) continue;

    rooms.push({
      id: `room-${rooms.length + 1}`,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    });

  }
}

console.log(`Found ${rooms.length} enclosed spaces`);

return rooms;
}
