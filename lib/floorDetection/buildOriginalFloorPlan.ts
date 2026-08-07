import { DetectedFloor, DetectedRoom, WallLine, FloorPlan, Floor, Room } from "@/lib/types/floorPlan";

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

/**
 * Builds the original floor plan from detected geometry.
 * 
 * This is the single source of truth for building geometry.
 * It combines:
 * - Detected floors (structure)
 * - Detected rooms (enclosed spaces)
 * - Wall lines (structural elements)
 * 
 * The resulting FloorPlan is IMMUTABLE and forms the basis for all
 * AI planning decisions and transformations.
 */
export function buildOriginalFloorPlan(
  floors: DetectedFloor[],
  rooms: DetectedRoom[],
  walls?: WallLine[]
): FloorPlan {
  const builtFloors: Floor[] = floors.map((floor, floorIndex) => {

    const floorRooms = rooms.filter(
      room =>
        room.y >= floor.top &&
        room.y < floor.bottom
    );

    const roomsData: Room[] = floorRooms.map(room => ({

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

    }));

    return {
      name: floor.name,
      level: floorIndex,
      rooms: roomsData
    };
  });

  return {
    floors: builtFloors,
    walls: walls || [],
    metadata: {
      // Metadata can be populated by detection pipeline
      // including pixelsPerMeter calibration
    }
  };
}
