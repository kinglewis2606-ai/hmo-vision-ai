import { DetectedFloor, DetectedRoom, RoomLabel, FloorPlan, Room, Floor, Door, Window } from "@/lib/types/floorPlan";

/**
 * Assemble detected rooms and labels into a canonical FloorPlan structure.
 * This is the foundational data model used throughout the analysis pipeline.
 */
export function buildOriginalFloorPlan(
  floors: DetectedFloor[],
  detectedRooms: DetectedRoom[],
  labels: RoomLabel[] = []
): FloorPlan {
  const labelMap = new Map<string, RoomLabel>();
  for (const label of labels) {
    labelMap.set(label.roomId, label);
  }

  const roomMap = new Map<string, DetectedRoom>();
  for (const room of detectedRooms) {
    roomMap.set(room.id, room);
  }

  // Group detected rooms by floor
  const floorRoomsMap = new Map<string, DetectedRoom[]>();
  for (const floor of floors) {
    floorRoomsMap.set(floor.name, []);
  }

  // Simple heuristic: assign rooms to floors based on Y coordinate
  // TODO: Could be more sophisticated based on DetectedFloor boundaries
  for (const room of detectedRooms) {
    let bestFloor = floors[0];
    let bestDistance = Math.abs(room.y - bestFloor.top);

    for (const floor of floors) {
      const distance = Math.abs(room.y - floor.top);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestFloor = floor;
      }
    }

    if (floorRoomsMap.has(bestFloor.name)) {
      floorRoomsMap.get(bestFloor.name)!.push(room);
    }
  }

  // Convert each floor's rooms to canonical Room objects
  const floorObjects: Floor[] = floors.map((floor) => {
    const floorRooms = floorRoomsMap.get(floor.name) || [];

    const rooms: Room[] = floorRooms.map((detRoom) => {
      const label = labelMap.get(detRoom.id);
      const roomName = label?.name || `Room ${detRoom.id}`;
      const roomType = label?.type || "unknown";
      const areaSqm =
        label?.areaSqm ||
        Math.round(((detRoom.width * detRoom.height) / 1000000) * 100) / 100;
      const widthM = label?.widthM || detRoom.width / 1000;
      const depthM = label?.depthM || detRoom.height / 1000;

      // Build doors and windows from opening walls
      const doors: Door[] = [];
      const windows: Window[] = [];

      if (detRoom.openingWalls && Array.isArray(detRoom.openingWalls)) {
        for (const wall of detRoom.openingWalls) {
          // Heuristic: doors usually at specific intervals, windows distributed
          // For simplicity, treat first opening as door, rest as windows
          if (doors.length === 0) {
            doors.push({
              wall: wall as any,
              start: detRoom.width * 0.3,
              end: detRoom.width * 0.7,
            });
          } else {
            windows.push({
              wall: wall as any,
              start: detRoom.width * 0.2,
              end: detRoom.width * 0.8,
            });
          }
        }
      }

      // Identify adjacent rooms (rooms sharing walls)
      const adjacentRooms: string[] = [];
      for (const other of floorRooms) {
        if (other.id === detRoom.id) continue;

        // Check if rooms touch or overlap
        const horizontalOverlap =
          !(detRoom.x + detRoom.width < other.x) &&
          !(other.x + other.width < detRoom.x);
        const verticalOverlap =
          !(detRoom.y + detRoom.height < other.y) &&
          !(other.y + other.height < detRoom.y);

        // Adjacent if they share an edge or corner
        if (horizontalOverlap || verticalOverlap) {
          adjacentRooms.push(other.id);
        }
      }

      return {
        id: detRoom.id,
        name: roomName,
        type: roomType,
        x: detRoom.x,
        y: detRoom.y,
        width: detRoom.width,
        height: detRoom.height,
        adjacentRooms,
        shape: "polygon",
        doors: doors.length > 0 ? doors : undefined,
        windows: windows.length > 0 ? windows : undefined,
        polygon: detRoom.polygon,
        approxAreaSqm: areaSqm,
        approxWidthM: widthM,
        approxDepthM: depthM,
        notes: label?.confidence ? `Confidence: ${label.confidence}` : undefined,
        confidence: label?.confidence,
      };
    });

    return {
      name: floor.name,
      level: floor.level,
      rooms,
    };
  });

  const plan: FloorPlan = {
    floors: floorObjects,
    metadata: {
      pixelsPerMeter: 1000, // Default: 1000 pixels = 1 meter (will be refined)
      grossFloorAreaSqm: floorObjects.reduce(
        (sum, floor) =>
          sum +
          floor.rooms.reduce((roomSum, room) => roomSum + (room.approxAreaSqm || 0), 0),
        0
      ),
      grossAreaReserved: true,
    },
  };

  console.log(
    `[buildOriginalFloorPlan] Created plan with ${plan.floors.length} floor(s) and ${
      plan.floors.reduce((sum, f) => sum + f.rooms.length, 0)
    } room(s), total area ~${plan.metadata?.grossFloorAreaSqm}m²`
  );

  return plan;
}
