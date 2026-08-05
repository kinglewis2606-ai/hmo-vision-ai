import { WallLine } from "./detectWalls";

const GAP = 15;
const ALIGNMENT = 3;

export function mergeWalls(walls: WallLine[]): WallLine[] {
  const horizontal = walls
    .filter(w => Math.abs(w.y1 - w.y2) <= ALIGNMENT)
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

  const vertical = walls
    .filter(w => Math.abs(w.x1 - w.x2) <= ALIGNMENT)
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

  const merged: WallLine[] = [];

  // Merge horizontal
  for (const wall of horizontal) {
    const last = merged[merged.length - 1];

    if (
      last &&
      Math.abs(last.y1 - last.y2) <= ALIGNMENT &&
      Math.abs(last.y1 - wall.y1) <= ALIGNMENT &&
      wall.x1 <= last.x2 + GAP
    ) {
      last.x2 = Math.max(last.x2, wall.x2);
    } else {
      merged.push({ ...wall });
    }
  }

  // Merge vertical
  for (const wall of vertical) {
    const last = merged[merged.length - 1];

    if (
      last &&
      Math.abs(last.x1 - last.x2) <= ALIGNMENT &&
      Math.abs(last.x1 - wall.x1) <= ALIGNMENT &&
      wall.y1 <= last.y2 + GAP
    ) {
      last.y2 = Math.max(last.y2, wall.y2);
    } else {
      merged.push({ ...wall });
    }
  }

  return merged;
}
