import assert from "node:assert/strict";
import test from "node:test";
import { findMaximumHMO } from "../lib/hmoPlanner";
import { FloorPlan, Room } from "../lib/types/floorPlan";

function room(id: string, name: string, type: string, x: number, y: number, width: number, height: number): Room {
  return { id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: (width * height) / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "bottom" }], doors: [{ wall: "top" }] };
}

test("maximum HMO considers every viable ground-floor living room", () => {
  const plan: FloorPlan = { floors: [
    { name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 340, 340), room("gf-living", "Living Room", "living", 340, 0, 440, 340), room("gf-kitchen", "Kitchen", "kitchen", 0, 340, 280, 300)] },
    { name: "First Floor", level: 1, rooms: [room("ff-bed", "Bedroom 1", "bedroom", 0, 0, 400, 400)] },
  ] };
  const result = findMaximumHMO(plan);
  assert.equal(result.bedrooms, 3);
  assert.equal(result.appliedChanges.length, 2);
});

test("different geometry produces a different maximum HMO outcome", () => {
  const plan: FloorPlan = { floors: [{ name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 500, 400), room("gf-kitchen", "Kitchen", "kitchen", 500, 0, 300, 300)] }] };
  const result = findMaximumHMO(plan);
  assert.equal(result.bedrooms, 1);
  assert.notEqual(result.bedrooms, 6);
});
