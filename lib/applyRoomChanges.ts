import { FloorPlan, Room, RoomChange, Point } from "@/lib/types/floorPlan";

function actionType(action?: string): string | undefined {
  switch ((action || "").toLowerCase().replace(/\s+/g, "")) {
    case "converttobedroom": return "bedroom";
    case "converttokitchen": return "kitchen";
    case "converttobathroom": return "bathroom";
    case "converttoensuite": return "ensuite";
    default: return undefined;
  }
}
function noOp(current: string, requested: string): boolean {
  const c = current.toLowerCase(), r = requested.toLowerCase();
  if (r === "bedroom") return c.includes("bedroom");
  if (r === "bathroom") return c.includes("bathroom") || c.includes("shower") || c.includes("ensuite");
  if (r === "kitchen") return c.includes("kitchen");
  if (r === "ensuite") return c.includes("ensuite");
  return c === r;
}
function clip(points: Point[] | undefined, axis: "x" | "y", threshold: number, greater: boolean): Point[] | undefined {
  if (!points || points.length < 3) return points;
  const inside = (p: Point) => greater ? p[axis] >= threshold : p[axis] <= threshold;
  const intersection = (a: Point, b: Point): Point => {
    const d = b[axis] - a[axis];
    const t = Math.abs(d) < 1e-9 ? 0 : (threshold - a[axis]) / d;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[(i - 1 + points.length) % points.length], b = points[i];
    const ai = inside(a), bi = inside(b);
    if (ai !== bi) out.push(intersection(a, b));
    if (bi) out.push(b);
  }
  return out.length >= 3 ? out : undefined;
}
function requestedRatio(change: RoomChange): number {
  const r = Number(change.split?.firstRatio);
  return Number.isFinite(r) ? Math.min(.82, Math.max(.65, r)) : .72;
}
function windowWalls(room: Room): string[] { return Array.from(new Set((room.windows || []).map(w => w.wall))); }
function directionFor(room: Room, requested?: "horizontal" | "vertical"): "horizontal" | "vertical" {
  const walls = windowWalls(room);
  if (walls.includes("top") || walls.includes("bottom")) return "horizontal";
  if (walls.includes("left") || walls.includes("right")) return "vertical";
  return requested || "horizontal";
}
function splitChild(source: Room, change: RoomChange, x: number, y: number, width: number, height: number, polygon?: Point[]): Room {
  const wet = /ensuite|bath|shower/i.test(String(change.split?.secondType || ""));
  return {
    ...structuredClone(source), id: `${source.id}-split-2`,
    name: change.split?.secondName || (wet ? "En-suite" : "Bedroom 2"), type: change.split?.secondType || "bedroom",
    x, y, width, height, polygon, windows: wet ? [] : structuredClone(source.windows || []), doors: [],
    adjacentRooms: [source.id], notes: [source.notes, `Created by split of ${source.id}`].filter(Boolean).join("; "), confidence: "geometry-proposed",
  };
}
function splitRoom(floor: any, room: Room, change: RoomChange): void {
  const wet = /ensuite|bath|shower/i.test(String(change.split?.secondType || ""));
  const walls = windowWalls(room);
  // A safe ensuite requires a known principal external opening wall. If the
  // source room has no opening data, or has windows on multiple walls, a simple
  // one-axis split cannot guarantee that the wet room will stay off the windows.
  // Refuse the transformation instead of generating a visually plausible but
  // invalid proposal.
  if (wet && (walls.length !== 1 || !room.polygon || room.polygon.length < 3)) return;

  const direction = wet ? directionFor(room, change.split?.direction) : (change.split?.direction || "vertical");
  const firstRatio = requestedRatio(change);
  const ox = room.x, oy = room.y, ow = room.width, oh = room.height;
  const originalPolygon = room.polygon ? structuredClone(room.polygon) : undefined;

  if (direction === "horizontal") {
    const firstH = Math.max(1, Math.round(oh * firstRatio)), secondH = oh - firstH;
    if (secondH <= 1) return;
    let bedroomY: number, ensuiteY: number, bedroomPoly: Point[] | undefined, secondPoly: Point[] | undefined;
    const splitY = oy + firstH;
    if (wet && walls[0] === "top") {
      bedroomY = oy; ensuiteY = oy + firstH;
      bedroomPoly = clip(originalPolygon, "y", splitY, false);
      secondPoly = clip(originalPolygon, "y", splitY, true);
    } else if (wet && walls[0] === "bottom") {
      bedroomY = oy + secondH; ensuiteY = oy;
      bedroomPoly = clip(originalPolygon, "y", oy + secondH, true);
      secondPoly = clip(originalPolygon, "y", oy + secondH, false);
    } else {
      bedroomY = oy; ensuiteY = oy + firstH;
      bedroomPoly = clip(originalPolygon, "y", splitY, false);
      secondPoly = clip(originalPolygon, "y", splitY, true);
    }
    if (!bedroomPoly || !secondPoly) return;
    room.y = bedroomY; room.height = firstH; room.polygon = bedroomPoly;
    floor.rooms.push(splitChild(room, change, ox, ensuiteY, ow, secondH, secondPoly));
  } else {
    const firstW = Math.max(1, Math.round(ow * firstRatio)), secondW = ow - firstW;
    if (secondW <= 1) return;
    let bedroomX: number, ensuiteX: number, bedroomPoly: Point[] | undefined, secondPoly: Point[] | undefined;
    const splitX = ox + firstW;
    if (wet && walls[0] === "left") {
      bedroomX = ox; ensuiteX = ox + firstW;
      bedroomPoly = clip(originalPolygon, "x", splitX, false);
      secondPoly = clip(originalPolygon, "x", splitX, true);
    } else if (wet && walls[0] === "right") {
      bedroomX = ox + secondW; ensuiteX = ox;
      bedroomPoly = clip(originalPolygon, "x", ox + secondW, true);
      secondPoly = clip(originalPolygon, "x", ox + secondW, false);
    } else {
      bedroomX = ox; ensuiteX = ox + firstW;
      bedroomPoly = clip(originalPolygon, "x", splitX, false);
      secondPoly = clip(originalPolygon, "x", splitX, true);
    }
    if (!bedroomPoly || !secondPoly) return;
    room.x = bedroomX; room.width = firstW; room.polygon = bedroomPoly;
    floor.rooms.push(splitChild(room, change, ensuiteX, oy, secondW, oh, secondPoly));
  }
  room.type = change.split?.firstType || "bedroom";
  room.name = change.split?.firstName || room.name || "Bedroom";
  room.notes = [room.notes, wet ? "Bedroom retains its known external opening wall; ensuite is a contained internal polygon split" : "First portion of proposed room split"].filter(Boolean).join("; ");
}
function addEnsuite(floor: any, room: Room, change: RoomChange): void {
  splitRoom(floor, room, { ...change, action: "SplitRoom", split: { firstName: room.name, firstType: "bedroom", secondName: change.newName || "En-suite", secondType: "ensuite", direction: change.split?.direction, firstRatio: change.split?.firstRatio ?? .72 } });
}

export function applyRoomChanges(floorPlan: FloorPlan, changes: RoomChange[]): FloorPlan {
  const updated = structuredClone(floorPlan);
  for (const change of changes || []) {
    if (!change?.roomId) continue;
    for (const floor of updated.floors) {
      const room = floor.rooms.find(r => r.id === change.roomId);
      if (!room) continue;
      const action = String(change.action || "").toLowerCase().replace(/\s+/g, ""), inferred = actionType(change.action);
      const requested = String(change.newType || inferred || "").trim().toLowerCase();
      if (action === "nochange" && !requested) continue;
      if (action === "splitroom" || action === "split") { splitRoom(floor, room, change); continue; }
      if (requested.includes("ensuite") || action === "converttoensuite") {
        if (String(room.type || "").toLowerCase().includes("bedroom")) addEnsuite(floor, room, change);
        continue;
      }
      if (requested && !noOp(room.type || "", requested)) {
        room.type = change.newType || inferred || room.type;
        if (change.newName) room.name = change.newName;
        else if (inferred === "bedroom" && !/bedroom/i.test(room.name)) room.name = "Proposed Bedroom";
      }
      if (change.action && /merge|extend|partition|doorway|opening/i.test(change.action)) room.notes = [room.notes, change.action].filter(Boolean).join("; ");
      if (change.reason && requested && !noOp(room.type || "", requested)) room.notes = [room.notes, change.reason].filter(Boolean).join("; ");
    }
  }
  return updated;
}
