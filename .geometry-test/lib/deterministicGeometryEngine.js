"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyRoomChanges = applyRoomChanges;
exports.noOp = noOp;
const geometryValidation_1 = require("./geometryValidation");
const ENSUITE_MIN_PRACTICAL_SQM = 1.8;
const normalise = (value) => String(value || "").toLowerCase().replace(/\s+/g, "");
function noOp(current, requested) { return !requested || normalise(current) === normalise(requested); }
function actionType(action) { switch (normalise(action)) {
    case "converttobedroom": return "bedroom";
    case "converttokitchen": return "kitchen";
    case "converttobathroom": return "bathroom";
    case "converttoensuite": return "ensuite";
    default: return undefined;
} }
function bounds(points) { const xs = points.map(p => p.x), ys = points.map(p => p.y); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }; }
function windowWalls(room) { return Array.from(new Set((room.windows || []).map(w => w.wall))); }
function doorWalls(room) { return Array.from(new Set((room.doors || []).map(d => d.wall))); }
function openingIntervals(room, kind) { const openings = kind === "door" ? room.doors || [] : room.windows || []; return openings.map(opening => { const horizontal = opening.wall === "top" || opening.wall === "bottom"; const startWall = horizontal ? room.x : room.y, endWall = horizontal ? room.x + room.width : room.y + room.height; const start = Number(opening.start), end = Number(opening.end); if (Number.isFinite(start) && Number.isFinite(end) && end > start)
    return { wall: opening.wall, start, end, exact: true }; const span = endWall - startWall, reserve = Math.min(span * 0.30, 120), centre = (startWall + endWall) / 2; return { wall: opening.wall, start: centre - reserve / 2, end: centre + reserve / 2, exact: false }; }); }
function principalWindowWalls(room) { const walls = windowWalls(room); if (!walls.length)
    return new Set(); const length = (wall) => openingIntervals(room, "window").filter(o => o.wall === wall).reduce((sum, o) => sum + (o.end - o.start), 0) || (wall === "top" || wall === "bottom" ? room.width : room.height); const longest = Math.max(...walls.map(length)); return new Set(walls.filter(w => length(w) >= longest * 0.75)); }
function openingWallBlocked(room, cut) { const edges = [["top", Math.abs(cut.y - room.y) <= 2], ["bottom", Math.abs(cut.y + cut.height - (room.y + room.height)) <= 2], ["left", Math.abs(cut.x - room.x) <= 2], ["right", Math.abs(cut.x + cut.width - (room.x + room.width)) <= 2]]; return edges.some(([wall, at]) => at && openingIntervals(room, "door").some(o => { if (o.wall !== wall)
    return false; const start = wall === "top" || wall === "bottom" ? cut.x : cut.y; const end = wall === "top" || wall === "bottom" ? cut.x + cut.width : cut.y + cut.height; return Math.max(start, o.start) < Math.min(end, o.end); })); }
function preserveOpenings(room, remainder) { const survives = (wall, start, end) => { const horizontal = wall === "top" || wall === "bottom", target = wall === "top" ? room.y : wall === "bottom" ? room.y + room.height : wall === "left" ? room.x : room.x + room.width; const min = Number.isFinite(start) ? Number(start) : horizontal ? room.x : room.y, max = Number.isFinite(end) ? Number(end) : horizontal ? room.x + room.width : room.y + room.height; return remainder.some((p, i) => { const q = remainder[(i + 1) % remainder.length]; const sameWall = horizontal ? Math.abs(p.y - q.y) <= 2 && Math.abs(p.y - target) <= 3 : Math.abs(p.x - q.x) <= 2 && Math.abs(p.x - target) <= 3; if (!sameWall)
    return false; const a = horizontal ? Math.min(p.x, q.x) : Math.min(p.y, q.y), b = horizontal ? Math.max(p.x, q.x) : Math.max(p.y, q.y); return Math.max(a, min) < Math.min(b, max); }); }; return { windows: (room.windows || []).filter(w => survives(w.wall, w.start, w.end)), doors: (room.doors || []).filter(d => survives(d.wall, d.start, d.end)) }; }
function clip(points, axis, threshold, greater) { if (points.length < 3)
    return undefined; const inside = (p) => greater ? p[axis] >= threshold : p[axis] <= threshold; const intersection = (a, b) => { const delta = b[axis] - a[axis], t = Math.abs(delta) < 1e-9 ? 0 : (threshold - a[axis]) / delta; return axis === "x" ? { x: threshold, y: a.y + (b.y - a.y) * t } : { x: a.x + (b.x - a.x) * t, y: threshold }; }; const result = []; for (let i = 0; i < points.length; i++) {
    const a = points[(i - 1 + points.length) % points.length], b = points[i], aInside = inside(a), bInside = inside(b);
    if (aInside !== bInside)
        result.push(intersection(a, b));
    if (bInside)
        result.push(b);
} return result.length >= 3 ? result : undefined; }
function subtractCornerRectangle(source, cut) { if (source.length !== 4)
    return undefined; const minX = Math.min(...source.map(p => p.x)), maxX = Math.max(...source.map(p => p.x)), minY = Math.min(...source.map(p => p.y)), maxY = Math.max(...source.map(p => p.y)); const right = cut.x + cut.width, bottom = cut.y + cut.height, EPS = 1e-6; const eq = (a, b) => Math.abs(a - b) <= EPS; if (eq(cut.x, minX) && eq(cut.y, minY))
    return [{ x: right, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: bottom }, { x: right, y: bottom }]; if (eq(right, maxX) && eq(cut.y, minY))
    return [{ x: minX, y: minY }, { x: cut.x, y: minY }, { x: cut.x, y: bottom }, { x: maxX, y: bottom }, { x: maxX, y: maxY }, { x: minX, y: maxY }]; if (eq(cut.x, minX) && eq(bottom, maxY))
    return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: right, y: maxY }, { x: right, y: cut.y }, { x: minX, y: cut.y }]; if (eq(right, maxX) && eq(bottom, maxY))
    return [{ x: minX, y: minY }, { x: cut.x, y: minY }, { x: cut.x, y: cut.y }, { x: maxX, y: cut.y }, { x: maxX, y: maxY }, { x: minX, y: maxY }]; return undefined; }
function carveCorner(source, cut, corner) { if (!(0, geometryValidation_1.validatePolygon)(source).valid)
    return undefined; const exact = subtractCornerRectangle(source, cut); if (exact && (0, geometryValidation_1.validatePolygon)(exact).valid)
    return exact; if (source.length === 4)
    return undefined; let result = structuredClone(source); const minX = corner.sideX === "left" ? cut.x + cut.width : undefined, maxX = corner.sideX === "right" ? cut.x : undefined, minY = corner.sideY === "top" ? cut.y + cut.height : undefined, maxY = corner.sideY === "bottom" ? cut.y : undefined; if (minX !== undefined)
    result = result && clip(result, "x", minX, true); if (maxX !== undefined)
    result = result && clip(result, "x", maxX, false); if (minY !== undefined)
    result = result && clip(result, "y", minY, true); if (maxY !== undefined)
    result = result && clip(result, "y", maxY, false); return result && (0, geometryValidation_1.validatePolygon)(result).valid ? result : undefined; }
function childRoom(source, polygon, type, name, notes) { const b = bounds(polygon); return { ...structuredClone(source), id: `${source.id}-split-2`, name, type, x: b.x, y: b.y, width: b.width, height: b.height, polygon, windows: [], doors: [], adjacentRooms: [source.id], approxAreaSqm: 0, notes: [source.notes, notes].filter(Boolean).join(";"), confidence: "geometry-proposed" }; }
function splitRoomGeometry(floor, room, change) { const isEnsuite = /ensuite|bath|shower/i.test(String(change.split?.secondType || "")) || normalise(change.action) === "converttoensuite"; if (isEnsuite)
    return addEnsuiteGeometry(floor, room, change); const original = structuredClone(room), polygon = original.polygon; if (!polygon || polygon.length < 3)
    return false; const direction = change.split?.direction || (windowWalls(room).some(w => w === "top" || w === "bottom") ? "horizontal" : "vertical"), ratio = Number.isFinite(Number(change.split?.firstRatio)) ? Math.max(0.35, Math.min(0.65, Number(change.split?.firstRatio))) : 0.5, threshold = direction === "horizontal" ? room.y + room.height * ratio : room.x + room.width * ratio; const parallelWalls = direction === "horizontal" ? new Set(["left", "right"]) : new Set(["top", "bottom"]); if (openingIntervals(original, "door").some(o => parallelWalls.has(o.wall) && o.start < threshold - 1e-6 && o.end > threshold + 1e-6))
    return false; const cutAxis = direction === "horizontal" ? "y" : "x"; const first = clip(polygon, cutAxis, threshold, false), second = clip(polygon, cutAxis, threshold, true); if (!first || !second || (0, geometryValidation_1.polygonSelfIntersects)(first) || (0, geometryValidation_1.polygonSelfIntersects)(second))
    return false; const firstOpen = preserveOpenings(original, first), secondOpen = preserveOpenings(original, second), firstRoom = { ...original, polygon: first, type: "bedroom", name: change.split?.firstName || original.name, windows: firstOpen.windows, doors: firstOpen.doors }, secondRoom = { ...original, id: `${original.id}-split-2`, polygon: second, type: "bedroom", name: change.split?.secondName || "Bedroom", windows: secondOpen.windows, doors: secondOpen.doors }; if (!(0, geometryValidation_1.validateBedroomGeometry)(firstRoom).valid || !(0, geometryValidation_1.validateBedroomGeometry)(secondRoom).valid || !(0, geometryValidation_1.areasConserve)(original, first, second))
    return false; const firstBounds = bounds(first); Object.assign(room, firstRoom, { x: firstBounds.x, y: firstBounds.y, width: firstBounds.width, height: firstBounds.height, approxAreaSqm: Number((0, geometryValidation_1.sqmForPolygon)(original, first).toFixed(2)), confidence: "geometry-proposed" }); const child = childRoom(original, second, "bedroom", change.split?.secondName || "Bedroom", "Validated genuine room split"); child.windows = secondOpen.windows; child.doors = secondOpen.doors; child.approxAreaSqm = Number((0, geometryValidation_1.sqmForPolygon)(original, second).toFixed(2)); floor.rooms.push(child); return true; }
function candidateCorners(room) { const windows = new Set(windowWalls(room)), principal = principalWindowWalls(room), doors = new Set(doorWalls(room)), corners = [{ sideX: "left", sideY: "top" }, { sideX: "right", sideY: "top" }, { sideX: "left", sideY: "bottom" }, { sideX: "right", sideY: "bottom" }]; const score = (c) => { const x = c.sideX, y = c.sideY; return (windows.has(x) || windows.has(y) ? -1000 : 100) + (principal.has(x) || principal.has(y) ? -2000 : 0) + (doors.has(x) || doors.has(y) ? -150 : 0); }; return corners.sort((a, b) => score(b) - score(a)); }
function buildCornerRect(room, corner, width, height) { return { x: corner.sideX === "right" ? room.x + room.width - width : room.x, y: corner.sideY === "bottom" ? room.y + room.height - height : room.y, width, height }; }
function findEnsuite(room) { if (!room.polygon?.length || !(0, geometryValidation_1.validateBedroomGeometry)(room).valid)
    return undefined; const sourcePx = (0, geometryValidation_1.polygonArea)(room.polygon), sourceSqm = Number(room.approxAreaSqm || 0), metresPerPixel = sourcePx > 0 && sourceSqm > 0 ? Math.sqrt(sourceSqm / sourcePx) : 0; const fractions = [0.24, 0.28, 0.32, 0.36, 0.40, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54, 0.56]; const candidates = []; for (const corner of candidateCorners(room))
    for (const wf of fractions)
        for (const hf of fractions) {
            const cut = buildCornerRect(room, corner, room.width * wf, room.height * hf);
            if (openingWallBlocked(room, cut))
                continue;
            const polygon = [{ x: cut.x, y: cut.y }, { x: cut.x + cut.width, y: cut.y }, { x: cut.x + cut.width, y: cut.y + cut.height }, { x: cut.x, y: cut.y + cut.height }];
            if (!(0, geometryValidation_1.polygonContainsPolygon)(room.polygon, polygon))
                continue;
            const remainder = carveCorner(room.polygon, cut, corner);
            if (!remainder || !(0, geometryValidation_1.areasConserve)(room, remainder, polygon))
                continue;
            const openings = preserveOpenings(room, remainder), principal = principalWindowWalls(room);
            if (!openings.doors?.length || (principal.size && !Array.from(principal).every(w => (openings.windows || []).some(x => x.wall === w))))
                continue;
            const bedroomRemainder = { ...structuredClone(room), polygon: remainder, windows: openings.windows, doors: openings.doors };
            const remainderAreaSqm = (0, geometryValidation_1.sqmForPolygon)(room, remainder);
            bedroomRemainder.approxAreaSqm = remainderAreaSqm;
            if (!(0, geometryValidation_1.validateBedroomGeometry)(bedroomRemainder).valid)
                continue;
            const ensuiteArea = (0, geometryValidation_1.sqmForPolygon)(room, polygon);
            if (ensuiteArea < ENSUITE_MIN_PRACTICAL_SQM)
                continue;
            const widthM = room.approxWidthM && room.width ? cut.width * room.approxWidthM / room.width : cut.width * metresPerPixel, heightM = room.approxDepthM && room.height ? cut.height * room.approxDepthM / room.height : cut.height * metresPerPixel;
            if (widthM < geometryValidation_1.ENSUITE_SHOWER_MIN_M || heightM < geometryValidation_1.ENSUITE_SHOWER_MIN_M)
                continue;
            const score = Math.abs(ensuiteArea - geometryValidation_1.ENSUITE_TARGET_SQM);
            candidates.push({ polygon, remainder, areaSqm: ensuiteArea, score });
        } candidates.sort((a, b) => a.score - b.score); return candidates[0] ? { polygon: candidates[0].polygon, remainder: candidates[0].remainder, areaSqm: candidates[0].areaSqm } : undefined; }
function addEnsuiteGeometry(floor, room, change) { const candidate = findEnsuite(room); if (!candidate)
    return false; const original = structuredClone(room), remainderArea = (0, geometryValidation_1.sqmForPolygon)(original, candidate.remainder); const openings = preserveOpenings(original, candidate.remainder); const remainderBounds = bounds(candidate.remainder); const updated = { ...original, polygon: candidate.remainder, x: remainderBounds.x, y: remainderBounds.y, width: remainderBounds.width, height: remainderBounds.height, approxAreaSqm: Number(remainderArea.toFixed(2)), name: change.split?.firstName || original.name, type: "bedroom", windows: openings.windows, doors: openings.doors, notes: [original.notes, "Bedroom remainder after physically carved private ensuite"].filter(Boolean).join(";"), confidence: "geometry-proposed" }; if (!(0, geometryValidation_1.validateBedroomGeometry)(updated).valid)
    return false; Object.assign(room, updated); const child = childRoom(original, candidate.polygon, "ensuite", change.split?.secondName || "En-suite", "Physically carved inside source bedroom polygon"); child.approxAreaSqm = Number(candidate.areaSqm.toFixed(2)); child.windows = []; child.doors = [{ wall: doorWalls(original).find(w => w !== undefined) || "top" }]; floor.rooms.push(child); return true; }
function applyRoomChanges(plan, changes = []) { const updated = structuredClone(plan); for (const change of changes) {
    if (!change?.roomId || !change.action)
        continue;
    for (const floor of updated.floors) {
        const room = floor.rooms.find(r => r.id === change.roomId);
        if (!room)
            continue;
        const action = normalise(change.action);
        if (action === "splitroom" || action === "split" || action === "converttoensuite") {
            splitRoomGeometry(floor, room, change);
            continue;
        }
        if (noOp(room.type, actionType(change.action) || change.newType || "") && !action.includes("merge"))
            continue;
        const target = actionType(change.action) || change.newType;
        if (target) {
            room.type = target;
            room.name = change.newName || room.name;
        }
    }
} return updated; }
