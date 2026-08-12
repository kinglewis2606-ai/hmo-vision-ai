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

type Point = { x: number; y: number };

function clipPolygon(points: Point[] | undefined, axis: "x" | "y", threshold: number, keepGreater: boolean): Point[] | undefined {
  if (!points || points.length < 3) return points;
  const inside = (p: Point) => keepGreater ? p[axis] >= threshold : p[axis] <= threshold;
  const intersect = (a: Point, b: Point): Point => {
    const da = b[axis] - a[axis];
    const ratio = Math.abs(da) < 1e-9 ? 0 : (threshold - a[axis]) / da;
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
  };
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const previous = points[(i - 1 + points.length) % points.length];
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) result.push(intersect(previous, current));
    if (currentInside) result.push(current);
  }
  return result.length >= 3 ? result : undefined;
}

function preferredEnsuiteDirection(room: Room, requested?: "horizontal" | "vertical"): "horizontal" | "vertical" {
  const walls = new Set((room.windows || []).map(window => window.wall));
  if (walls.has("top") || walls.has("bottom")) return "horizontal";
  if (walls.has("left") || walls.has("right")) return "vertical";
  // Without reliable opening metadata, prefer a horizontal internal split. This
  // keeps the proposal away from the common front/rear window wall on UK rooms.
  return requested || "horizontal";
}

function splitRatio(change: RoomChange): number {
  const raw = Number(change.split?.firstRatio);
  if (!Number.isFinite(raw)) return 0.72;
  return Math.min(0.82, Math.max(0.65, raw));
}

function makeSplitRoom(source: Room, change: RoomChange, secondX: number, secondY: number, secondWidth: number, secondHeight: number, polygon?: Point[]): Room {
  const isEnsuite = /ensuite|bath|shower/i.test(String(change.split?.secondType || ""));
  return {
    ...structuredClone(source),
    id: `${source.id}-split-2`,
    name: change.split?.secondName || (isEnsuite ? "En-suite" : "Bedroom 2"),
    type: change.split?.secondType || "bedroom",
    x: secondX,
    y: secondY,
    width: secondWidth,
    height: secondHeight,
    polygon,
    windows: isEnsuite ? [] : structuredClone(source.windows || []),
    doors: [],
    adjacentRooms: [source.id],
    notes: [source.notes, `Created by split of ${source.id}`].filter(Boolean).join("; "),
  };
}

function splitRoom(floor: any, room: Room, change: RoomChange): void {
  const secondType = String(change.split?.secondType || "").toLowerCase();
  const isEnsuiteSplit = secondType.includes("ensuite") || secondType.includes("bath") || secondType.includes("shower");
  const direction = isEnsuiteSplit ? preferredEnsuiteDirection(room, change.split?.direction) : (change.split?.direction || "vertical");
  const ratio = splitRatio(change);
  const originalWidth = room.width;
  const originalHeight = room.height;
  const originalPolygon = room.polygon ? structuredClone(room.polygon) : undefined;
  const windowWalls = new Set((room.windows || []).map(window => window.wall));

  if (isEnsuiteSplit && direction === "horizontal") {
    const bedroomHeight = Math.max(1, Math.round(originalHeight * ratio));
    const ensuiteHeight = originalHeight - bedroomHeight;
    if (ensuiteHeight <= 1 || bedroomHeight <= 1) return;
    const splitY = room.y + bedroomHeight;
    const keepBottom = windowWalls.has("bottom") && !windowWalls.has("top");
    const keepTop = windowWalls.has("top") && !windowWalls.has("bottom");

    let bedroomPolygon: Point[] | undefined;
    let ensuitePolygon: Point[] | undefined;
    if (keepBottom) {
      bedroomPolygon = clipPolygon(originalPolygon, "y", splitY, true);
      ensuitePolygon = clipPolygon(originalPolygon, "y", splitY, false);
      room.y = room.y + ensuiteHeight;
      room.height = bedroomHeight;
    } else if (keepTop) {
      bedroomPolygon = clipPolygon(originalPolygon, "y", splitY, false);
      ensuitePolygon = clipPolygon(originalPolygon, "y", splitY, true);
      room.height = bedroomHeight;
    } else {
      // Default: bedroom occupies the lower/window-facing portion and ensuite
      // occupies the upper/internal portion.
      room.y = room.y + ensuiteHeight;
      room.height = bedroomHeight;
      bedroomPolygon = clipPolygon(originalPolygon, "y", splitY, true);
      ensuitePolygon = clipPolygon(originalPolygon, "y", splitY, false);
    }
    room.polygon = bedroomPolygon || room.polygon;
    const secondY = keepTop ? room.y + bedroomHeight : room.y - ensuiteHeight;
    floor.rooms.push(makeSplitRoom(room, change, room.x, secondY, originalWidth, ensuiteHeight, ensuitePolygon));
    room.type = change.split?.firstType || "bedroom";
    room.name = change.split?.firstName || room.name || "Bedroom";
    room.notes = [room.notes, "Bedroom portion retains external window wall; ensuite formed at internal end"].filter(Boolean).join("; ");
    return;
  }

  if (isEnsuiteSplit && direction === "vertical") {
    const bedroomWidth = Math.max(1, Math.round(originalWidth * ratio));
    const ensuiteWidth = originalWidth - bedroomWidth;
    if (ensuiteWidth <= 1 || bedroomWidth <= 1) return;
    const splitX = room.x + bedroomWidth;
    const keepRight = windowWalls.has("right") && !windowWalls.has("left");
    const keepLeft = windowWalls.has("left") && !windowWalls.has("right");
    let bedroomPolygon: Point[] | undefined;
    let ensuitePolygon: Point[] | undefined;

    if (keepRight) {
      bedroomPolygon = clipPolygon(originalPolygon, "x", splitX, true);
      ensuitePolygon = clipPolygon(originalPolygon, "x", splitX, false);
      room.x = room.x + ensuiteWidth;
      room.width = bedroomWidth;
    } else if (keepLeft) {
      bedroomPolygon = clipPolygon(originalPolygon, "x", splitX, false);
      ensuitePolygon = clipPolygon(originalPolygon, "x", splitX, true);
      room.width = bedroomWidth;
    } else {
      room.x = room.x + ensuiteWidth;
      room.width = bedroomWidth;
      bedroomPolygon = clipPolygon(originalPolygon, "x", splitX, true);
      ensuitePolygon = clipPolygon(originalPolygon, "x", splitX, false);
    }
    room.polygon = bedroomPolygon || room.polygon;
    const ensuiteX = keepRight ? room.x - ensuiteWidth : room.x + bedroomWidth;
    floor.rooms.push(makeSplitRoom(room, change, ensuiteX, room.y, ensuiteWidth, originalHeight, ensuitePolygon));
    room.type = change.split?.firstType || "bedroom";
    room.name = change.split?.firstName || room.name || "Bedroom";
    room.notes = [room.notes, "Bedroom portion retains external window wall; ensuite formed at internal end"].filter(Boolean).join("; ");
    return;
  }

  if (direction === "horizontal") {
    const firstHeight = Math.max(1, Math.round(originalHeight * ratio));
    const secondHeight = originalHeight - firstHeight;
    const splitY = room.y + firstHeight;
    room.height = firstHeight;
    room.polygon = clipPolygon(originalPolygon, "y", splitY, false) || room.polygon;
    room.name = change.split?.firstName || room.name || "Bedroom 1";
    room.type = change.split?.firstType || "bedroom";
    room.notes = [room.notes, "First portion of proposed room split"].filter(Boolean).join("; ");
    if (secondHeight > 1) floor.rooms.push(makeSplitRoom(room, change, room.x, room.y + firstHeight, originalWidth, secondHeight, clipPolygon(originalPolygon, "y", splitY, true)));
  } else {
    const firstWidth = Math.max(1, Math.round(originalWidth * ratio));
    const secondWidth = originalWidth - firstWidth;
    const splitX = room.x + firstWidth;
    room.width = firstWidth;
    room.polygon = clipPolygon(originalPolygon, "x", splitX, false) || room.polygon;
    room.name = change.split?.firstName || room.name || "Bedroom 1";
    room.type = change.split?.firstType || "bedroom";
    room.notes = [room.notes, "First portion of proposed room split"].filter(Boolean).join("; ");
    if (secondWidth > 1) floor.rooms.push(makeSplitRoom(room, change, room.x + firstWidth, room.y, secondWidth, originalHeight, clipPolygon(originalPolygon, "x", splitX, true)));
  }
}

function addEnsuite(floor: any, room: Room, change: RoomChange): void {
  if (floor.rooms.some((candidate: Room) => candidate.id === `${room.id}-ensuite`)) return;
  const original = structuredClone(room);
  const originalPolygon = original.polygon ? structuredClone(original.polygon) : undefined;
  const windowWalls = new Set((original.windows || []).map(window => window.wall));
  const ratio = 0.28;
  let ensuite: Room;
  const direction = preferredEnsuiteDirection(original, "horizontal");

  if (direction === "horizontal") {
    const h = Math.max(1, Math.round(original.height * ratio));
    const keepBottom = windowWalls.has("bottom") && !windowWalls.has("top");
    const keepTop = windowWalls.has("top") && !windowWalls.has("bottom");
    const splitY = keepBottom ? original.y + original.height - h : original.y + h;
    if (keepBottom) {
      room.y = original.y;
      room.height = original.height - h;
      room.polygon = clipPolygon(originalPolygon, "y", splitY, false) || room.polygon;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: splitY, height: h, polygon: clipPolygon(originalPolygon, "y", splitY, true), windows: [], doors: [] };
    } else {
      room.y = splitY;
      room.height = original.height - h;
      room.polygon = clipPolygon(originalPolygon, "y", splitY, true) || room.polygon;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", y: original.y, height: h, polygon: clipPolygon(originalPolygon, "y", splitY, false), windows: [], doors: [] };
      if (keepTop) {
        room.y = original.y + h;
        room.height = original.height - h;
      }
    }
  } else {
    const w = Math.max(1, Math.round(original.width * ratio));
    const keepRight = windowWalls.has("right") && !windowWalls.has("left");
    const splitX = keepRight ? original.x + original.width - w : original.x + w;
    if (keepRight) {
      room.x = original.x;
      room.width = original.width - w;
      room.polygon = clipPolygon(originalPolygon, "x", splitX, false) || room.polygon;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", x: splitX, width: w, polygon: clipPolygon(originalPolygon, "x", splitX, true), windows: [], doors: [] };
    } else {
      room.x = splitX;
      room.width = original.width - w;
      room.polygon = clipPolygon(originalPolygon, "x", splitX, true) || room.polygon;
      ensuite = { ...original, id: `${original.id}-ensuite`, name: change.newName || "En-suite", type: "ensuite", x: original.x, width: w, polygon: clipPolygon(originalPolygon, "x", splitX, false), windows: [], doors: [] };
    }
  }

  room.type = "bedroom";
  room.name = original.name;
  room.notes = [room.notes, "Bedroom retained with external window preserved; ensuite formed internally"].filter(Boolean).join("; ");
  room.adjacentRooms = Array.from(new Set([...(room.adjacentRooms || []), ensuite.id]));
  ensuite.adjacentRooms = Array.from(new Set([...(ensuite.adjacentRooms || []), room.id]));
  ensuite.notes = [original.notes, `Proposed ensuite for ${original.id}`, "Placed at the internal end away from the bedroom window"].filter(Boolean).join("; ");
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
