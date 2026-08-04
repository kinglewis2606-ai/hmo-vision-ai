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

  const horizontal = walls.filter(
    w => w.y1 === w.y2
  );

  const vertical = walls.filter(
    w => w.x1 === w.x2
  );

  const rooms: DetectedRoom[] = [];
  let id = 1;

  for (let h1 = 0; h1 < horizontal.length; h1++) {

    for (let h2 = h1 + 1; h2 < horizontal.length; h2++) {

      const top = horizontal[h1];
      const bottom = horizontal[h2];

      if (bottom.y1 - top.y1 < 60) continue;

      const left = vertical.find(v =>
        v.y1 <= top.y1 &&
        v.y2 >= bottom.y1 &&
        Math.abs(v.x1 - top.x1) < 20
      );

      const right = vertical.find(v =>
        v.y1 <= top.y1 &&
        v.y2 >= bottom.y1 &&
        Math.abs(v.x1 - top.x2) < 20
      );

      if (!left || !right) continue;

      const duplicate = rooms.some(
  r =>
    Math.abs(r.x - left.x1) < 5 &&
    Math.abs(r.y - top.y1) < 5 &&
    Math.abs(r.width - (right.x1 - left.x1)) < 5 &&
    Math.abs(r.height - (bottom.y1 - top.y1)) < 5
);

if (duplicate) {
  continue;
}
      rooms.push({
        id: `room-${id++}`,
        x: left.x1,
        y: top.y1,
        width: right.x1 - left.x1,
        height: bottom.y1 - top.y1,
      });

    }

  }

  console.log(`Detected ${rooms.length} rooms`);

  return rooms;
}
