import { WallLine } from "./detectWalls";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const CELL_SIZE = 8;
const MIN_ROOM_AREA = 2000;
const MAX_ROOM_AREA = 100000;

interface Cell {
  x: number;
  y: number;
}

function lineIntersectsRect(
  wall: WallLine,
  left: number,
  top: number,
  right: number,
  bottom: number
): boolean {
  if (Math.abs(wall.y1 - wall.y2) < 3) {
    return (
      wall.y1 >= top &&
      wall.y1 <= bottom &&
      wall.x2 >= left &&
      wall.x1 <= right
    );
  }

  return (
    wall.x1 >= left &&
    wall.x1 <= right &&
    wall.y2 >= top &&
    wall.y1 <= bottom
  );
}

export async function detectRooms(
  walls: WallLine[],
  floors?: { top: number; bottom: number }[]
): Promise<DetectedRoom[]> {

  if (walls.length === 0) {
  return [];
}

console.log(
  `Room detector received ${walls.length} merged walls`
);

if (floors) {
  console.log(
    `Using ${floors.length} detected floors`
  );
}
  const horizontal = walls.filter(
    w => Math.abs(w.y1 - w.y2) < 3
  );

  const vertical = walls.filter(
    w => Math.abs(w.x1 - w.x2) < 3
  );

  const maxX = Math.max(
    ...walls.map(w => Math.max(w.x1, w.x2))
  );

  const maxY = Math.max(
    ...walls.map(w => Math.max(w.y1, w.y2))
  );

  const cols = Math.ceil(maxX / CELL_SIZE);
  const rows = Math.ceil(maxY / CELL_SIZE);

  const blocked: boolean[][] = Array.from(
    { length: rows },
    () => Array(cols).fill(false)
  );

  for (let r = 0; r < rows; r++) {

    for (let c = 0; c < cols; c++) {

      const left = c * CELL_SIZE;
      const top = r * CELL_SIZE;
      const right = left + CELL_SIZE;
      const bottom = top + CELL_SIZE;

      blocked[r][c] =
        horizontal.some(w =>
          lineIntersectsRect(
            w,
            left,
            top,
            right,
            bottom
          )
        ) ||
        vertical.some(w =>
          lineIntersectsRect(
            w,
            left,
            top,
            right,
            bottom
          )
        );
    }
  }

  const visited: boolean[][] = Array.from(
    { length: rows },
    () => Array(cols).fill(false)
  );

  const rooms: DetectedRoom[] = [];

  let id = 1;

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
    for (let r = 0; r < rows; r++) {

    for (let c = 0; c < cols; c++) {

      if (blocked[r][c] || visited[r][c]) {
        continue;
      }

      const queue: Cell[] = [{ x: c, y: r }];
      const cells: Cell[] = [];
      visited[r][c] = true;

      while (queue.length) {

        const current = queue.shift()!;

        cells.push(current);

        for (const [dx, dy] of dirs) {

          const nx = current.x + dx;
          const ny = current.y + dy;

          if (
            nx < 0 ||
            ny < 0 ||
            nx >= cols ||
            ny >= rows
          ) {
            continue;
          }

          if (
            blocked[ny][nx] ||
            visited[ny][nx]
          ) {
            continue;
          }

          visited[ny][nx] = true;

          queue.push({
            x: nx,
            y: ny,
          });
        }
      }

      if (cells.length === 0) {
        continue;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxCellX = -Infinity;
      let maxCellY = -Infinity;

      for (const cell of cells) {
        if (cell.x < minX) minX = cell.x;
        if (cell.y < minY) minY = cell.y;
        if (cell.x > maxCellX) maxCellX = cell.x;
        if (cell.y > maxCellY) maxCellY = cell.y;
      }

      const room = {
        id: `room-${id++}`,
        x: minX * CELL_SIZE,
        y: minY * CELL_SIZE,
        width: (maxCellX - minX + 1) * CELL_SIZE,
        height: (maxCellY - minY + 1) * CELL_SIZE,
      };

      const area = room.width * room.height;

      if (
        area < MIN_ROOM_AREA ||
        area > MAX_ROOM_AREA
      ) {
        continue;
      }

      rooms.push(room);
    }
  }

  console.log(`Detected ${rooms.length} rooms`);

  return rooms;
}
