import { DetectedFloor, DetectedRoom, FloorPlan, WallSide, Point } from "@/lib/types/floorPlan";

function touching(a: DetectedRoom, b: DetectedRoom): boolean {
  const tolerance = 15;
  const horizontal = Math.abs(a.x + a.width - b.x) <= tolerance || Math.abs(b.x + b.width - a.x) <= tolerance;
  const verticalOverlap = a.y < b.y + b.height && a.y + a.height > b.y;
  const vertical = Math.abs(a.y + a.height - b.y) <= tolerance || Math.abs(b.y + b.height - a.y) <= tolerance;
  const horizontalOverlap = a.x < b.x + b.width && a.x + a.width > b.x;
  return (horizontal && verticalOverlap) || (vertical && horizontalOverlap);
}
function getAdjacentRooms(room: DetectedRoom, rooms: DetectedRoom[]): string[] { return rooms.filter(r => r.id !== room.id && touching(room, r)).map(r => r.id); }
function roomBelongsToFloor(room: DetectedRoom, floor: DetectedFloor): boolean {
  const cx = room.x + room.width / 2, cy = room.y + room.height / 2;
  return cx >= (floor.left ?? 0) && cx < (floor.right ?? Infinity) && cy >= (floor.top ?? 0) && cy < (floor.bottom ?? Infinity);
}
function authoritativePolygon(room: DetectedRoom): Point[] {
  if (room.polygon && room.polygon.length >= 3) return room.polygon;
  return [{ x: room.x, y: room.y }, { x: room.x + room.width, y: room.y }, { x: room.x + room.width, y: room.y + room.height }, { x: room.x, y: room.y + room.height }];
}
function exteriorFacingWalls(room: DetectedRoom, floorRooms: DetectedRoom[]): WallSide[] {
  if (!floorRooms.length) return [];
  const minX = Math.min(...floorRooms.map(r => r.x)), minY = Math.min(...floorRooms.map(r => r.y));
  const maxX = Math.max(...floorRooms.map(r => r.x + r.width)), maxY = Math.max(...floorRooms.map(r => r.y + r.height));
  const tolerance = 18, walls: WallSide[] = [];
  if (Math.abs(room.x - minX) <= tolerance) walls.push("left");
  if (Math.abs(room.y - minY) <= tolerance) walls.push("top");
  if (Math.abs(room.x + room.width - maxX) <= tolerance) walls.push("right");
  if (Math.abs(room.y + room.height - maxY) <= tolerance) walls.push("bottom");
  return walls;
}
function inferredDoorWall(room: DetectedRoom, floorRooms: DetectedRoom[]): WallSide[] {
  const t = 15, scores: Record<WallSide, number> = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const other of floorRooms) {
    if (other.id === room.id) continue;
    const verticalOverlap = Math.max(0, Math.min(room.y + room.height, other.y + other.height) - Math.max(room.y, other.y));
    const horizontalOverlap = Math.max(0, Math.min(room.x + room.width, other.x + other.width) - Math.max(room.x, other.x));
    if (Math.abs(room.x + room.width - other.x) <= t) scores.right = Math.max(scores.right, verticalOverlap);
    if (Math.abs(other.x + other.width - room.x) <= t) scores.left = Math.max(scores.left, verticalOverlap);
    if (Math.abs(room.y + room.height - other.y) <= t) scores.bottom = Math.max(scores.bottom, horizontalOverlap);
    if (Math.abs(other.y + other.height - room.y) <= t) scores.top = Math.max(scores.top, horizontalOverlap);
  }
  const best = (Object.entries(scores) as Array<[WallSide, number]>).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? [best[0]] : [];
}

export function buildOriginalFloorPlan(floors: DetectedFloor[], rooms: DetectedRoom[]): FloorPlan {
  return {
    floors: floors.map((floor, floorIndex) => {
      const floorRooms = rooms.filter(room => roomBelongsToFloor(room, floor));
      return {
        name: floor.name,
        level: floorIndex,
        rooms: floorRooms.map(room => {
          const polygon = authoritativePolygon(room);
          const windowWalls = Array.from(new Set<WallSide>([...(room.openingWalls || []), ...exteriorFacingWalls(room, floorRooms)]));
          const doorWalls = inferredDoorWall(room, floorRooms);
          const labelledRoom = room as DetectedRoom & { name?: string; type?: string; confidence?: string; approxAreaSqm?: number; approxWidthM?: number; approxDepthM?: number };
          return {
            id: room.id,
            name: labelledRoom.name || "Unknown Room",
            type: labelledRoom.type || "unknown",
            x: room.x, y: room.y, width: room.width, height: room.height,
            polygon,
            approxAreaSqm: labelledRoom.approxAreaSqm ?? Number(((room.width * room.height) / 10000).toFixed(1)),
            approxWidthM: labelledRoom.approxWidthM ?? Number((room.width / 100).toFixed(1)),
            approxDepthM: labelledRoom.approxDepthM ?? Number((room.height / 100).toFixed(1)),
            shape: polygon.length > 4 ? "polygon" : "rectangle",
            adjacentRooms: getAdjacentRooms(room, floorRooms),
            doors: doorWalls.map(wall => ({ wall })),
            windows: windowWalls.map(wall => ({ wall })),
            notes: [
              windowWalls.length ? "Exterior-facing wall preserved as a potential window/opening wall" : "",
              doorWalls.length ? `Likely access wall inferred from shared geometry: ${doorWalls[0]}` : "",
            ].filter(Boolean).join("; "),
            confidence: labelledRoom.confidence || "Geometry Detection",
          };
        }),
      };
    }),
  };
}
