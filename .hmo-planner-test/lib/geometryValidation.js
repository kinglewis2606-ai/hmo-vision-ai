"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENSUITE_TARGET_SQM = exports.ENSUITE_SHOWER_MIN_M = exports.BEDROOM_MIN_SQM = void 0;
exports.polygonArea = polygonArea;
exports.polygonSelfIntersects = polygonSelfIntersects;
exports.pointInPolygon = pointInPolygon;
exports.polygonContainsPolygon = polygonContainsPolygon;
exports.sourcePolygonAreaSqm = sourcePolygonAreaSqm;
exports.sqmForPolygon = sqmForPolygon;
exports.roomSourceAreaSqm = roomSourceAreaSqm;
exports.validatePolygon = validatePolygon;
exports.validateBedroomGeometry = validateBedroomGeometry;
exports.areasConserve = areasConserve;
exports.areaDifferenceSqm = areaDifferenceSqm;
const geometryNoOp = (current, requested) => String(current || "").trim().toLowerCase() === String(requested || "").trim().toLowerCase();
globalThis.noOp = geometryNoOp;
exports.BEDROOM_MIN_SQM = 6.51;
exports.ENSUITE_SHOWER_MIN_M = 0.8;
exports.ENSUITE_TARGET_SQM = 2.5;
const EPSILON = 1e-7;
function polygonArea(points = []) { if (points.length < 3)
    return 0; let sum = 0; for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
} return Math.abs(sum) / 2; }
function orient(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(p, a, b) { return Math.abs(orient(a, b, p)) <= EPSILON && p.x >= Math.min(a.x, b.x) - EPSILON && p.x <= Math.max(a.x, b.x) + EPSILON && p.y >= Math.min(a.y, b.y) - EPSILON && p.y <= Math.max(a.y, b.y) + EPSILON; }
function segmentsIntersect(a, b, c, d) { const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b); if (Math.abs(o1) <= EPSILON && onSegment(c, a, b))
    return true; if (Math.abs(o2) <= EPSILON && onSegment(d, a, b))
    return true; if (Math.abs(o3) <= EPSILON && onSegment(a, c, d))
    return true; if (Math.abs(o4) <= EPSILON && onSegment(b, c, d))
    return true; return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0); }
function polygonSelfIntersects(points = []) { if (points.length < 4)
    return false; for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
        if (i === j || (i + 1) % points.length === j || (j + 1) % points.length === i)
            continue;
        if (segmentsIntersect(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length]))
            return true;
    } return false; }
function pointInPolygon(point, polygon = []) { if (polygon.length < 3)
    return false; let inside = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (onSegment(point, a, b))
        return true;
    if ((a.y > point.y) !== (b.y > point.y)) {
        const x = ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x;
        if (point.x < x)
            inside = !inside;
    }
} return inside; }
function polygonContainsPolygon(source, child) { return source.length >= 3 && child.length >= 3 && !polygonSelfIntersects(source) && !polygonSelfIntersects(child) && child.every(p => pointInPolygon(p, source)); }
/** Calibrates only the authoritative source polygon. If the vision pass supplied physical dimensions, use them; otherwise use the existing image-scale fallback. */
function sourcePolygonAreaSqm(room) {
    const px = polygonArea(room.polygon || []);
    const calibrated = Number(room.approxAreaSqm);
    if (px > 0 && calibrated > 0)
        return calibrated;
    const dimensions = Number(room.approxWidthM) * Number(room.approxDepthM);
    if (px > 0 && dimensions > 0)
        return dimensions;
    return px > 0 ? px / 10000 : 0;
}
function sqmForPolygon(room, points) { const sourcePx = polygonArea(room.polygon || []), sourceSqm = sourcePolygonAreaSqm(room); return sourcePx > 0 && sourceSqm > 0 ? sourceSqm * polygonArea(points) / sourcePx : 0; }
function roomSourceAreaSqm(room) { return sourcePolygonAreaSqm(room); }
function validatePolygon(points) { if (!points || points.length < 3)
    return { valid: false, areaPx: 0, reason: "Polygon must contain at least three points." }; const areaPx = polygonArea(points); if (!(areaPx > EPSILON))
    return { valid: false, areaPx, reason: "Polygon area must be positive." }; if (polygonSelfIntersects(points))
    return { valid: false, areaPx, reason: "Polygon self-intersects." }; return { valid: true, areaPx }; }
function validateBedroomGeometry(room) { const polygon = validatePolygon(room.polygon); if (!polygon.valid)
    return { valid: false, areaSqm: 0, reason: polygon.reason }; const areaSqm = sqmForPolygon(room, room.polygon); if (areaSqm + 1e-6 < exports.BEDROOM_MIN_SQM)
    return { valid: false, areaSqm, reason: `Bedroom usable area is ${areaSqm.toFixed(2)} sqm; minimum is ${exports.BEDROOM_MIN_SQM.toFixed(2)} sqm.` }; if (!(room.windows || []).length)
    return { valid: false, areaSqm, reason: "Bedroom has no preserved external/openable window wall." }; if (!(room.doors || []).length)
    return { valid: false, areaSqm, reason: "Bedroom has no preserved usable access door." }; return { valid: true, areaSqm }; }
function areasConserve(source, remainder, child, tolerance = 1e-6) { const sourcePx = polygonArea(source.polygon || []), total = polygonArea(remainder) + polygonArea(child); return sourcePx > 0 && total > 0 && Math.abs(total - sourcePx) / sourcePx <= tolerance; }
function areaDifferenceSqm(source, remainder, child) { return Math.abs(sourcePolygonAreaSqm(source) - sqmForPolygon(source, remainder) - sqmForPolygon(source, child)); }
