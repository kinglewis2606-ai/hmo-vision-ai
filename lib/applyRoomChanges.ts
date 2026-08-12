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
function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
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

/**
 * Pick the genuinely internal corner, rather than simply picking the corner
 * opposite the first detected window.  The detector represents exterior walls
 * as possible window walls, so ALL such walls must be treated as unavailable
 * for the wet-room.  If two internal corners exist, prefer the one furthest
 * from the detected door wall.
 */
function bestInternalCorner(room: Room): { sideX: "left" | "right"; sideY: "top" | "bottom" } | undefined {
  const windows = new Set(windowWalls(room));
  const doors = new Set(doorWalls(room));
  const corners: Array<{ sideX: "left" | "right"; sideY: "top" | "bottom" }> = [
    { sideX: "left", sideY: "top" }, { sideX: "right", sideY: "top" },
    { sideX: "left", sideY: "bottom" }, { sideX: "right", sideY: "bottom" },
  ];
  const score = (c: { sideX: "left" | "right"; sideY: "top" | "bottom" }) => {
    const wallX: WallSide = c.sideX, wallY: WallSide = c.sideY;
    if (windows.has(wallX) || windows.has(wallY)) return -1000;
    let value = 100;
    if (doors.has(wallX)) value -= 50;
    if (doors.has(wallY)) value -= 50;
    return value;
  };
  return corners.sort((a, b) => score(b) - score(a))[0];
}

function validPolygon(poly: Point[] | undefined): poly is Point[] {
  return !!poly && poly.length >= 3 && polygonArea(poly) > 100;
}

function splitEnsuiteCorner(floor: any, room: Room, change: RoomChange): boolean {
  if (!room.polygon || room.polygon.length < 3) return false;

  const corner = bestInternalCorner(room);
  if (!corner) return false;

  // Compact but usable proportion.  The bedroom retains roughly 70–75% of
  // its original footprint.  Never use the old "make a large rectangle" rule.
  const ensuiteWidth = Math.max(80, Math.min(room.width * 0.28, 150));
  const ensuiteHeight = Math.max(70, Math.min(room.height * 0.24, 135));
  const minX = corner.sideX === "right" ? room.x + room.width - ensuiteWidth : room.x;
  const maxX = corner.sideX === "right" ? room.x + room.width : room.x + ensuiteWidth;
  const minY = corner.sideY === "bottom" ? room.y + room.height - ensuiteHeight : room.y;
  const maxY = corner.sideY === "bottom" ? room.y + room.height : room.y + ensuiteHeight;

  // First choice: exact polygon clipping. This guarantees the proposed wet
  // room is contained by the detected room boundary, even for an irregular
  // room/bay shape.
  let ensuitePoly = clipRect(structuredClone(room.polygon), minX, maxX, minY, maxY);

  // Some scanned plans produce a polygon with tiny gaps after rasterisation.
  // Do not throw the whole proposal away in that case. Use a conservative
  // inset rectangle only when its four corners are actually inside the room.
  if (!validPolygon(ensuitePoly)) {
    const inside = (p: Point) => {
      let hit = false;
      const pts = room.polygon!;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) hit = !hit;
      }
      return hit;
    };
    const inset = 8;
    const candidate: Point[] = [
      { x: minX + inset, y: minY + inset },
      { x: maxX - inset, y: minY + inset },
      { x: maxX - inset, y: maxY - inset },
      { x: minX + inset, y: maxY - inset },
    ];
    if (candidate.every(inside)) ensuitePoly = candidate;
  }

  if (!validPolygon(ensuitePoly)) return false;

  const childX = Math.min(...ensuitePoly.map(p => p.x)), childY = Math.min(...ensuitePoly.map(p => p.y));
  const childW = Math.max(...ensuitePoly.map(p => p.x)) - childX, childH = Math.max(...ensuitePoly.map(p => p.y)) - childY;
  if (childW < 70 || childH < 60) return false;

  const bedroomArea = polygonArea(room.polygon);
  const ensuiteArea = polygonArea(ensuitePoly);
  // Keep at least 65% of the original bedroom footprint.  This also prevents
  // the visual renderer from ever producing an en-suite that looks larger
  // than the bedroom.
  if (bedroomArea > 0 && ensuiteArea / bedroomArea > 0.30) return false;

  const bedroom = structuredClone(room);
  bedroom.notes = [bedroom.notes, "Bedroom retained at measured boundary; compact internal ensuite contained inside room polygon"].filter(Boolean).join("; ");
  room.notes = bedroom.notes;

  const child = splitChild(bedroom, change, childX, childY, childW, childH, ensuitePoly);
  child.notes = [child.notes, "Internal ensuite; no external/window wall occupied"].filter(Boolean).join("; ");
  floor.rooms.push(child);
  return true;
}

function splitRoom(floor: any, room: Room, change: RoomChange): void {
  const wet = /ensuite|bath|shower/i.test(String(change.split?.secondType || ""));
  if (wet) { splitEnsuiteCorner(floor, room, change); return; }
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
