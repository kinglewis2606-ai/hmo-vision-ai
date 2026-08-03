import { DetectedFloor } from "./detectFloors";
import { DetectedRoom } from "./detectRooms";

export function buildOriginalFloorPlan(
  floors: DetectedFloor[],
  rooms: DetectedRoom[]
) {
  return {
    floors: floors.map((floor, floorIndex) => ({
      name: floor.name,
      level: floorIndex,
      rooms: rooms
        .filter(
          room =>
            room.y >= floor.top &&
            room.y < floor.bottom
        )
        .map(room => ({
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

          adjacentRooms: [],

          doors: [],

          windows: [],

          notes: "",

          confidence: "Detected from geometry"
        }))
    }))
  };
}
