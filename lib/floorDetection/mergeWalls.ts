import { WallLine } from "./detectWalls";

const GAP = 5;

export function mergeWalls(walls: WallLine[]): WallLine[] {
  const horizontal = walls
    .filter(w => w.y1 === w.y2)
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

  const vertical = walls
    .filter(w => w.x1 === w.x2)
    .sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);

  const merged: WallLine[] = [];

  // Merge horizontal walls
  for (const wall of horizontal) {
    const last = merged[merged.length - 1];

    if (
      last &&
      last.y1 === wall.y1 &&
      wall.x1 <= last.x2 + GAP
    ) {
      last.x2 = Math.max(last.x2, wall.x2);
    } else {
      merged.push({ ...wall });
    }
  }

  // Merge vertical walls
  for (const wall of vertical) {
    const last = merged[merged.length - 1];

    if (
      last &&
      last.x1 === wall.x1 &&
      wall.y1 <= last.y2 + GAP
    ) {
      last.y2 = Math.max(last.y2, wall.y2);
    } else {
      merged.push({ ...wall });
    }
  }

  return merged;
}
