import { FloorPlan, RoomChange } from "@/lib/types/floorPlan";

function actionType(action?: string): string | undefined {
  const value = (action || "").toLowerCase().replace(/\s+/g, "");
  switch (value) {
    case "converttobedroom": return "bedroom";
    case "converttokitchen": return "kitchen";
    case "converttobathroom": return "bathroom";
    case "converttoensuite": return "ensuite";
    default: return undefined;
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

export function applyRoomChanges(floorPlan: FloorPlan, changes: RoomChange[]): FloorPlan {
  const updated = structuredClone(floorPlan);

  for (const change of changes || []) {
    if (!change?.roomId) continue;

    for (const floor of updated.floors) {
      const room = floor.rooms.find(candidate => candidate.id === change.roomId);
      if (!room) continue;

      const inferredType = actionType(change.action);
      const requestedType = String(change.newType || inferredType || "").trim().toLowerCase();
      const action = String(change.action || "").toLowerCase();
      const normalisedAction = action.replace(/\s+/g, "");
      const isEnsuite = requestedType.includes("ensuite") || normalisedAction === "converttoensuite";
      const isNoChange = !requestedType && normalisedAction === "nochange";
      if (isNoChange) continue;

      const typeIsNoOp = requestedType.length > 0 && isNoOpTypeChange(room.type || "", requestedType);

      // For an ensuite conversion the target must be a service room (normally
      // an existing WC/shower/bathroom). We make the proposed geometry visibly
      // represent the upgraded room instead of merely adding a text note.
      if (isEnsuite && !typeIsNoOp) {
        room.type = "ensuite";
        room.name = change.newName || "En-suite";
        room.notes = [room.notes, "Proposed en-suite conversion"].filter(Boolean).join("; ");
      } else if (requestedType && !typeIsNoOp) {
        room.type = change.newType || inferredType!;
        if (change.newName) room.name = change.newName;
        else if (inferredType === "bedroom" && !/bedroom/i.test(room.name)) room.name = "Proposed Bedroom";
      }

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
