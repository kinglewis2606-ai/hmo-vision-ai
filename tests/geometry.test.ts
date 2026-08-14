import test from "node:test";
import assert from "node:assert/strict";
import {
  areasConserve,
  BEDROOM_MIN_SQM,
  pointInPolygon,
  polygonArea,
  polygonContainsPolygon,
  sqmForPolygon,
  validateBedroomGeometry,
  validatePolygon,
} from "../lib/geometryValidation";

const rect = (x: number, y: number, width: number, height: number) => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];
const room = (areaSqm = 12) => ({
  id: "room-1", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 400, height: 300,
  polygon: rect(0, 0, 400, 300), approxAreaSqm: areaSqm, adjacentRooms: [], shape: "rectangle",
  windows: [{ wall: "top" as const }], doors: [{ wall: "bottom" as const }],
});

test("validates polygon cardinality, positive area and self-intersection", () => {
  assert.equal(validatePolygon(rect(0, 0, 100, 80)).valid, true);
  assert.equal(validatePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }]).valid, false);
  assert.equal(validatePolygon([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }]).valid, false);
});

test("checks containment and point membership", () => {
  const outer = rect(0, 0, 400, 300), inner = rect(0, 0, 120, 100);
  assert.equal(pointInPolygon({ x: 50, y: 50 }, outer), true);
  assert.equal(polygonContainsPolygon(outer, inner), true);
  assert.equal(polygonContainsPolygon(inner, outer), false);
});

test("preserves area when a room is carved into remainder plus ensuite", () => {
  const source = room(12), child = rect(0, 0, 120, 100);
  const remainder = [{ x: 120, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 100 }, { x: 120, y: 100 }];
  assert.equal(areasConserve(source as any, remainder, child), true);
  assert.equal(Math.round(polygonArea(remainder) + polygonArea(child)), polygonArea(source.polygon));
});

test("enforces the 6.51 sqm bedroom rule and openings", () => {
  assert.equal(validateBedroomGeometry(room(8) as any).valid, true);
  assert.ok(validateBedroomGeometry(room(8) as any).areaSqm >= BEDROOM_MIN_SQM);
  assert.equal(validateBedroomGeometry(room(6) as any).valid, false);
  assert.equal(validateBedroomGeometry({ ...room(8), windows: [] } as any).valid, false);
  assert.equal(validateBedroomGeometry({ ...room(8), doors: [] } as any).valid, false);
});

test("converts polygon area proportionally to square metres", () => {
  const source = room(12), half = rect(0, 0, 200, 300);
  assert.equal(Number(sqmForPolygon(source as any, half).toFixed(2)), 6);
});
