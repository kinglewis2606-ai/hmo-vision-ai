import { DetectedFloor, DetectedRoom, FloorPlan } from "@/lib/types/floorPlan";

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

export function buildOriginalFloorPlan(floors: DetectedFloor[], rooms: DetectedRoom[]): FloorPlan {
  return {
    floors: floors.map((floor, floorIndex) => {
      const floorRooms = rooms.filter(room => roomBelongsToFloor(room, floor));
      return {
        name: floor.name,
        level: floorIndex,
        rooms: floorRooms.map(room => ({
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
          windows: (room.openingWalls || []).map(wall => ({ wall })),
          notes: "",
          confidence: "Geometry Detection"
        }))
      };
    })
  };
}
