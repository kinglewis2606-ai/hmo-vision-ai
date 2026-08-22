import assert from "node:assert/strict";
import test from "node:test";
import { buildMaximumHMOLayout } from "../lib/hmoLayoutPipeline";
import { FloorPlan, Room } from "../lib/types/floorPlan";

const room = (id: string, name: string, type: string, x: number, y: number, width: number, height: number): Room => ({ id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: width * height / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "left" }], doors: [{ wall: "top" }] });

test("different floor plans produce different geometry-backed outcomes", () => {
  const small: FloorPlan = { floors: [{ name: "Ground Floor", level: 0, rooms: [room("living", "Lounge", "living", 0, 0, 500, 400), room("kitchen", "Kitchen", "kitchen", 500, 0, 300, 300)] }] };
  const result = buildMaximumHMOLayout(small);
  assert.equal(result.bedrooms, 1);
  assert.notEqual(result.bedrooms, 6);
});
