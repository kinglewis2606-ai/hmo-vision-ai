import assert from "node:assert/strict";
import test from "node:test";
import { findMaximumHMO, isBedroom, finalRoomSummary } from "../lib/hmoPlanner";
import { FloorPlan, Room } from "../lib/types/floorPlan";

function room(id: string, name: string, type: string, x: number, y: number, width: number, height: number, approxAreaSqm = (width * height) / 10000): Room {
  return { id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "bottom" }], doors: [{ wall: "top" }] };
}

test("maximum HMO preserves the largest ground-floor living room and converts the other viable living room", () => {
  const plan: FloorPlan = { floors: [
    { name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 340, 340), room("gf-living", "Living Room", "living", 340, 0, 440, 340), room("gf-kitchen", "Kitchen", "kitchen", 0, 340, 280, 300)] },
    { name: "First Floor", level: 1, rooms: [room("ff-bed", "Bedroom 1", "bedroom", 0, 0, 400, 400)] },
  ] };
  const result = findMaximumHMO(plan);
  assert.equal(result.bedrooms, 2);
  assert.equal(result.appliedChanges.length, 1);
});

test("a single ground-floor living room is retained as communal space rather than fabricated into a bedroom", () => {
  const plan: FloorPlan = { floors: [{ name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 500, 400), room("gf-kitchen", "Kitchen", "kitchen", 500, 0, 300, 300)] }] };
  const result = findMaximumHMO(plan);
  assert.equal(result.bedrooms, 0);
  assert.notEqual(result.bedrooms, 6);
});

test("does not count an existing bedroom below the 6.51 sqm minimum", () => {
  const small = room("small-bed", "Bedroom 1", "bedroom", 0, 0, 400, 300, 6);
  assert.equal(isBedroom(small), false);
  assert.equal(finalRoomSummary({ floors: [{ name: "First Floor", level: 1, rooms: [small] }] } as any).bedrooms, 0);
});

test("counts an existing bedroom when geometry and openings pass the bedroom rule", () => {
  const valid = room("valid-bed", "Bedroom 1", "bedroom", 0, 0, 400, 300, 8);
  assert.equal(isBedroom(valid), true);
  assert.equal(finalRoomSummary({ floors: [{ name: "First Floor", level: 1, rooms: [valid] }] } as any).bedrooms, 1);
});
