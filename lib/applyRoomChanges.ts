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

function polygonBounds(points: Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
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
    ...structuredClone(source),
    id: `${source.id}-split-2`,
    name: change.split?.secondName || (wet ? "En-suite" : "Bedroom 2"),
    type: change.split?.secondType || "bedroom",
    x, y, width, height, polygon,
    windows: wet ? [] : structuredClone(source.windows || []),
    doors: [],
    adjacentRooms: [source.id],
    notes: [source.notes, `Created by split of ${source.id}`].filter(Boolean).join("; "),
    confidence: "geometry-proposed",
  };
}

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

function pointOnSegment(p: Point, a: Point, b: Point, epsilon = 1e-6): boolean {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > epsilon) return false;
  return p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon &&
    p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (pointOnSegment(point, a, b)) return true;
    if ((a.y > point.y) !== (b.y > point.y)) {
      const x = ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function polygonSelfIntersects(points: Point[]): boolean {
  const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const intersects = (a: Point, b: Point, c: Point, d: Point) => {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (Math.abs(o1) < 1e-7 && pointOnSegment(c, a, b)) return true;
    if (Math.abs(o2) < 1e-7 && pointOnSegment(d, a, b)) return true;
    if (Math.abs(o3) < 1e-7 && pointOnSegment(a, c, d)) return true;
    if (Math.abs(o4) < 1e-7 && pointOnSegment(b, c, d)) return true;
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
  };
  for (let i = 0; i < points.length; i++) {
    const a1 = points[i], a2 = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || (j + 1) % points.length === i || (i + 1) % points.length === j) continue;
      const b1 = points[j], b2 = points[(j + 1) % points.length];
      if (intersects(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function validRemainder(source: Room, remainder: Point[], ensuiteArea: number): boolean {
  if (!validPolygon(remainder) || polygonSelfIntersects(remainder)) return false;
  const sourceArea = polygonArea(source.polygon!);
  const remainderArea = polygonArea(remainder);
  if (remainderArea <= 0 || remainderArea < sourceArea * 0.65) return false;
  if (ensuiteArea / sourceArea > 0.30) return false;
  if (remainderArea < 900) return false;
  return true;
}

/**
 * For the rectangular corner wet-room produced above, subtraction from the
 * source polygon can be represented exactly as an L-shaped simple polygon.
 * The helper handles the two cases we intentionally allow: a corner box that
 * touches the source's top-left/top-right/bottom-left/bottom-right bounds.
 * For irregular polygons, it only succeeds when the corner cut intersects
 * exactly two source edges and produces a single simple remainder.
 */
function subtractCorner(source: Point[], cut: Point[], corner: { sideX: "left" | "right"; sideY: "top" | "bottom" }): Point[] | undefined {
  if (source.length < 3 || cut.length < 3) return undefined;
  const cb = polygonBounds(cut);
  const sx = Math.min(...source.map(p => p.x)), sy = Math.min(...source.map(p => p.y));
  const sxe = Math.max(...source.map(p => p.x)), sye = Math.max(...source.map(p => p.y));
  const touchesX = corner.sideX === "left" ? Math.abs(cb.x - sx) <= 1e-6 : Math.abs(cb.x + cb.width - sxe) <= 1e-6;
  const touchesY = corner.sideY === "top" ? Math.abs(cb.y - sy) <= 1e-6 : Math.abs(cb.y + cb.height - sye) <= 1e-6;
  if (!touchesX || !touchesY) return undefined;

  // We walk the source boundary, inserting the two cut intersections that
  // bound the corner notch. This works for orthogonal detected room polygons.
  const xCut = corner.sideX === "left" ? cb.x + cb.width : cb.x;
  const yCut = corner.sideY === "top" ? cb.y + cb.height : cb.y;
  const next = (point: Point, direction: "x" | "y") => direction === "x" ? point.x : point.y;
  const sourceOriented = polygonArea(source) >= 0 ? source : [...source].reverse();
  const result: Point[] = [];

  const axisAt = (p: Point, q: Point, axis: "x" | "y", value: number): Point | undefined => {
    const pAxis = next(p, axis), qAxis = next(q, axis);
    if ((pAxis <= value && value <= qAxis) || (qAxis <= value && value <= pAxis)) {
      const d = qAxis - pAxis;
      const t = Math.abs(d) < 1e-9 ? 0 : (value - pAxis) / d;
      if (t < -1e-9 || t > 1 + 1e-9) return undefined;
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }
    return undefined;
  };

  // Generic polygon difference using boundary traversal for an axis-aligned
  // corner cut. We collect the source boundary outside the cut and bridge the
  // two cut-edge intersections in the correct corner order.
  const insideCut = (p: Point) => p.x >= cb.x - 1e-6 && p.x <= cb.x + cb.width + 1e-6 && p.y >= cb.y - 1e-6 && p.y <= cb.y + cb.height + 1e-6;
  const outside = (p: Point) => !insideCut(p);

  const appendUnique = (p: Point) => {
    const last = result[result.length - 1];
    if (!last || Math.abs(last.x - p.x) > 1e-6 || Math.abs(last.y - p.y) > 1e-6) result.push(p);
  };

  for (let i = 0; i < sourceOriented.length; i++) {
    const a = sourceOriented[i], b = sourceOriented[(i + 1) % sourceOriented.length];
    const aOut = outside(a), bOut = outside(b);
    if (aOut) appendUnique(a);
    if (aOut !== bOut) {
      const candidates = [axisAt(a, b, "x", cb.x), axisAt(a, b, "x", cb.x + cb.width), axisAt(a, b, "y", cb.y), axisAt(a, b, "y", cb.y + cb.height)]
        .filter(Boolean) as Point[];
      for (const p of candidates) {
        if (insideCut(p)) appendUnique(p);
      }
    }
  }

  // The simple boundary walk above is enough for rectangles but can leave the
  // notch bridge ambiguous for orthogonal polygons. Prefer the exact L-shape
  // construction when the source itself is axis-aligned and its bounds match.
  const orthogonal = source.every((p, i) => {
    const q = source[(i + 1) % source.length];
    return Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.y - q.y) < 1e-6;
  });
  if (orthogonal) {
    const rect = [
      { x: sx, y: sy }, { x: sxe, y: sy }, { x: sxe, y: sye }, { x: sx, y: sye },
    ];
    if (source.length === 4 && rect.every((p, i) => Math.abs(p.x - source[i].x) < 1e-6 && Math.abs(p.y - source[i].y) < 1e-6)) {
      if (corner.sideX === "left" && corner.sideY === "top") return [
        { x: cb.x + cb.width, y: sy }, { x: sxe, y: sy }, { x: sxe, y: sye }, { x: sx, y: sye }, { x: sx, y: cb.y + cb.height }, { x: cb.x + cb.width, y: cb.y + cb.height },
      ];
      if (corner.sideX === "right" && corner.sideY === "top") return [
        { x: sx, y: sy }, { x: cb.x, y: sy }, { x: cb.x, y: cb.y + cb.height }, { x: sxe, y: cb.y + cb.height }, { x: sxe, y: sye }, { x: sx, y: sye },
      ];
      if (corner.sideX === "left" && corner.sideY === "bottom") return [
        { x: sx, y: sy }, { x: sxe, y: sy }, { x: sxe, y: sye }, { x: cb.x + cb.width, y: sye }, { x: cb.x + cb.width, y: cb.y }, { x: sx, y: cb.y },
      ];
      if (corner.sideX === "right" && corner.sideY === "bottom") return [
        { x: sx, y: sy }, { x: cb.x, y: sy }, { x: cb.x, y: cb.y }, { x: sxe, y: cb.y }, { x: sxe, y: sye }, { x: sx, y: sye },
      ];
    }
  }
  return result.length >= 3 ? result : undefined;
}

function splitEnsuiteCorner(floor: any, room: Room, change: RoomChange): boolean {
  if (!room.polygon || room.polygon.length < 3) return false;

  const corner = bestInternalCorner(room);
  if (!corner) return false;

  const ensuiteWidth = Math.max(80, Math.min(room.width * 0.28, 150));
  const ensuiteHeight = Math.max(70, Math.min(room.height * 0.24, 135));
  const minX = corner.sideX === "right" ? room.x + room.width - ensuiteWidth : room.x;
  const maxX = corner.sideX === "right" ? room.x + room.width : room.x + ensuiteWidth;
  const minY = corner.sideY === "bottom" ? room.y + room.height - ensuiteHeight : room.y;
  const maxY = corner.sideY === "bottom" ? room.y + room.height : room.y + ensuiteHeight;

  let ensuitePoly = clipRect(structuredClone(room.polygon), minX, maxX, minY, maxY);
  if (!validPolygon(ensuitePoly)) {
    const inset = 8;
    const candidate: Point[] = [
      { x: minX + inset, y: minY + inset },
      { x: maxX - inset, y: minY + inset },
      { x: maxX - inset, y: maxY - inset },
      { x: minX + inset, y: maxY - inset },
    ];
    if (candidate.every(p => pointInPolygon(p, room.polygon!))) ensuitePoly = candidate;
  }

  if (!validPolygon(ensuitePoly)) return false;

  const childBounds = polygonBounds(ensuitePoly);
  const childW = childBounds.width, childH = childBounds.height;
  if (childW < 70 || childH < 60) return false;

  const bedroomArea = polygonArea(room.polygon);
  const ensuiteArea = polygonArea(ensuitePoly);
  if (!bedroomArea || ensuiteArea / bedroomArea > 0.30) return false;

  const remainder = subtractCorner(room.polygon, ensuitePoly, corner);
  if (!validRemainder(room, remainder || [], ensuiteArea)) return false;
  if ((polygonArea(remainder!) + ensuiteArea) < bedroomArea * 0.985) return false;

  const bedroom = structuredClone(room);
  const remainderBounds = polygonBounds(remainder!);
  bedroom.x = remainderBounds.x;
  bedroom.y = remainderBounds.y;
  bedroom.width = remainderBounds.width;
  bedroom.height = remainderBounds.height;
  bedroom.polygon = remainder;
  bedroom.notes = [bedroom.notes, "Bedroom reduced by measured internal ensuite cut; remainder is the authoritative bedroom geometry"].filter(Boolean).join("; ");
  bedroom.confidence = "geometry-proposed";
  Object.assign(room, bedroom);

  const child = splitChild(bedroom, change, childBounds.x, childBounds.y, childBounds.width, childBounds.height, ensuitePoly);
  child.notes = [child.notes, "Internal ensuite cut from source bedroom polygon; no external/window wall occupied"].filter(Boolean).join("; ");
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
    room.x=walls[0]==="right"?ox+secondW:ox; room.width=firstW; room.polygon=bedroomPoly; floor.rooms.push(splitChild(room,change,ox,walls[0]==="right"?oy:oy,secondW,oh,secondPoly));
  }
  room.type=change.split?.firstType||"bedroom"; room.name=change.split?.firstName||room.name||"Bedroom"; room.notes=[room.notes,"First portion of proposed room split"].filter(Boolean).join("; ");
}

function addEnsuite(floor:any,room:Room,change:RoomChange):void {
  splitRoom(floor,room,{...change,action:"SplitRoom",split:{firstName:room.name,firstType:"bedroom",secondName:change.newName||"En-suite",secondType:"ensuite",direction:change.split?.direction,firstRatio:change.split?.firstRatio??.72}});
}

export function applyRoomChanges(floorPlan:FloorPlan,changes:RoomChange[]):FloorPlan {
  const updated=structuredClone(floorPlan);
  for(const change of changes||[]){
    if(!change?.roomId)continue;
    for(const floor of updated.floors){
      const room=floor.rooms.find(r=>r.id===change.roomId);
      if(!room)continue;
      const action=String(change.action||"").toLowerCase().replace(/\s+/g,""),inferred=actionType(change.action),requested=String(change.newType||inferred||"").trim().toLowerCase();
      if(action==="nochange"&&!requested)continue;
      if(action==="splitroom"||action==="split"){splitRoom(floor,room,change);continue;}
      if(requested.includes("ensuite")||action==="converttoensuite"){if(String(room.type||"").toLowerCase().includes("bedroom"))addEnsuite(floor,room,change);continue;}
      if(requested&&!noOp(room.type||"",requested)){
        room.type=change.newType||inferred||room.type;
        if(change.newName)room.name=change.newName;
        else if(inferred==="bedroom"&&!/bedroom/i.test(room.name))room.name="Proposed Bedroom";
      }
      if(change.action&&/merge|extend|partition|doorway|opening/i.test(change.action))room.notes=[room.notes,change.action].filter(Boolean).join("; ");
      if(change.reason&&requested&&!noOp(room.type||"",requested))room.notes=[room.notes,change.reason].filter(Boolean).join("; ");
    }
  }
  return updated;
}
