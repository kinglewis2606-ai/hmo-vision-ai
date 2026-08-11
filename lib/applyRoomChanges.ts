import { FloorPlan, RoomChange } from "@/lib/types/floorPlan";

function actionType(action?: string): string | undefined {
  const value = (action || "").toLowerCase();
  switch (value) {
    case "convert to bedroom":
    case "converttobedroom":
      return "bedroom";
    case "convert to kitchen":
    case "converttokitchen":
      return "kitchen";
    case "convert to bathroom":
    case "converttobathroom":
      return "bathroom";
    case "convert to ensuite":
    case "converttoensuite":
      return "ensuite";
    default:
      return undefined;
  }
}

export function applyRoomChanges(
  floorPlan: FloorPlan,
  changes: RoomChange[]
): FloorPlan {
  if (!changes || changes.length === 0) {
    return structuredClone(floorPlan);
  }

  const updated = structuredClone(floorPlan);

  for (const change of changes) {
    for (const floor of updated.floors) {
      const room = floor.rooms.find(candidate => candidate.id === change.roomId);
      if (!room) continue;

      const inferredType = actionType(change.action);
      const requestedType = String(change.newType || inferredType || "").toLowerCase();

      // An ensuite is an amenity within a bedroom, not a replacement for the
      // bedroom itself. Without new geometry we preserve the bedroom and mark
      // the proposed ensuite as a planning annotation.
      const isEnsuite = requestedType.includes("ensuite");

      if (!isEnsuite && (change.newType || inferredType)) {
        room.type = change.newType || inferredType!;
      }

      if (change.newName && !isEnsuite) {
        room.name = change.newName;
      } else if (inferredType === "bedroom" && !/bedroom/i.test(room.name)) {
        room.name = "Proposed Bedroom";
      }

      if (isEnsuite) {
        room.notes = [room.notes, "Proposed En-suite"].filter(Boolean).join("; ");
      }

      // Splits, merges, extensions and partition/door changes require actual
      // geometry edits. Never invent coordinates here; retain the detected
      // geometry and record the planning action instead.
      if (change.action && /split|merge|extend|partition|doorway|opening/i.test(change.action)) {
        room.notes = [room.notes, change.action].filter(Boolean).join("; ");
      }

      if (change.reason) {
        room.notes = [room.notes, change.reason].filter(Boolean).join("; ");
      }
    }
  }

  return updated;
}
