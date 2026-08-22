import assert from "node:assert/strict";
import test from "node:test";
import { buildTargetedHMOLayout } from "../lib/targetedHMOLayout";
import { FloorPlan, Room } from "../lib/types/floorPlan";

function room(id: string, name: string, type: string, x: number, y: number, width: number, height: number): Room {
  return { id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: width * height / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "left" }], doors: [{ wall: "top" }] };
}

const plan = (rooms: Room[]): FloorPlan => ({ floors: [{ name: "Ground Floor", level: 0, rooms }] });

test("targeted builder never exceeds the requested bedroom count", () => {
  const source = plan([
    room("living", "Living Room", "living", 0, 0, 700, 500),
    room("kitchen", "Kitchen", "kitchen", 700, 0, 400, 400),
    room("bed1", "Bedroom 1", "bedroom", 0, 500, 400, 500),
    room("bed2", "Bedroom 2", "bedroom", 400, 500, 400, 500),
    room("bed3", "Bedroom 3", "bedroom", 800, 500, 400, 500)
  ]);
  const result = buildTargetedHMOLayout(source, [], 4);
  assert.ok(result.bedrooms <= 4);
  assert.ok(result.bedrooms >= 3);
});

test("targeted builder can preserve an existing count when the target is already met", () => {
  const source = plan([
    room("bed1", "Bedroom 1", "bedroom", 0, 0, 400, 500),
    room("bed2", "Bedroom 2", "bedroom", 400, 0, 400, 500),
    room("bed3", "Bedroom 3", "bedroom", 800, 0, 400, 500)
  ]);
  const result = buildTargetedHMOLayout(source, [], 3);
  assert.equal(result.bedrooms, 3);
});

test("targeted builder does not claim an impossible higher count", () => {
  const source = plan([room("bed1", "Bedroom 1", "bedroom", 0, 0, 400, 500)]);
  const result = buildTargetedHMOLayout(source, [], 8);
  assert.ok(result.bedrooms < 8);
  assert.equal(result.targetBedrooms, 8);
});
