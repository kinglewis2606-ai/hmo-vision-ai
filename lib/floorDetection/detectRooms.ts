import { WallLine, DetectedRoom, DetectedFloor } from "@/lib/types/floorPlan";

const CELL_SIZE = 6;

function lineIntersectsRect(
  wall: WallLine,
  left: number,
  top: number,
  right: number,
  bottom: number
): boolean {
  const pad = 3;

  if (Math.abs(wall.y1 - wall.y2) <= 3) {
    const y = wall.y1;
    const wallLeft = Math.min(wall.x1, wall.x2);
    const wallRight = Math.max(wall.x1, wall.x2);

    return (
      y >= top - pad &&
      y <= bottom + pad &&
      wallRight >= left - pad &&
      wallLeft <= right + pad
    );
  }

  if (Math.abs(wall.x1 - wall.x2) <= 3) {
    const x = wall.x1;
    const wallTop = Math.min(wall.y1, wall.y2);
    const wallBottom = Math.max(wall.y1, wall.y2);

    return (
      x >= left - pad &&
      x <= right + pad &&
      wallBottom >= top - pad &&
      wallTop <= bottom + pad
    );
  }

  return false;
}

function detectRoomsInFloor(
  walls: WallLine[],
  floor: DetectedFloor,
  startId: number
): { rooms: DetectedRoom[]; nextId: number } {
  const left = Math.max(0, floor.left ?? 0);
  const top = Math.max(0, floor.top ?? 0);
  const right = Math.max(left + 1, floor.right ?? Math.max(left + 1, ...walls.map(w => Math.max(w.x1, w.x2)), left + 1));
  const bottom = Math.max(top + 1, floor.bottom ?? Math.max(top + 1, ...walls.map(w => Math.max(w.y1, w.y2)), top + 1));

  const cols = Math.ceil((right - left) / CELL_SIZE);
  const rows = Math.ceil((bottom - top) / CELL_SIZE);

  if (cols < 2 || rows < 2) return { rooms: [], nextId: startId };

  const blocked: boolean[][] = Array.from(
    { length: rows },
    () => Array(cols).fill(false)
  );

  // Treat the panel perimeter as a boundary. This prevents the open space
  // around the drawing from swallowing all internal rooms into one component.
  for (let c = 0; c < cols; c++) {
    blocked[0][c] = true;
    blocked[rows - 1][c] = true;
  }
  for (let r = 0; r < rows; r++) {
    blocked[r][0] = true;
    blocked[r][cols - 1] = true;
  }

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const cellLeft = left + c * CELL_SIZE;
      const cellTop = top + r * CELL_SIZE;
      const cellRight = Math.min(right, cellLeft + CELL_SIZE);
      const cellBottom = Math.min(bottom, cellTop + CELL_SIZE);

      blocked[r][c] = walls.some(w =>
        lineIntersectsRect(w, cellLeft, cellTop, cellRight, cellBottom)
      );
    }
  }

  const visited: boolean[][] = Array.from(
    { length: rows },
    () => Array(cols).fill(false)
  );

  const rooms: DetectedRoom[] = [];
  let id = startId;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const floorArea = (right - left) * (bottom - top);
  const minRoomArea = Math.max(600, floorArea * 0.004);
  const maxRoomArea = floorArea * 0.45;

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      if (blocked[r][c] || visited[r][c]) continue;

      const queue: Array<[number, number]> = [[c, r]];
      const cells: Array<[number, number]> = [];
      visited[r][c] = true;

      while (queue.length) {
        const [cx, cy] = queue.shift()!;
        cells.push([cx, cy]);

        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;

          if (
            nx <= 0 ||
            ny <= 0 ||
            nx >= cols - 1 ||
            ny >= rows - 1 ||
            blocked[ny][nx] ||
            visited[ny][nx]
          ) {
            continue;
          }

          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }

      if (cells.length < 4) continue;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const [cx, cy] of cells) {
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
      }

      const room = {
        id: `room-${id++}`,
        x: left + minX * CELL_SIZE,
        y: top + minY * CELL_SIZE,
        width: Math.min(right, left + (maxX + 1) * CELL_SIZE) - (left + minX * CELL_SIZE),
        height: Math.min(bottom, top + (maxY + 1) * CELL_SIZE) - (top + minY * CELL_SIZE),
      };

      const area = room.width * room.height;
      const aspect = room.width / Math.max(1, room.height);

      if (
        area < minRoomArea ||
        area > maxRoomArea ||
        aspect < 0.12 ||
        aspect > 8
      ) {
        continue;
      }

      rooms.push(room);
    }
  }

  return { rooms, nextId: id };
}

export async function detectRooms(
  walls: WallLine[],
  floors?: DetectedFloor[]
): Promise<DetectedRoom[]> {
  if (!walls.length) {
    console.log("Room detector received 0 walls");
    return [];
  }

  console.log(`Room detector received ${walls.length} merged walls`);

  if (!floors?.length) {
    console.log("No floor bounds supplied; cannot safely assign room geometry");
    return [];
  }

  const rooms: DetectedRoom[] = [];
  let nextId = 1;

  for (const floor of floors) {
    const floorWalls = walls.filter(w => {
      const left = floor.left ?? 0;
      const right = floor.right ?? Infinity;
      const top = floor.top ?? 0;
      const bottom = floor.bottom ?? Infinity;

      return (
        Math.max(w.x1, w.x2) >= left &&
        Math.min(w.x1, w.x2) <= right &&
        Math.max(w.y1, w.y2) >= top &&
        Math.min(w.y1, w.y2) <= bottom
      );
    });

    const result = detectRoomsInFloor(floorWalls, floor, nextId);
    rooms.push(...result.rooms);
    nextId = result.nextId;

    console.log(`${floor.name}: ${result.rooms.length} candidate rooms`);
  }

  console.log(`Detected ${rooms.length} rooms`);
  return rooms;
}
