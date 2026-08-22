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
    windows: [],
    adjacentRooms: [source.id],
    notes: [source.notes, `Created by split of ${source.id}`].filter(Boolean).join("; "),
  };
}

function splitRatio(change: RoomChange): number {
  const raw = Number(change.split?.firstRatio);
  if (!Number.isFinite(raw)) return 0.7;
  return Math.min(0.9, Math.max(0.1, raw));
}

function safeEnsuiteDirection(room: Room, requestedDirection: "horizontal" | "vertical"): "horizontal" | "vertical" {
  const doorWalls = new Set((room.doors || []).map(door => door.wall));
  const hasHorizontalDoorWall = doorWalls.has("top") || doorWalls.has("bottom");
  const hasVerticalDoorWall = doorWalls.has("left") || doorWalls.has("right");

  // A horizontal partition runs through the top/bottom walls. If the bedroom
  // entrance is on one of those walls, that partition can block the doorway.
  // Force a vertical partition instead. Conversely, left/right entrances need
  // a horizontal partition.
  if (hasHorizontalDoorWall && !hasVerticalDoorWall) return "vertical";
  if (hasVerticalDoorWall && !hasHorizontalDoorWall) return "horizontal";
  return requestedDirection;
}

function splitRoom(floor: any, room: Room, change: RoomChange): void {
  const requestedDirection = change.split?.direction || "vertical";
  const ratio = splitRatio(change);
  const originalWidth = room.width;
  const originalHeight = room.height;
  const secondType = String(change.split?.secondType || "bedroom").toLowerCase();
  const isEnsuiteSplit = secondType.includes("ensuite") || secondType.includes("bath") || secondType.includes("shower");
  const direction = isEnsuiteSplit ? safeEnsuiteDirection(room, requestedDirection) : requestedDirection;
  const windowWalls = new Set((room.windows || []).map(window => window.wall));

  if (isEnsuiteSplit && direction === "horizontal") {
    const bedroomHeight = Math.max(1, Math.round(originalHeight * ratio));
    const ensuiteHeight = originalHeight - bedroomHeight;
    const bedroomKeepsBottom = windowWalls.has("bottom") && !windowWalls.has("top");
    const bedroomKeepsTop = windowWalls.has("top") && !windowWalls.has("bottom");

    if (bedroomKeepsBottom) {
      room.y = room.y + ensuiteHeight;
      room.height = bedroomHeight;
      floor.rooms.push(makeSplitRoom(room, change, room.x, room.y - ensuiteHeight, originalWidth, ensuiteHeight));
    } else if (bedroomKeepsTop) {
      room.height = bedroomHeight;
      floor.rooms.push(makeSplitRoom(room, change, room.x, room.y + bedroomHeight, originalWidth, ensuiteHeight));
    } else {
      room.y = room.y + ensuiteHeight;
      room.height = bedroomHeight;
      floor.rooms.push(makeSplitRoom(room, change, room.x, room.y - ensuiteHeight, originalWidth, ensuiteHeight));
    }

    room.type = change.split?.firstType || "bedroom";
    room.name = change.split?.firstName || room.name || "Bedroom";
    room.notes = [room.notes, "Bedroom portion retains external window wall; ensuite placed internally; entrance wall preserved"].filter(Boolean).join("; ");
    return;
  }

  if (isEnsuiteSplit && direction === "vertical") {
    const bedroomWidth = Math.max(1, Math.round(originalWidth * ratio));
    const ensuiteWidth = originalWidth - bedroomWidth;
    const bedroomKeepsRight = windowWalls.has("right") && !windowWalls.has("left");
    const bedroomKeepsLeft = windowWalls.has("left") && !windowWalls.has("right");

    if (bedroomKeepsRight) {
      room.x = room.x + ensuiteWidth;
      room.width = bedroomWidth;
      floor.rooms.push(makeSplitRoom(room, change, room.x - ensuiteWidth, room.y, ensuiteWidth, originalHeight));
    } else if (bedroomKeepsLeft) {
      room.width = bedroomWidth;
      floor.rooms.push(makeSplitRoom(room, change, room.x + bedroomWidth, room.y, ensuiteWidth, originalHeight));
    } else {
      room.width = bedroomWidth;
      floor.rooms.push(makeSplitRoom(room, change, room.x + bedroomWidth, room.y, ensuiteWidth, originalHeight));
    }

    room.type = change.split?.firstType || "bedroom";
    room.name = change.split?.firstName || room.name || "Bedroom";
    room.notes = [room.notes, "Bedroom portion retains external window wall; ensuite placed internally; entrance wall preserved"].filter(Boolean).join("; ");
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
  const windowWalls = new Set((original.windows || []).map(window => window.wall));
  const doorWalls = new Set((original.doors || []).map(door => door.wall));
  const ratio = 0.28;
  let ensuite: Room;

  // Keep the existing entrance wall with the bedroom. Prefer an internal end
  // perpendicular to that wall rather than placing a new partition through it.
  const keepVerticalDoorWall = doorWalls.has("left") || doorWalls.has("right");
  const keepHorizontalDoorWall = doorWalls.has("top") || doorWalls.has("bottom");

  if (keepHorizontalDoorWall && !keepVerticalDoorWall) {
    const h = Math.max(1, Math.round(original.height * ratio));
    const bedroomKeepsBottom = windowWalls.has("bottom") && !windowWalls.has("top");
    if (bedroomKeepsBottom) {
      room.y = original.y;
      room.height = original.height - h;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: original.y + room.height, height: h, windows: [] };
    } else {
      room.y = original.y + h;
      room.height = original.height - h;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: original.y, height: h, windows: [] };
    }
  } else if (keepVerticalDoorWall && !keepHorizontalDoorWall) {
    const w = Math.max(1, Math.round(original.width * ratio));
    const bedroomKeepsRight = windowWalls.has("right") && !windowWalls.has("left");
    if (bedroomKeepsRight) {
      room.x = original.x + w;
      room.width = original.width - w;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", x: original.x, width: w, windows: [] };
    } else {
      room.x = original.x;
      room.width = original.width - w;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", x: original.x + room.width, width: w, windows: [] };
    }
  } else if (windowWalls.has("bottom") && !windowWalls.has("top")) {
    const h = Math.max(1, Math.round(original.height * ratio));
    room.y = original.y;
    room.height = original.height - h;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: original.y + room.height, height: h, windows: [] };
  } else if (windowWalls.has("top") && !windowWalls.has("bottom")) {
    const h = Math.max(1, Math.round(original.height * ratio));
    room.y = original.y + h;
    room.height = original.height - h;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: original.y, height: h, windows: [] };
  } else if (windowWalls.has("right") && !windowWalls.has("left")) {
    const w = Math.max(1, Math.round(original.width * ratio));
    room.x = original.x;
    room.width = original.width - w;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", x: original.x + room.width, width: w, windows: [] };
  } else if (windowWalls.has("left") && !windowWalls.has("right")) {
    const w = Math.max(1, Math.round(original.width * ratio));
    room.x = original.x + w;
    room.width = original.width - w;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", x: original.x, width: w, windows: [] };
  } else {
    const h = Math.max(1, Math.round(original.height * ratio));
    room.y = original.y + h;
    room.height = original.height - h;
    ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: original.y, height: h, windows: [] };
  }

  room.type = "bedroom";
  room.name = original.name;
  room.notes = [room.notes, "Bedroom retained with external window preserved; ensuite formed internally without blocking the entrance wall"].filter(Boolean).join("; ");
  room.adjacentRooms = Array.from(new Set([...(room.adjacentRooms || []), ensuite.id]));
  ensuite.adjacentRooms = Array.from(new Set([...(ensuite.adjacentRooms || []), room.id]));
  ensuite.notes = [original.notes, `Proposed ensuite for ${original.id}`, "Placed on internal side away from bedroom window and entrance wall"].filter(Boolean).join("; ");
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
      if (isSplit) { splitRoom(floor, room, change); continue; }
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
