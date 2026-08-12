import { FloorPlan, Room, RoomChange, Point, WallSide } from "@/lib/types/floorPlan";

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
function clipRect(points: Point[] | undefined, minX?: number, maxX?: number, minY?: number, maxY?: number): Point[] | undefined {
  let result = points;
  if (minX !== undefined) result = clip(result, "x", minX, true);
  if (maxX !== undefined) result = clip(result, "x", maxX, false);
  if (minY !== undefined) result = clip(result, "y", minY, true);
  if (maxY !== undefined) result = clip(result, "y", maxY, false);
  return result;
}
function requestedRatio(change: RoomChange): number {
  const r = Number(change.split?.firstRatio);
  return Number.isFinite(r) ? Math.min(.82, Math.max(.65, r)) : .72;
}
function windowWalls(room: Room): WallSide[] { return Array.from(new Set((room.windows || []).map(w => w.wall))); }
function doorWalls(room: Room): WallSide[] { return Array.from(new Set((room.doors || []).map(d => d.wall))); }
function splitChild(source: Room, change: RoomChange, x: number, y: number, width: number, height: number, polygon?: Point[]): Room {
  const wet = /ensuite|bath|shower/i.test(String(change.split?.secondType || ""));
  return {
    ...structuredClone(source), id: `${source.id}-split-2`,
    name: change.split?.secondName || (wet ? "En-suite" : "Bedroom 2"), type: change.split?.secondType || "bedroom",
    x, y, width, height, polygon, windows: wet ? [] : structuredClone(source.windows || []), doors: [],
    adjacentRooms: [source.id], notes: [source.notes, `Created by split of ${source.id}`].filter(Boolean).join("; "), confidence: "geometry-proposed",
  };
}
function ensuiteCorner(room: Room): { sideX: "left" | "right"; sideY: "top" | "bottom" } | undefined {
  const windows = windowWalls(room), doors = doorWalls(room);
  if (windows.length >= 1) {
    const window = windows[0];
    if (window === "bottom") return { sideX: doors.includes("left") ? "right" : "left", sideY: "top" };
    if (window === "top") return { sideX: doors.includes("left") ? "right" : "left", sideY: "bottom" };
    if (window === "left") return { sideX: "right", sideY: doors.includes("top") ? "bottom" : "top" };
    if (window === "right") return { sideX: "left", sideY: doors.includes("top") ? "bottom" : "top" };
  }
  if (doors.includes("left")) return { sideX: "right", sideY: doors.includes("top") ? "bottom" : "top" };
  if (doors.includes("right")) return { sideX: "left", sideY: doors.includes("top") ? "bottom" : "top" };
  if (doors.includes("top")) return { sideX: "right", sideY: "bottom" };
  if (doors.includes("bottom")) return { sideX: "right", sideY: "top" };
  return { sideX: "right", sideY: "top" };
}
function splitEnsuiteCorner(floor: any, room: Room, change: RoomChange): boolean {
  const corner = ensuiteCorner(room);
  if (!corner || !room.polygon || room.polygon.length < 3) return false;

  // Work from the actual detected room polygon, not from a four-corner-room
  // assumption. Real plans often contain bay/alcove/doorway geometry.
  // The ensuite rectangle is clipped against that polygon, so it can never
  // extend outside the bedroom or across an external wall/window.
  const ensuiteWidth = Math.min(room.width * 0.30, Math.max(90, room.width * 0.32));
  const ensuiteHeight = Math.min(room.height * 0.25, Math.max(70, room.height * 0.27));
  const minX = corner.sideX === "right" ? room.x + room.width - ensuiteWidth : room.x;
  const maxX = corner.sideX === "right" ? room.x + room.width : room.x + ensuiteWidth;
  const minY = corner.sideY === "bottom" ? room.y + room.height - ensuiteHeight : room.y;
  const maxY = corner.sideY === "bottom" ? room.y + room.height : room.y + ensuiteHeight;
  const ensuitePoly = clipRect(structuredClone(room.polygon), minX, maxX, minY, maxY);
  if (!ensuitePoly || ensuitePoly.length < 3) return false;

  const childX = Math.min(...ensuitePoly.map(p => p.x)), childY = Math.min(...ensuitePoly.map(p => p.y));
  const childW = Math.max(...ensuitePoly.map(p => p.x)) - childX, childH = Math.max(...ensuitePoly.map(p => p.y)) - childY;
  if (childW <= 10 || childH <= 10) return false;

  // Keep the original bedroom polygon intact. The renderer draws the new
  // ensuite as a contained sub-polygon over it; this avoids corrupting the
  // bedroom's measured boundary when the source room is not a perfect rectangle.
  const bedroom = structuredClone(room);
  bedroom.notes = [bedroom.notes, "Bedroom retained at measured boundary; compact internal ensuite contained inside room polygon"].filter(Boolean).join("; ");
  room.notes = bedroom.notes;

  const child = splitChild(bedroom, change, childX, childY, childW, childH, ensuitePoly);
  const windowNote = windowWalls(room)[0];
  child.notes = [child.notes, windowNote ? `Placed in internal corner away from ${windowNote} window wall` : "Placed in internal corner of detected room polygon"].filter(Boolean).join("; ");
  floor.rooms.push(child);
  return true;
}
function splitRoom(floor: any, room: Room, change: RoomChange): void {
  const wet = /ensuite|bath|shower/i.test(String(change.split?.secondType || ""));
  if (wet) { if (splitEnsuiteCorner(floor, room, change)) return; return; }
  if (!room.polygon || room.polygon.length < 3) return;
  const walls = windowWalls(room), direction = change.split?.direction || (walls.includes("top") || walls.includes("bottom") ? "horizontal" : "vertical"), firstRatio = requestedRatio(change);
  const ox=room.x, oy=room.y, ow=room.width, oh=room.height, originalPolygon=structuredClone(room.polygon);
  if (direction === "horizontal") {
    const firstH=Math.max(1,Math.round(oh*firstRatio)), secondH=oh-firstH; if(secondH<=1)return; const splitY=oy+firstH;
    const bedroomPoly=walls[0]==="bottom"?clip(originalPolygon,"y",oy+secondH,true):clip(originalPolygon,"y",splitY,false);
    const secondPoly=walls[0]==="bottom"?clip(originalPolygon,"y",oy+secondH,false):clip(originalPolygon,"y",splitY,true); if(!bedroomPoly||!secondPoly)return;
    room.y=walls[0]==="bottom"?oy+secondH:oy; room.height=firstH; room.polygon=bedroomPoly; floor.rooms.push(splitChild(room,change,ox,walls[0]==="bottom"?oy:oy+firstH,ow,secondH,secondPoly));
  } else {
    const firstW=Math.max(1,Math.round(ow*firstRatio)), secondW=ow-firstW; if(secondW<=1)return; const splitX=ox+firstW;
    const bedroomPoly=walls[0]==="right"?clip(originalPolygon,"x",ox+secondW,true):clip(originalPolygon,"x",splitX,false);
    const secondPoly=walls[0]==="right"?clip(originalPolygon,"x",ox+secondW,false):clip(originalPolygon,"x",splitX,true); if(!bedroomPoly||!secondPoly)return;
    room.x=walls[0]==="right"?ox+secondW:ox; room.width=firstW; room.polygon=bedroomPoly; floor.rooms.push(splitChild(room,change,walls[0]==="right"?ox:ox+firstW,oy,secondW,oh,secondPoly));
  }
  room.type=change.split?.firstType||"bedroom"; room.name=change.split?.firstName||room.name||"Bedroom"; room.notes=[room.notes,"First portion of proposed room split"].filter(Boolean).join("; ");
}
function addEnsuite(floor:any,room:Room,change:RoomChange):void { splitRoom(floor,room,{...change,action:"SplitRoom",split:{firstName:room.name,firstType:"bedroom",secondName:change.newName||"En-suite",secondType:"ensuite",direction:change.split?.direction,firstRatio:change.split?.firstRatio??.72}}); }
export function applyRoomChanges(floorPlan:FloorPlan,changes:RoomChange[]):FloorPlan {
  const updated=structuredClone(floorPlan);
  for(const change of changes||[]){if(!change?.roomId)continue;for(const floor of updated.floors){const room=floor.rooms.find(r=>r.id===change.roomId);if(!room)continue;const action=String(change.action||"").toLowerCase().replace(/\s+/g,""),inferred=actionType(change.action),requested=String(change.newType||inferred||"").trim().toLowerCase();if(action==="nochange"&&!requested)continue;if(action==="splitroom"||action==="split"){splitRoom(floor,room,change);continue;}if(requested.includes("ensuite")||action==="converttoensuite"){if(String(room.type||"").toLowerCase().includes("bedroom"))addEnsuite(floor,room,change);continue;}if(requested&&!noOp(room.type||"",requested)){room.type=change.newType||inferred||room.type;if(change.newName)room.name=change.newName;else if(inferred==="bedroom"&&!/bedroom/i.test(room.name))room.name="Proposed Bedroom";}if(change.action&&/merge|extend|partition|doorway|opening/i.test(change.action))room.notes=[room.notes,change.action].filter(Boolean).join("; ");if(change.reason&&requested&&!noOp(room.type||"",requested))room.notes=[room.notes,change.reason].filter(Boolean).join("; ");}}return updated;
}
