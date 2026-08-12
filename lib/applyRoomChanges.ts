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

function splitRatio(change: RoomChange): number {
  const raw = Number(change.split?.firstRatio);
  if (!Number.isFinite(raw)) return 0.7;
  return Math.min(0.9, Math.max(0.1, raw));
}

function splitRoom(floor: any, room: Room, change: RoomChange): void {
  const direction = change.split?.direction || "vertical";
  const ratio = splitRatio(change);
  const originalWidth = room.width;
  const originalHeight = room.height;
  const secondType = String(change.split?.secondType || "bedroom").toLowerCase();
  const isEnsuiteSplit = secondType.includes("ensuite") || secondType.includes("bath") || secondType.includes("shower");
  const windowWalls = new Set((room.windows || []).map(window => window.wall));

  // For a bedroom + ensuite split, the bedroom must retain its external window wall.
  // This is deterministic: the AI chooses the split orientation/ratio, but the renderer
  // places the ensuite on the internal side rather than taking the window side.
  if (isEnsuiteSplit && direction === "horizontal") {
    const bedroomHeight = Math.max(1, Math.round(originalHeight * ratio));
    const ensuiteHeight = originalHeight - bedroomHeight;
    const bedroomAtBottom = windowWalls.has("bottom") && !windowWalls.has("top");
    const ensuiteAtTop = bedroomAtBottom || (!windowWalls.has("top") && windowWalls.has("bottom"));

    if (ensuiteAtTop) {
      room.y = room.y + ensuiteHeight;
      room.height = bedroomHeight;
      room.type = change.split?.firstType || "bedroom";
      room.name = change.split?.firstName || room.name || "Bedroom";
      floor.rooms.push(makeSplitRoom(room, change, room.x, room.y - ensuiteHeight, originalWidth, ensuiteHeight));
    } else {
      room.height = bedroomHeight;
      room.type = change.split?.firstType || "bedroom";
      room.name = change.split?.firstName || room.name || "Bedroom";
      floor.rooms.push(makeSplitRoom(room, change, room.x, room.y + bedroomHeight, originalWidth, ensuiteHeight));
    }
    room.notes = [room.notes, "Bedroom portion retains external window wall; ensuite placed internally"].filter(Boolean).join("; ");
    return;
  }

  if (isEnsuiteSplit && direction === "vertical") {
    const bedroomWidth = Math.max(1, Math.round(originalWidth * ratio));
    const ensuiteWidth = originalWidth - bedroomWidth;
    const bedroomAtRight = windowWalls.has("right") && !windowWalls.has("left");
    const ensuiteAtLeft = bedroomAtRight || (!windowWalls.has("left") && windowWalls.has("right"));

    if (ensuiteAtLeft) {
      room.x = room.x + ensuiteWidth;
      room.width = bedroomWidth;
      room.type = change.split?.firstType || "bedroom";
      room.name = change.split?.firstName || room.name || "Bedroom";
      floor.rooms.push(makeSplitRoom(room, change, room.x - ensuiteWidth, room.y, ensuiteWidth, originalHeight));
    } else {
      room.width = bedroomWidth;
      room.type = change.split?.firstType || "bedroom";
      room.name = change.split?.firstName || room.name || "Bedroom";
      floor.rooms.push(makeSplitRoom(room, change, room.x + bedroomWidth, room.y, ensuiteWidth, originalHeight));
    }
    room.notes = [room.notes, "Bedroom portion retains external window wall; ensuite placed internally"].filter(Boolean).join("; ");
    return;
  }

  if (direction === "horizontal") {
    const firstHeight = Math.max(1, Math.round(originalHeight * ratio));
    const secondHeight = originalHeight - firstHeight;
    room.height = firstHeight;
    room.name = change.split?.firstName || room.name || "Bedroom 1";
    room.type = change.split?.firstType || "bedroom";
    room.notes = [room.notes, "First portion of proposed room split"].filter(Boolean).join("; ");
    if (secondHeight > 1) floor.rooms.push(makeSplitRoom(room, change, room.x, room.y + firstHeight, originalWidth, secondHeight));
  } else {
    const firstWidth = Math.max(1, Math.round(originalWidth * ratio));
    const secondWidth = originalWidth - firstWidth;
    room.width = firstWidth;
    room.name = change.split?.firstName || room.name || "Bedroom 1";
    room.type = change.split?.firstType || "bedroom";
    room.notes = [room.notes, "First portion of proposed room split"].filter(Boolean).join("; ");
    if (secondWidth > 1) floor.rooms.push(makeSplitRoom(room, change, room.x + firstWidth, room.y, secondWidth, originalHeight));
  }
}

function addEnsuite(floor: any, room: Room, change: RoomChange): void {
  if (floor.rooms.some((candidate: Room) => candidate.id === `${room.id}-ensuite`)) return;
  const original = structuredClone(room);
  const preferred = original.windows?.[0]?.wall;
  const ratio = 0.28;
  let ensuite: Room;

  if (preferred === "bottom") {
    const h = Math.max(1, Math.round(original.height * ratio));
    room.height = original.height - h;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: original.y + room.height, height: h };
  } else if (preferred === "top") {
    const h = Math.max(1, Math.round(original.height * ratio));
    room.y = original.y + h;
    room.height = original.height - h;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", height: h };
  } else if (preferred === "right") {
    const w = Math.max(1, Math.round(original.width * ratio));
    room.width = original.width - w;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", x: original.x + room.width, width: w };
  } else {
    const w = Math.max(1, Math.round(original.width * ratio));
    room.x = original.x + w;
    room.width = original.width - w;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", width: w };
  }

  room.type = "bedroom";
  room.name = original.name;
  room.notes = [room.notes, "Bedroom retained with external window preserved; ensuite formed internally"].filter(Boolean).join("; ");
  room.adjacentRooms = Array.from(new Set([...(room.adjacentRooms || []), ensuite.id]));
  ensuite.adjacentRooms = Array.from(new Set([...(ensuite.adjacentRooms || []), room.id]));
  ensuite.notes = [original.notes, `Proposed ensuite for ${original.id}`, `Placed away from ${preferred || "external window"} wall`].filter(Boolean).join("; ");
  ensuite.confidence = "geometry-proposed";
  floor.rooms.push(ensuite);
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

      if (isEnsuite) {
        if (!String(room.type || "").toLowerCase().includes("bedroom")) continue;
        addEnsuite(floor, room, change);
      } else {
        const typeIsNoOp = requestedType.length > 0 && isNoOpTypeChange(room.type || "", requestedType);
        if (requestedType && !typeIsNoOp) {
          room.type = change.newType || inferredType!;
          if (change.newName) room.name = change.newName;
          else if (inferredType === "bedroom" && !/bedroom/i.test(room.name)) room.name = "Proposed Bedroom";
        }
        if (change.action && /merge|extend|partition|doorway|opening/i.test(change.action)) room.notes = [room.notes, change.action].filter(Boolean).join("; ");
        if (change.reason && !typeIsNoOp) room.notes = [room.notes, change.reason].filter(Boolean).join("; ");
      }
    }
  }
  return updated;
}
