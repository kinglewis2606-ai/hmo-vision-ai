import { WallLine } from "./detectWalls";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_ROOM_SIZE = 40;

export async function detectRooms(
  walls: WallLine[]
): Promise<DetectedRoom[]> {

  console.log(`Detecting rooms from ${walls.length} walls`);

  const horizontal = walls.filter(w => w.y1 === w.y2);
  const vertical = walls.filter(w => w.x1 === w.x2);

  const rooms: DetectedRoom[] = [];
  let roomId = 1;

  for (let i = 0; i < horizontal.length; i++) {

    const top = horizontal[i];

    for (let j = i + 1; j < horizontal.length; j++) {

      const bottom = horizontal[j];

      if (bottom.y1 <= top.y1) continue;

      const left = vertical.find(v =>
        v.y1 <= top.y1 &&
        v.y2 >= bottom.y1 &&
        Math.abs(v.y1 - top.y1) < 5 &&
        Math.abs(v.y2 - bottom.y1) < 5
      );

      const right = vertical.find(v =>
        v !== left &&
        v.y1 <= top.y1 &&
        v.y2 >= bottom.y1 &&
        Math.abs(v.y1 - top.y1) < 5 &&
        Math.abs(v.y2 - bottom.y1) < 5
      );

      if (!left || !right) continue;

      const x = Math.min(left.x1, right.x1);
      const y = top.y1;
      const width = Math.abs(right.x1 - left.x1);
      const height = bottom.y1 - top.y1;

      if (
        width < MIN_ROOM_SIZE ||
        height < MIN_ROOM_SIZE
      ) {
        continue;
      }

      rooms.push({
        id: `room-${roomId++}`,
        x,
        y,
        width,
        height,
      });

    }

  }

  console.log(`Detected ${rooms.length} rooms`);

  return rooms;
}
