import { WallLine } from "./detectWalls";

export function mergeWalls(
  walls: WallLine[]
): WallLine[] {

  if (walls.length === 0) {
    return [];
  }

  const merged: WallLine[] = [];

  for (const wall of walls) {
    merged.push(wall);
  }

  return merged;
}
