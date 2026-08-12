import { FloorPlan, RoomChange, Room } from "@/lib/types/floorPlan";

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

function makeSplitRoom(source: Room, change: RoomChange, secondX: number, secondY: number, secondWidth: number, secondHeight: number): Room {
  return {
    ...structuredClone(source),
    id: `${source.id}-split-2`,
    name: change.split?.secondName || "Bedroom 2",
    type: change.split?.secondType || "bedroom",
    x: secondX,
    y: secondY,
    width: secondWidth,
    height: secondHeight,
    adjacentRooms: [source.id],
    notes: [source.notes, `Created by split of ${source.id}`].filter(Boolean).join("; "),
  };
}

function splitRoom(floor: any, room: Room, change: RoomChange): void {
  const direction = change.split?.direction || "vertical";
  const originalWidth = room.width;
  const originalHeight = room.height;

  if (direction === "horizontal") {
    const firstHeight = Math.max(1, Math.floor(originalHeight / 2));
    const secondHeight = originalHeight - firstHeight;
    room.height = firstHeight;
    room.name = change.split?.firstName || room.name || "Bedroom 1";
    room.type = change.split?.firstType || "bedroom";
    room.notes = [room.notes, "First half of proposed room split"].filter(Boolean).join("; ");

    if (secondHeight > 1) {
      floor.rooms.push(makeSplitRoom(room, change, room.x, room.y + firstHeight, originalWidth, secondHeight));
    }
  } else {
    const firstWidth = Math.max(1, Math.floor(originalWidth / 2));
    const secondWidth = originalWidth - firstWidth;
    room.width = firstWidth;
    room.name = change.split?.firstName || room.name || "Bedroom 1";
    room.type = change.split?.firstType || "bedroom";
    room.notes = [room.notes, "First half of proposed room split"].filter(Boolean).join("; ");

    if (secondWidth > 1) {
      floor.rooms.push(makeSplitRoom(room, change, room.x + firstWidth, room.y, secondWidth, originalHeight));
    }
  }
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
      const isSplit = normalisedAction === "splitroom" || normalisedAction === "split";
      const isNoChange = !requestedType && normalisedAction === "nochange";
      if (isNoChange) continue;

      if (isSplit) {
        splitRoom(floor, room, change);
        continue;
      }

      const typeIsNoOp = requestedType.length > 0 && isNoOpTypeChange(room.type || "", requestedType);

      if (isEnsuite && !typeIsNoOp) {
        room.type = "ensuite";
        room.name = change.newName || "En-suite";
        room.notes = [room.notes, "Proposed en-suite conversion"].filter(Boolean).join("; ");
      } else if (requestedType && !typeIsNoOp) {
        room.type = change.newType || inferredType!;
        if (change.newName) room.name = change.newName;
        else if (inferredType === "bedroom" && !/bedroom/i.test(room.name)) room.name = "Proposed Bedroom";
      }

      if (change.action && /merge|extend|partition|doorway|opening/i.test(change.action)) {
        room.notes = [room.notes, change.action].filter(Boolean).join("; ");
      }
      if (change.reason && !typeIsNoOp) {
        room.notes = [room.notes, change.reason].filter(Boolean).join("; ");
      }
    }
  }

  return updated;
}
