import assert from "node:assert/strict";
import test from "node:test";
import { buildMaximumHMOLayout } from "../lib/hmoLayoutPipeline";
import { FloorPlan, Room } from "../lib/types/floorPlan";

const room = (id: string, name: string, type: string, x: number, y: number, width: number, height: number): Room => ({ id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: width * height / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "left" }], doors: [{ wall: "top" }] });

function assertGeometryBackedResult(plan: FloorPlan) {
  const result = buildMaximumHMOLayout(plan);
  const rooms = result.plan.floors.flatMap(f => f.rooms);
  assert.equal(result.plan.floors.length, plan.floors.length);
  assert.ok(result.bedrooms >= 0);
  assert.equal(result.bedrooms, rooms.filter(r => r.type === "bedroom").length);
  assert.equal(result.ensuites, rooms.filter(r => /ensuite/i.test(r.type || "") || /en-suite/i.test(r.name || "")).length);
  for (const r of rooms) {
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.width) && Number.isFinite(r.height));
    assert.ok(r.width > 0 && r.height > 0);
    assert.ok(Array.isArray(r.polygon) && r.polygon.length >= 3);
    assert.ok(Number.isFinite(r.approxAreaSqm || 0) && (r.approxAreaSqm || 0) >= 0);
  }
  return result;
}

test("pipeline accepts different property geometries without a fixed bedroom target", () => {
  const plans: FloorPlan[] = [
    { floors: [{ name: "Ground", level: 0, rooms: [room("living-a", "Lounge", "living", 0, 0, 500, 400), room("kitchen-a", "Kitchen", "kitchen", 500, 0, 300, 300)] }] },
    { floors: [{ name: "Ground", level: 0, rooms: [room("living-b", "Living Room", "living", 0, 0, 700, 450), room("kitchen-b", "Kitchen", "kitchen", 0, 450, 350, 300), room("bed-b", "Bedroom", "bedroom", 350, 450, 350, 300)] }] },
    { floors: [{ name: "Ground", level: 0, rooms: [room("bed-c1", "Bedroom 1", "bedroom", 0, 0, 400, 500), room("bed-c2", "Bedroom 2", "bedroom", 400, 0, 400, 500), room("bath-c", "Bathroom", "bathroom", 800, 0, 200, 250)] }, { name: "First", level: 1, rooms: [room("bed-c3", "Bedroom 3", "bedroom", 0, 0, 450, 500)] }] }
  ];

  for (const plan of plans) assertGeometryBackedResult(plan);
});

test("source geometry changes the result rather than forcing a reference-property count", () => {
  const oneRoom = assertGeometryBackedResult({ floors: [{ name: "Ground", level: 0, rooms: [room("one", "Living Room", "living", 0, 0, 500, 400)] }] });
  const threeRoom = assertGeometryBackedResult({ floors: [{ name: "Ground", level: 0, rooms: [room("one", "Bedroom 1", "bedroom", 0, 0, 400, 500), room("two", "Bedroom 2", "bedroom", 400, 0, 400, 500), room("three", "Kitchen", "kitchen", 800, 0, 300, 300)] }] });
  assert.notEqual(oneRoom.bedrooms, 6);
  assert.notEqual(threeRoom.bedrooms, 6);
});
