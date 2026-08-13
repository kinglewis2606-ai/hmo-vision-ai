import { FloorPlan, Room, RoomChange, Point, WallSide } from "@/lib/types/floorPlan";

const BEDROOM_MIN_SQM = 6.51;
const PIXEL_TO_SQM_FALLBACK = 10000;
const ENSUITE_MIN_SHOWER_MM = 800;
const ENSUITE_TARGET_SQM = 2.5;
const ENSUITE_MAX_SHARE = 0.34;

type Corner = { sideX: "left" | "right"; sideY: "top" | "bottom" };
type Bounds = { x: number; y: number; width: number; height: number };

function normaliseAction(action?: string): string {
  return String(action || "").toLowerCase().replace(/\s+/g, "");
}

function actionType(action?: string): string | undefined {
  switch (normaliseAction(action)) {
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

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

function polygonBounds(points: Point[]): Bounds {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function validPolygon(points: Point[] | undefined): points is Point[] {
  return !!points && points.length >= 3 && polygonArea(points) > 100;
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

function windowWalls(room: Room): WallSide[] { return Array.from(new Set((room.windows || []).map(w => w.wall))); }
function doorWalls(room: Room): WallSide[] { return Array.from(new Set((room.doors || []).map(d => d.wall))); }

function clip(points: Point[] | undefined, axis: "x" | "y", threshold: number, greater: boolean): Point[] | undefined {
  if (!points || points.length < 3) return undefined;
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

function clipRect(points: Point[], minX?: number, maxX?: number, minY?: number, maxY?: number): Point[] | undefined {
  let result: Point[] | undefined = points;
  if (minX !== undefined) result = clip(result, "x", minX, true);
  if (maxX !== undefined) result = clip(result, "x", maxX, false);
  if (minY !== undefined) result = clip(result, "y", minY, true);
  if (maxY !== undefined) result = clip(result, "y", maxY, false);
  return result;
}

function sourceAreaSqm(room: Room): number {
  if (room.approxAreaSqm && room.approxAreaSqm > 0) return room.approxAreaSqm;
  return polygonArea(room.polygon || []) / PIXEL_TO_SQM_FALLBACK;
}

function squareMetresForPixels(room: Room, pixels: number): number {
  const sqm = sourceAreaSqm(room);
  const px = polygonArea(room.polygon || []);
  return px > 0 ? sqm * (pixels / px) : pixels / PIXEL_TO_SQM_FALLBACK;
}

function pixelAreaForSqm(room: Room, sqm: number): number {
  const sourcePx = polygonArea(room.polygon || []);
  const sourceSqm = sourceAreaSqm(room);
  if (sourcePx > 0 && sourceSqm > 0) return sourcePx * (sqm / sourceSqm);
  return sqm * PIXEL_TO_SQM_FALLBACK;
}

function roomHasRequiredWindow(room: Room): boolean { return windowWalls(room).length > 0; }
function roomHasUsableDoor(room: Room): boolean { return doorWalls(room).length > 0; }

function principalWindowWalls(room: Room): Set<WallSide> {
  const walls = windowWalls(room);
  if (!walls.length) return new Set();
  const longest = (wall: WallSide): number => {
    const p = room.polygon || [];
    let best = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if (wall === "top" && Math.abs(a.y - room.y) < 2 && Math.abs(b.y - room.y) < 2) best = Math.max(best, Math.abs(b.x - a.x));
      if (wall === "bottom" && Math.abs(a.y - (room.y + room.height)) < 2 && Math.abs(b.y - (room.y + room.height)) < 2) best = Math.max(best, Math.abs(b.x - a.x));
      if (wall === "left" && Math.abs(a.x - room.x) < 2 && Math.abs(b.x - room.x) < 2) best = Math.max(best, Math.abs(b.y - a.y));
      if (wall === "right" && Math.abs(a.x - (room.x + room.width)) < 2 && Math.abs(b.x - (room.x + room.width)) < 2) best = Math.max(best, Math.abs(b.y - a.y));
    }
    return best;
  };
  const longestLength = Math.max(...walls.map(longest));
  return new Set(walls.filter(w => longest(w) >= longestLength * 0.75));
}

function wallInterval(room: Room, wall: WallSide): { start: number; end: number } {
  if (wall === "top" || wall === "bottom") return { start: room.x, end: room.x + room.width };
  return { start: room.y, end: room.y + room.height };
}

function wallDistanceToCorner(room: Room, wall: WallSide, side: "left" | "right" | "top" | "bottom"): number {
  const interval = wallInterval(room, wall);
  return Math.max(0, interval.end - interval.start);
}

function candidateCorners(room: Room): Corner[] {
  const windows = new Set(windowWalls(room));
  const principal = principalWindowWalls(room);
  const doors = new Set(doorWalls(room));
  const corners: Corner[] = [
    { sideX: "left", sideY: "top" }, { sideX: "right", sideY: "top" },
    { sideX: "left", sideY: "bottom" }, { sideX: "right", sideY: "bottom" },
  ];
  const score = (corner: Corner): number => {
    const xWall = corner.sideX as WallSide;
    const yWall = corner.sideY as WallSide;
    let s = 0;
    if (!windows.has(xWall) && !windows.has(yWall)) s += 100;
    if (principal.has(xWall) || principal.has(yWall)) s -= 2000;
    if (doors.has(xWall) || doors.has(yWall)) s -= 160;
    if (windows.has(xWall) || windows.has(yWall)) s -= 1000;
    s += 100 / Math.max(1, wallDistanceToCorner(room, xWall, corner.sideX));
    s += 100 / Math.max(1, wallDistanceToCorner(room, yWall, corner.sideY));
    return s;
  };
  return corners.sort((a, b) => score(b) - score(a));
}

function openingWallBlocked(room: Room, bounds: Bounds): boolean {
  const epsilon = 4;
  for (const wall of doorWalls(room)) {
    if (wall === "top" && Math.abs(bounds.y - room.y) <= epsilon && bounds.x < room.x + room.width && bounds.x + bounds.width > room.x) return true;
    if (wall === "bottom" && Math.abs(bounds.y + bounds.height - (room.y + room.height)) <= epsilon && bounds.x < room.x + room.width && bounds.x + bounds.width > room.x) return true;
    if (wall === "left" && Math.abs(bounds.x - room.x) <= epsilon && bounds.y < room.y + room.height && bounds.y + bounds.height > room.y) return true;
    if (wall === "right" && Math.abs(bounds.x + bounds.width - (room.x + room.width)) <= epsilon && bounds.y < room.y + room.height && bounds.y + bounds.height > room.y) return true;
  }
  return false;
}

function buildCornerRect(room: Room, corner: Corner, width: number, height: number): Bounds {
  return {
    x: corner.sideX === "right" ? room.x + room.width - width : room.x,
    y: corner.sideY === "bottom" ? room.y + room.height - height : room.y,
    width,
    height,
  };
}

function subtractRectangleFromOrthogonal(source: Point[], cut: Bounds): Point[] | undefined {
  if (source.length !== 4) return undefined;
  const xs = source.map(p => p.x), ys = source.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const points: Point[] = [
    { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY },
  ];
  const c = { x: cut.x, y: cut.y, right: cut.x + cut.width, bottom: cut.y + cut.height };
  if (c.x <= minX || c.y <= minY || c.right >= maxX || c.bottom >= maxY) return undefined;
  const result: Point[] = [];
  const add = (p: Point) => { const last = result[result.length - 1]; if (!last || last.x !== p.x || last.y !== p.y) result.push(p); };
  const cornerMatches = [
    { sideX: "left", sideY: "top", points: [{ x: c.right, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: c.bottom }, { x: c.right, y: c.bottom }] },
    { sideX: "right", sideY: "top", points: [{ x: minX, y: minY }, { x: c.x, y: minY }, { x: c.x, y: c.bottom }, { x: maxX, y: c.bottom }, { x: maxX, y: maxY }, { x: minX, y: maxY }] },
    { sideX: "left", sideY: "bottom", points: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: c.right, y: maxY }, { x: c.right, y: c.y }, { x: minX, y: c.y }] },
    { sideX: "right", sideY: "bottom", points: [{ x: minX, y: minY }, { x: c.x, y: minY }, { x: c.x, y: c.y }, { x: maxX, y: c.y }, { x: maxX, y: maxY }, { x: minX, y: maxY }] },
  ];
  for (const match of cornerMatches) {
    const same = (match.sideX === "left") === (Math.abs(c.x - minX) < 1e-6) && (match.sideY === "top") === (Math.abs(c.y - minY) < 1e-6);
    if (same) {
      for (const p of match.points) add(p);
      return result;
    }
  }
  return points;
}

function carveRectangle(source: Point[], cut: Bounds, corner: Corner): Point[] | undefined {
  if (!validPolygon(source)) return undefined;
  const simpleRect = subtractRectangleFromOrthogonal(source, cut);
  if (simpleRect && validPolygon(simpleRect)) return simpleRect;

  const clippedOutside: Point[] | undefined = (() => {
    let result = source;
    const minX = corner.sideX === "left" ? cut.x + cut.width : undefined;
    const maxX = corner.sideX === "right" ? cut.x : undefined;
    const minY = corner.sideY === "top" ? cut.y + cut.height : undefined;
    const maxY = corner.sideY === "bottom" ? cut.y : undefined;
    if (minX !== undefined) result = clip(result, "x", minX, true) || [];
    if (maxX !== undefined) result = clip(result, "x", maxX, false) || [];
    if (minY !== undefined) result = clip(result, "y", minY, true) || [];
    if (maxY !== undefined) result = clip(result, "y", maxY, false) || [];
    return result.length >= 3 ? result : undefined;
  })();
  return clippedOutside;
}

function validBedroomRemainder(source: Room, remainder: Point[], ensuitePixels: number): boolean {
  if (!validPolygon(remainder) || polygonSelfIntersects(remainder)) return false;
  const sourceArea = polygonArea(source.polygon || []);
  const remainderArea = polygonArea(remainder);
  if (sourceArea <= 0 || remainderArea <= 0 || ensuitePixels <= 0) return false;
  if (squareMetresForPixels(source, remainderArea) + 0.001 < BEDROOM_MIN_SQM) return false;
  if (remainderArea < sourceArea * 0.50) return false;
  if (ensuitePixels / sourceArea > ENSUITE_MAX_SHARE) return false;
  return true;
}

function childRoom(source: Room, change: RoomChange, polygon: Point[], type: string, name: string): Room {
  const bounds = polygonBounds(polygon);
  return {
    ...structuredClone(source),
    id: `${source.id}-split-2`,
    name,
    type,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    polygon,
    windows: type === "ensuite" ? [] : structuredClone(source.windows || []),
    doors: [],
    adjacentRooms: [source.id],
    notes: [source.notes, `Created by split of ${source.id}`].filter(Boolean).join("; "),
    confidence: "geometry-proposed",
  };
}

function preserveBedroomOpenings(original: Room, remainder: Point[], cut: Bounds): { windows?: Room["windows"]; doors?: Room["doors"] } {
  const bounds = polygonBounds(remainder);
  const windows = (original.windows || []).filter(w => {
    const wall = w.wall;
    if (wall === "top") return bounds.y <= original.y + 2 && !((cut.y <= original.y + 2) && cut.x <= original.x + original.width && cut.x + cut.width >= original.x);
    if (wall === "bottom") return bounds.y + bounds.height >= original.y + original.height - 2 && !((cut.y + cut.height >= original.y + original.height - 2) && cut.x <= original.x + original.width && cut.x + cut.width >= original.x);
    if (wall === "left") return bounds.x <= original.x + 2 && !((cut.x <= original.x + 2) && cut.y <= original.y + original.height && cut.y + cut.height >= original.y);
    if (wall === "right") return bounds.x + bounds.width >= original.x + original.width - 2 && !((cut.x + cut.width >= original.x + original.width - 2) && cut.y <= original.y + original.height && cut.y + cut.height >= original.y);
    return true;
  });
  const doors = (original.doors || []).filter(d => {
    if (d.wall === "top") return bounds.y <= original.y + 2;
    if (d.wall === "bottom") return bounds.y + bounds.height >= original.y + original.height - 2;
    if (d.wall === "left") return bounds.x <= original.x + 2;
    if (d.wall === "right") return bounds.x + bounds.width >= original.x + original.width - 2;
    return true;
  });
  return { windows, doors };
}

function applySimpleConversion(room: Room, change: RoomChange): void {
  const inferred = actionType(change.action);
  const requested = String(change.newType || inferred || "").trim().toLowerCase();
  if (!requested || noOp(room.type || "", requested)) return;
  room.type = change.newType || inferred || room.type;
  if (change.newName) room.name = change.newName;
  else if (inferred === "bedroom" && !/bedroom/i.test(room.name)) room.name = "Proposed Bedroom";
  if (change.reason) room.notes = [room.notes, change.reason].filter(Boolean).join("; ");
}

function splitNonEnsuite(floor: { rooms: Room[] }, room: Room, change: RoomChange): boolean {
  if (!room.polygon || room.polygon.length < 3) return false;
  const windows = windowWalls(room);
  const direction = change.split?.direction || (windows.includes("top") || windows.includes("bottom") ? "horizontal" : "vertical");
  const ratio = Number.isFinite(Number(change.split?.firstRatio)) ? Math.max(0.4, Math.min(0.8, Number(change.split?.firstRatio))) : 0.65;
  const original = structuredClone(room.polygon);
  const ox = room.x, oy = room.y, ow = room.width, oh = room.height;
  if (direction === "horizontal") {
    const splitY = oy + oh * ratio;
    const first = clip(original, "y", splitY, false);
    const second = clip(original, "y", splitY, true);
    if (!first || !second) return false;
    const firstAreaSqm = squareMetresForPixels(room, polygonArea(first));
    const secondAreaSqm = squareMetresForPixels(room, polygonArea(second));
    if (firstAreaSqm < BEDROOM_MIN_SQM || secondAreaSqm < BEDROOM_MIN_SQM) return false;
    room.polygon = first;
    room.y = polygonBounds(first).y;
    room.height = polygonBounds(first).height;
    room.type = change.split?.firstType || "bedroom";
    room.name = change.split?.firstName || room.name || "Bedroom";
    floor.rooms.push(childRoom(room, change, second, change.split?.secondType || "bedroom", change.split?.secondName || "Bedroom"));
    return true;
  }
  const splitX = ox + ow * ratio;
  const first = clip(original, "x", splitX, false);
  const second = clip(original, "x", splitX, true);
  if (!first || !second) return false;
  const firstAreaSqm = squareMetresForPixels(room, polygonArea(first));
  const secondAreaSqm = squareMetresForPixels(room, polygonArea(second));
  if (firstAreaSqm < BEDROOM_MIN_SQM || secondAreaSqm < BEDROOM_MIN_SQM) return false;
  room.polygon = first;
  room.x = polygonBounds(first).x;
  room.width = polygonBounds(first).width;
  room.type = change.split?.firstType || "bedroom";
  room.name = change.split?.firstName || room.name || "Bedroom";
  floor.rooms.push(childRoom(room, change, second, change.split?.secondType || "bedroom", change.split?.secondName || "Bedroom"));
  return true;
}

function findBestEnsuiteCandidate(room: Room): { polygon: Point[]; bounds: Bounds; remainder: Point[]; score: number } | undefined {
  if (!room.polygon || room.polygon.length < 3 || !roomHasRequiredWindow(room) || !roomHasUsableDoor(room)) return undefined;
  const sourceArea = polygonArea(room.polygon);
  if (sourceArea <= 0) return undefined;
  const corners = candidateCorners(room);
  const widthValues = [
    Math.max(ENSUITE_MIN_SHOWER_MM, Math.min(room.width * 0.26, 150)),
    Math.max(ENSUITE_MIN_SHOWER_MM, Math.min(room.width * 0.31, 170)),
    Math.max(ENSUITE_MIN_SHOWER_MM, Math.min(room.width * 0.36, 190)),
  ];
  const heightValues = [
    Math.max(ENSUITE_MIN_SHOWER_MM, Math.min(room.height * 0.24, 140)),
    Math.max(ENSUITE_MIN_SHOWER_MM, Math.min(room.height * 0.30, 170)),
    Math.max(ENSUITE_MIN_SHOWER_MM, Math.min(room.height * 0.36, 200)),
  ];

  const candidates: Array<{ polygon: Point[]; bounds: Bounds; remainder: Point[]; score: number }> = [];
  for (const corner of corners) {
    for (const width of widthValues) {
      for (const height of heightValues) {
        if (width >= room.width - 8 || height >= room.height - 8) continue;
        const bounds = buildCornerRect(room, corner, width, height);
        if (openingWallBlocked(room, bounds)) continue;
        const cornersInside = [
          { x: bounds.x + 2, y: bounds.y + 2 },
          { x: bounds.x + bounds.width - 2, y: bounds.y + 2 },
          { x: bounds.x + bounds.width - 2, y: bounds.y + bounds.height - 2 },
          { x: bounds.x + 2, y: bounds.y + bounds.height - 2 },
        ];
        if (!cornersInside.every(p => pointInPolygon(p, room.polygon!))) continue;
        const ensuitePoly: Point[] = [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y },
          { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
          { x: bounds.x, y: bounds.y + bounds.height },
        ];
        const ensuitePixels = polygonArea(ensuitePoly);
        const ensuiteSqm = squareMetresForPixels(room, ensuitePixels);
        if (width < ENSUITE_MIN_SHOWER_MM || height < ENSUITE_MIN_SHOWER_MM) continue;
        if (ensuiteSqm < ENSUITE_TARGET_SQM * 0.75) continue;
        const remainder = carveRectangle(room.polygon!, bounds, corner);
        if (!validBedroomRemainder(room, remainder || [], ensuitePixels)) continue;
        if (polygonArea(remainder!) + ensuitePixels < sourceArea * 0.995) continue;
        const remainderOpenings = preserveBedroomOpenings(room, remainder!, bounds);
        const principal = principalWindowWalls(room);
        if (principal.size && !Array.from(principal).every(w => (remainderOpenings.windows || []).some(x => x.wall === w))) continue;
        const remainderAreaSqm = squareMetresForPixels(room, polygonArea(remainder!));
        const score = remainderAreaSqm * 10 + ensuiteSqm * 4 - (ensuitePixels / sourceArea) * 1000 + (Array.from(principal).length ? 50 : 0);
        candidates.push({ polygon: ensuitePoly, bounds, remainder: remainder!, score });
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function splitEnsuite(floor: { rooms: Room[] }, room: Room, change: RoomChange): boolean {
  const candidate = findBestEnsuiteCandidate(room);
  if (!candidate) return false;
  const original = structuredClone(room);
  const remainderBounds = polygonBounds(candidate.remainder);
  const openings = preserveBedroomOpenings(original, candidate.remainder, candidate.bounds);
  room.x = remainderBounds.x;
  room.y = remainderBounds.y;
  room.width = remainderBounds.width;
  room.height = remainderBounds.height;
  room.polygon = candidate.remainder;
  room.windows = openings.windows;
  room.doors = openings.doors;
  room.approxAreaSqm = Number(squareMetresForPixels(original, polygonArea(candidate.remainder)).toFixed(2));
  room.name = change.split?.firstName || room.name || "Bedroom";
  room.type = "bedroom";
  room.notes = [room.notes, "Bedroom remainder after validated internal ensuite carve"].filter(Boolean).join("; ");
  room.confidence = "geometry-proposed";

  const child = childRoom(room, change, candidate.polygon, "ensuite", "En-suite");
  child.windows = [];
  child.doors = [];
  child.approxAreaSqm = Number(squareMetresForPixels(original, polygonArea(candidate.polygon)).toFixed(2));
  child.notes = [child.notes, `Real geometry carved from ${original.id}; candidate preserves principal bedroom window and doorway`].filter(Boolean).join("; ");
  floor.rooms.push(child);
  return true;
}

function splitRoom(floor: { rooms: Room[] }, room: Room, change: RoomChange): boolean {
  const wet = /ensuite|bath|shower/i.test(String(change.split?.secondType || ""));
  return wet ? splitEnsuite(floor, room, change) : splitNonEnsuite(floor, room, change);
}

function addEnsuite(floor: { rooms: Room[] }, room: Room, change: RoomChange): boolean {
  return splitEnsuite(floor, room, {
    ...change,
    action: "SplitRoom",
    split: {
      firstName: change.split?.firstName || room.name,
      firstType: "bedroom",
      secondName: "En-suite",
      secondType: "ensuite",
    },
  });
}

export function applyRoomChanges(floorPlan: FloorPlan, changes: RoomChange[]): FloorPlan {
  const updated = structuredClone(floorPlan);
  for (const change of changes || []) {
    if (!change?.roomId) continue;
    for (const floor of updated.floors) {
      const room = floor.rooms.find(r => r.id === change.roomId);
      if (!room) continue;
      const action = normaliseAction(change.action), inferred = actionType(change.action);
      const requested = String(change.newType || inferred || "").trim().toLowerCase();
      if (action === "nochange" && !requested) continue;
      if (action === "splitroom" || action === "split") {
        splitRoom(floor, room, change);
        break;
      }
      if (requested.includes("ensuite") || action === "converttoensuite") {
        if (String(room.type || "").toLowerCase().includes("bedroom")) addEnsuite(floor, room, change);
        break;
      }
      if (requested) applySimpleConversion(room, change);
      break;
    }
  }
  return updated;
}
