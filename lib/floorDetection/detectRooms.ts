import { WallLine } from "./detectWalls";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const WALL_TOLERANCE = 35;
const MIN_ROOM_SIZE = 60;
const MAX_ROOM_SIZE = 1200;

export async function detectRooms(
  walls: WallLine[]
): Promise<DetectedRoom[]> {
  const horizontal = walls
    .filter((w) => Math.abs(w.y1 - w.y2) <= 3)
    .sort((a, b) => a.y1 - b.y1);

  const vertical = walls
    .filter((w) => Math.abs(w.x1 - w.x2) <= 3)
    .sort((a, b) => a.x1 - b.x1);

  const rooms: DetectedRoom[] = [];
  const seen = new Set<string>();

  let id = 1;

  for (const top of horizontal) {
    const bottomCandidates = horizontal.filter(
      (h) =>
        h.y1 > top.y1 + MIN_ROOM_SIZE &&
        Math.abs(h.x1 - top.x1) < WALL_TOLERANCE &&
        Math.abs(h.x2 - top.x2) < WALL_TOLERANCE
    );

    for (const bottom of bottomCandidates) {
      const leftCandidates = vertical.filter(
        (v) =>
          Math.abs(v.x1 - top.x1) < WALL_TOLERANCE &&
          v.y1 <= top.y1 + WALL_TOLERANCE &&
          v.y2 >= bottom.y1 - WALL_TOLERANCE
      );

      const rightCandidates = vertical.filter(
        (v) =>
          Math.abs(v.x1 - top.x2) < WALL_TOLERANCE &&
          v.y1 <= top.y1 + WALL_TOLERANCE &&
          v.y2 >= bottom.y1 - WALL_TOLERANCE
      );

      if (leftCandidates.length === 0 || rightCandidates.length === 0) {
        continue;
      }

      const left = leftCandidates.reduce((best, current) =>
        Math.abs(current.x1 - top.x1) < Math.abs(best.x1 - top.x1)
          ? current
          : best
      );

      const right = rightCandidates.reduce((best, current) =>
        Math.abs(current.x1 - top.x2) < Math.abs(best.x1 - top.x2)
          ? current
          : best
      );

      const width = right.x1 - left.x1;
      const height = bottom.y1 - top.y1;

      if (
        width < MIN_ROOM_SIZE ||
        height < MIN_ROOM_SIZE ||
        width > MAX_ROOM_SIZE ||
        height > MAX_ROOM_SIZE
      ) {
        continue;
      }

      const key = [
        Math.round(left.x1 / 10),
        Math.round(top.y1 / 10),
        Math.round(width / 10),
        Math.round(height / 10),
      ].join("-");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      rooms.push({
        id: `room-${id++}`,
        x: left.x1,
        y: top.y1,
        width,
        height,
      });
    }
  }

  console.log(`Detected ${rooms.length} rooms`);

  return rooms;
}
