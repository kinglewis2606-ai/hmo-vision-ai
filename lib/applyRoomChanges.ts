import { FloorPlan, RoomChange } from "@/lib/types/floorPlan";

function actionType(action?: string): string | undefined {
  switch ((action || "").toLowerCase()) {
    case "convert to bedroom":
    case "converttobedroom":
      return "bedroom";
    case "convert to kitchen":
    case "converttokitchen":
      return "kitchen";
    case "convert to bathroom":
    case "converttobathroom":
    case "convert to ensuite":
    case "converttoensuite":
      return action.toLowerCase().includes("ensuite") ? "ensuite" : "bathroom";
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
      if (change.newType || inferredType) {
        room.type = change.newType || inferredType!;
      }

      if (change.newName) {
        room.name = change.newName;
      } else if (inferredType === "bedroom" && !/bedroom/i.test(room.name)) {
        room.name = "Proposed Bedroom";
      } else if (inferredType === "ensuite") {
        room.name = "Proposed En-suite";
      }

      // These actions need new geometry (a split, merge, extension or a new
      // partition). We deliberately do not invent coordinates here. Preserve
      // the real detected geometry and record the planning action for the UI.
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
