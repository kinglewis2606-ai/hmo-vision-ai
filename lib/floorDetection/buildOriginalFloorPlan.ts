import { DetectedFloor, DetectedRoom, FloorPlan, WallSide } from "@/lib/types/floorPlan";

function touching(a: DetectedRoom, b: DetectedRoom): boolean {
  const tolerance = 15;
  const horizontal = Math.abs(a.x + a.width - b.x) <= tolerance || Math.abs(b.x + b.width - a.x) <= tolerance;
  const verticalOverlap = a.y < b.y + b.height && a.y + a.height > b.y;
  const vertical = Math.abs(a.y + a.height - b.y) <= tolerance || Math.abs(b.y + b.height - a.y) <= tolerance;
  const horizontalOverlap = a.x < b.x + b.width && a.x + a.width > b.x;
  return (horizontal && verticalOverlap) || (vertical && horizontalOverlap);
}
function getAdjacentRooms(room: DetectedRoom, rooms: DetectedRoom[]): string[] {
  return rooms.filter(r => r.id !== room.id).filter(r => touching(room, r)).map(r => r.id);
}
function roomBelongsToFloor(room: DetectedRoom, floor: DetectedFloor): boolean {
  const cx = room.x + room.width / 2, cy = room.y + room.height / 2;
  const left = floor.left ?? 0, right = floor.right ?? Infinity, top = floor.top ?? 0, bottom = floor.bottom ?? Infinity;
  return cx >= left && cx < right && cy >= top && cy < bottom;
}

// The detector may not reliably distinguish a window from a door at this stage.
// For HMO planning it is safer to preserve every exterior-facing wall as a
// potential opening wall than to put a wet-room partition across an external wall.
function exteriorFacingWalls(room: DetectedRoom, floorRooms: DetectedRoom[]): WallSide[] {
  if (!floorRooms.length) return [];
  const minX = Math.min(...floorRooms.map(r => r.x));
  const minY = Math.min(...floorRooms.map(r => r.y));
  const maxX = Math.max(...floorRooms.map(r => r.x + r.width));
  const maxY = Math.max(...floorRooms.map(r => r.y + r.height));
  const tolerance = 18;
  const walls: WallSide[] = [];
  if (Math.abs(room.x - minX) <= tolerance) walls.push("left");
  if (Math.abs(room.y - minY) <= tolerance) walls.push("top");
  if (Math.abs(room.x + room.width - maxX) <= tolerance) walls.push("right");
  if (Math.abs(room.y + room.height - maxY) <= tolerance) walls.push("bottom");
  return walls;
}

export function buildOriginalFloorPlan(floors: DetectedFloor[], rooms: DetectedRoom[]): FloorPlan {
  return {
    floors: floors.map((floor, floorIndex) => {
      const floorRooms = rooms.filter(room => roomBelongsToFloor(room, floor));
      return {
        name: floor.name,
        level: floorIndex,
        rooms: floorRooms.map(room => {
          const inferredWalls = Array.from(new Set<WallSide>([
            ...(room.openingWalls || []),
            ...exteriorFacingWalls(room, floorRooms),
          ]));
          return {
            id: room.id,
            name: "Unknown Room",
            type: "unknown",
            x: room.x,
            y: room.y,
            width: room.width,
            height: room.height,
            polygon: room.polygon,
            approxAreaSqm: Number(((room.width * room.height) / 10000).toFixed(1)),
            approxWidthM: Number((room.width / 100).toFixed(1)),
            approxDepthM: Number((room.height / 100).toFixed(1)),
            shape: room.polygon && room.polygon.length > 4 ? "polygon" : "rectangle",
            adjacentRooms: getAdjacentRooms(room, floorRooms),
            doors: [],
            windows: inferredWalls.map(wall => ({ wall })),
            notes: inferredWalls.length ? "Exterior-facing wall preserved as a potential window/opening wall" : "",
            confidence: "Geometry Detection"
          };
        })
      };
    })
  };
}
