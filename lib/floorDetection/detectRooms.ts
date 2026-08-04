import { WallLine } from "./detectWalls";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function detectRooms(
  walls: WallLine[]
): Promise<DetectedRoom[]> {

  const horizontal = walls
    .filter(w => w.y1 === w.y2)
    .sort((a, b) => a.y1 - b.y1);

  const vertical = walls
    .filter(w => w.x1 === w.x2)
    .sort((a, b) => a.x1 - b.x1);

  const rooms: DetectedRoom[] = [];
  const seen = new Set<string>();

  let id = 1;

  for (const top of horizontal) {

    const bottom = horizontal.find(h =>
      h.y1 > top.y1 &&
      Math.abs(h.x1 - top.x1) < 20 &&
      Math.abs(h.x2 - top.x2) < 20 &&
      h.y1 - top.y1 > 60
    );

    if (!bottom) continue;

    const left = vertical.find(v =>
      Math.abs(v.x1 - top.x1) < 20 &&
      v.y1 <= top.y1 &&
      v.y2 >= bottom.y1
    );

    const right = vertical.find(v =>
      Math.abs(v.x1 - top.x2) < 20 &&
      v.y1 <= top.y1 &&
      v.y2 >= bottom.y1
    );

    if (!left || !right) continue;

    const width = right.x1 - left.x1;
    const height = bottom.y1 - top.y1;

    if (width < 60 || height < 60)
      continue;

    const key = `${left.x1}-${top.y1}-${width}-${height}`;

    if (seen.has(key))
      continue;

    seen.add(key);

    rooms.push({
      id: `room-${id++}`,
      x: left.x1,
      y: top.y1,
      width,
      height,
    });
  }

  console.log(`Detected ${rooms.length} rooms`);

  return rooms;
}
