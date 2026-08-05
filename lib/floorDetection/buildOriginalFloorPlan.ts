import { DetectedFloor } from "./detectFloors";
import { DetectedRoom } from "./detectRooms";

function touching(a: DetectedRoom, b: DetectedRoom): boolean {
  const tolerance = 15;

  const horizontal =
    Math.abs(a.x + a.width - b.x) <= tolerance ||
    Math.abs(b.x + b.width - a.x) <= tolerance;

  const verticalOverlap =
    a.y < b.y + b.height &&
    a.y + a.height > b.y;

  const vertical =
    Math.abs(a.y + a.height - b.y) <= tolerance ||
    Math.abs(b.y + b.height - a.y) <= tolerance;

  const horizontalOverlap =
    a.x < b.x + b.width &&
    a.x + a.width > b.x;

  return (
    (horizontal && verticalOverlap) ||
    (vertical && horizontalOverlap)
  );
}

function getAdjacentRooms(
  room: DetectedRoom,
  rooms: DetectedRoom[]
): string[] {
  return rooms
    .filter(r => r.id !== room.id)
    .filter(r => touching(room, r))
    .map(r => r.id);
}

export function buildOriginalFloorPlan(
  floors: DetectedFloor[],
  rooms: DetectedRoom[]
) {
  return {
    floors: floors.map((floor, floorIndex) => {

      const floorRooms = rooms.filter(
        room =>
          room.y >= floor.top &&
          room.y < floor.bottom
      );

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

          approxAreaSqm: Number(
            ((room.width * room.height) / 10000).toFixed(1)
          ),

          approxWidthM: Number(
            (room.width / 100).toFixed(1)
          ),

          approxDepthM: Number(
            (room.height / 100).toFixed(1)
          ),

          shape: "rectangle",

          adjacentRooms: getAdjacentRooms(
            room,
            floorRooms
          ),

          doors: [],

          windows: [],

          notes: "",

          confidence: "Geometry Detection"

        }))
      };
    })
  };
}
