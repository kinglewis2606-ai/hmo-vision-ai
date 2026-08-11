import { FloorPlan, RoomChange } from "@/lib/types/floorPlan";

function actionType(action?: string): string | undefined {
  const value = (action || "").toLowerCase().replace(/\s+/g, "");
  switch (value) {
    case "convert to bedroom".replace(/\s+/g, ""):
    case "converttobedroom":
      return "bedroom";
    case "convert to kitchen".replace(/\s+/g, ""):
    case "converttokitchen":
      return "kitchen";
    case "convert to bathroom".replace(/\s+/g, ""):
    case "converttobathroom":
      return "bathroom";
    case "convert to ensuite".replace(/\s+/g, ""):
    case "converttoensuite":
      return "ensuite";
    default:
      return undefined;
  }
}

function isNoOpTypeChange(currentType: string, requestedType: string): boolean {
  const current = currentType.toLowerCase();
  const requested = requestedType.toLowerCase();

  if (requested === "bedroom") return current.includes("bedroom");
  if (requested === "bathroom") return current.includes("bathroom") || current.includes("shower") || current.includes("ensuite");
  if (requested === "kitchen") return current.includes("kitchen");
  if (requested === "ensuite") return current.includes("ensuite");
  return current === requested;
}

export function applyRoomChanges(
  floorPlan: FloorPlan,
  changes: RoomChange[]
): FloorPlan {
  const updated = structuredClone(floorPlan);

  for (const change of changes || []) {
    if (!change?.roomId) continue;

    for (const floor of updated.floors) {
      const room = floor.rooms.find(candidate => candidate.id === change.roomId);
      if (!room) continue;

      const inferredType = actionType(change.action);
      const requestedType = String(change.newType || inferredType || "").trim().toLowerCase();
      const action = String(change.action || "").toLowerCase();
      const isEnsuite = requestedType.includes("ensuite") || action.includes("converttoensuite");
      const isNoChange = !requestedType && action.replace(/\s+/g, "") === "nochange";

      if (isNoChange) continue;

      // Do not turn an already-bedroom into another bedroom just because the
      // model repeated it in its change list. The same rule applies to other
      // direct type conversions. This prevents unchanged rooms being rendered
      // as proposed changes.
      const typeIsNoOp = requestedType.length > 0 && isNoOpTypeChange(room.type || "", requestedType);

      if (!isEnsuite && requestedType && !typeIsNoOp) {
        room.type = change.newType || inferredType!;
      }

      // Names are only proposal annotations. Do not make a room visually
      // "changed" merely because the AI renamed every existing room.
      if (!typeIsNoOp && change.newName && !isEnsuite) {
        room.name = change.newName;
      } else if (!typeIsNoOp && inferredType === "bedroom" && !/bedroom/i.test(room.name)) {
        room.name = "Proposed Bedroom";
      }

      if (isEnsuite && !typeIsNoOp) {
        room.notes = [room.notes, "Proposed En-suite"].filter(Boolean).join("; ");
      }

      // Splits, merges, extensions and partition/door changes require actual
      // geometry edits. Never invent coordinates here; retain the detected
      // geometry and record the planning action instead.
      if (change.action && /split|merge|extend|partition|doorway|opening/i.test(change.action)) {
        room.notes = [room.notes, change.action].filter(Boolean).join("; ");
      }

      if (change.reason && !typeIsNoOp) {
        room.notes = [room.notes, change.reason].filter(Boolean).join("; ");
      }
    }
  }

  return updated;
}
