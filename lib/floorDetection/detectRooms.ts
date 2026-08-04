import { WallLine } from "./detectWalls";

export interface DetectedRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const WALL_TOLERANCE = 35;
const MIN_ROOM = 60;
const MAX_ROOM = 1200;

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

    const bottoms = horizontal.filter(h =>
      h.y1 > top.y1 + MIN_ROOM &&
      Math.abs(h.x1 - top.x1) < WALL_TOLERANCE &&
      Math.abs(h.x2 - top.x2) < WALL_TOLERANCE
    );

    for (const bottom of bottoms) {

      const leftWalls = vertical.filter(v =>
        Math.abs(v.x1 - top.x1) < WALL_TOLERANCE &&
        v.y1 <= top.y1 + WALL_TOLERANCE &&
        v.y2 >= bottom.y1 - WALL_TOLERANCE
      );

      const rightWalls = vertical.filter(v =>
        Math.abs(v.x1 - top.x2) < WALL_TOLERANCE &&
        v.y1 <= top.y1 + WALL_TOLERANCE &&
        v.y2 >= bottom.y1 - WALL_TOLERANCE
      );

      if (!leftWalls.length || !rightWalls.length)
        continue;

      const left = leftWalls.reduce((a, b) =>
        Math.abs(a.x1 - top.x1) < Math.abs(b.x1 - top.x1) ? a : b
      );

      const right = rightWalls.reduce
