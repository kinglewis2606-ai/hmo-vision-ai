import { WallLine } from "@/lib/types/floorPlan";

export function filterWalls(
  walls: WallLine[]
): WallLine[] {

  return walls.filter((wall) => {

    const length = Math.max(
      Math.abs(wall.x2 - wall.x1),
      Math.abs(wall.y2 - wall.y1)
    );

    // Ignore very small line segments
    if (length < 40) {
      return false;
    }

    // Keep only horizontal or vertical walls
    const horizontal = wall.y1 === wall.y2;
    const vertical = wall.x1 === wall.x2;

    return horizontal || vertical;
  });

}
