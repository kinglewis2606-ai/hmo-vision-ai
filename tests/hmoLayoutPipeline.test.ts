import assert from "node:assert/strict";
import test from "node:test";
import { buildMaximumHMOLayout } from "../lib/hmoLayoutPipeline";
import { applyRoomChanges } from "../lib/deterministicGeometryEngine";
import { applyBestEnsuites } from "../lib/hmoPlanner";
import { FloorPlan, Room } from "../lib/types/floorPlan";

function room(id: string, name: string, type: string, x: number, y: number, width: number, height: number): Room {
  return { id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: (width * height) / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "left" }], doors: [{ wall: "top" }] };
}

function ensuiteChange(roomId: string, name = "Bedroom"): any { return { roomId, action: "ConvertToEnsuite", newType: "ensuite", split: { firstName: name, firstType: "bedroom", secondName: "En-suite", secondType: "ensuite" } }; }

test("reference-style property produces six bedrooms and physically carved ensuites", () => {
  const plan: FloorPlan = { floors: [
    { name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 400, 400), room("gf-living", "Living Room", "living", 400, 0, 400, 400), room("gf-dining", "Dining Room", "dining", 0, 400, 400, 300), room("gf-kitchen", "Kitchen", "kitchen", 400, 400, 400, 300)] },
    { name: "First Floor", level: 1, rooms: [room("ff-bed-1", "Bedroom 1", "bedroom", 0, 0, 350, 400), room("ff-bed-2", "Bedroom 2", "bedroom", 350, 0, 350, 400), room("ff-shower", "Shower Room", "bathroom", 700, 0, 100, 200)] },
    { name: "Second Floor", level: 2, rooms: [room("sf-bed-1", "Bedroom 3", "bedroom", 0, 0, 350, 400), room("sf-bed-2", "Bedroom 4", "bedroom", 350, 0, 350, 400)] },
  ] };
  const result = buildMaximumHMOLayout(plan);
  console.log("REFERENCE_RESULT", JSON.stringify({ bedrooms: result.bedrooms, ensuites: result.ensuites, applied: result.appliedChanges, rejected: result.rejectedChanges, rooms: result.plan.floors.flatMap(f => f.rooms).map(r => ({ id: r.id, type: r.type, name: r.name, area: r.approxAreaSqm })) }));
  assert.equal(result.bedrooms, 6);
  assert.equal(result.ensuites, 6);
  for (const id of result.bedroomIds) assert.ok(result.plan.floors.flatMap(f => f.rooms).some(r => r.id === `${id}-split-2` && /ensuite/i.test(`${r.type} ${r.name}`)));
});

test("direct ensuite geometry works on a normal 14 sqm bedroom", () => {
  const source = room("direct-bedroom", "Bedroom", "bedroom", 0, 0, 350, 400);
  const plan: FloorPlan = { floors: [{ name: "First Floor", level: 1, rooms: [source] }] };
  const result = applyRoomChanges(plan, [ensuiteChange(source.id)]);
  const rooms = result.floors[0].rooms;
  console.log("DIRECT_ENSUITE_RESULT", JSON.stringify(rooms.map(r => ({ id: r.id, type: r.type, area: r.approxAreaSqm, polygon: r.polygon }))));
  assert.ok(rooms.some(r => r.id === `${source.id}-split-2` && r.type === "ensuite"));
});

test("applyBestEnsuites accepts a direct valid ensuite candidate", () => {
  const source = room("planner-bedroom", "Bedroom", "bedroom", 0, 0, 350, 400);
  const plan: FloorPlan = { floors: [{ name: "First Floor", level: 1, rooms: [source] }] };
  const result = applyBestEnsuites(plan, [ensuiteChange(source.id)]);
  console.log("BEST_ENSUITE_RESULT", JSON.stringify({ applied: result.applied, rejected: result.rejected, rooms: result.plan.floors[0].rooms.map(r => ({ id: r.id, type: r.type, area: r.approxAreaSqm })) }));
  assert.equal(result.applied.length, 1);
  assert.ok(result.plan.floors[0].rooms.some(r => r.type === "ensuite"));
});

test("different source geometry changes the maximum result", () => {
  const plan: FloorPlan = { floors: [{ name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 500, 400), room("gf-kitchen", "Kitchen", "kitchen", 500, 0, 300, 300)] }] };
  const result = buildMaximumHMOLayout(plan);
  assert.equal(result.bedrooms, 1);
  assert.notEqual(result.bedrooms, 6);
});

test("rejects an AI room split when the source has only one usable access door", () => {
  const source = room("ai-split-source", "Large Utility", "utility", 0, 0, 1000, 1000);
  source.windows = [{ wall: "left" }, { wall: "right" }];
  const plan: FloorPlan = { floors: [{ name: "Ground Floor", level: 0, rooms: [source] }] };
  const result = buildMaximumHMOLayout(plan, [{ roomId: "ai-split-source", action: "SplitRoom", reason: "AI-selected conversion strategy", split: { firstName: "Bedroom 1", firstType: "bedroom", secondName: "Bedroom 2", secondType: "bedroom", direction: "vertical", firstRatio: 0.5 } }]);
  assert.equal(result.bedrooms, 0);
  assert.equal(result.appliedChanges.length, 0);
});
