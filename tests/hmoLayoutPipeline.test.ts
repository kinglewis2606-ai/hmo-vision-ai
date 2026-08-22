import assert from "node:assert/strict";
import test from "node:test";
import { buildMaximumHMOLayout } from "../lib/hmoLayoutPipeline";
import { applyRoomChanges } from "../lib/deterministicGeometryEngine";
import { applyBestEnsuites } from "../lib/hmoPlanner";
import { FloorPlan, Room } from "../lib/types/floorPlan";

function room(id: string, name: string, type: string, x: number, y: number, width: number, height: number, windows: any[] = [{ wall: "left" }], doors: any[] = [{ wall: "top" }]): Room {
  return { id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: (width * height) / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows, doors };
}

function planOf(rooms: Room[], grossFloorAreaSqm?: number): FloorPlan { return { floors: [{ name: "Ground Floor", level: 0, rooms }], metadata: grossFloorAreaSqm ? { grossFloorAreaSqm } : undefined }; }
function ensuiteChange(roomId: string): any { return { roomId, action: "ConvertToEnsuite", newType: "ensuite", split: { firstName: "Bedroom", firstType: "bedroom", secondName: "En-suite", secondType: "ensuite" } }; }

test("ensuite conversion always uses physical polygon carving", () => {
  const source = room("valid", "Bedroom", "bedroom", 0, 0, 400, 500);
  const result = applyRoomChanges(planOf([source]), [ensuiteChange("valid")]);
  const bedroom = result.floors[0].rooms.find(r => r.id === "valid")!;
  const ensuite = result.floors[0].rooms.find(r => r.id === "valid-split-2")!;
  assert.equal(ensuite.type, "ensuite");
  assert.ok(bedroom.approxAreaSqm! < source.approxAreaSqm!);
  assert.ok(Math.abs((bedroom.approxAreaSqm || 0) + (ensuite.approxAreaSqm || 0) - source.approxAreaSqm!) < 0.01);
  assert.notDeepEqual(bedroom.polygon, source.polygon);
  assert.ok(ensuite.polygon && ensuite.polygon.length >= 4);
});

test("ensuite carving conserves source geometry on different valid bedroom sizes", () => {
  for (const [id, width, height] of [["small", 320, 420], ["medium", 400, 500], ["large", 520, 600]] as const) {
    const source = room(id, "Bedroom", "bedroom", 0, 0, width, height);
    const result = applyRoomChanges(planOf([source]), [ensuiteChange(id)]);
    const rooms = result.floors[0].rooms;
    const bedroom = rooms.find(r => r.id === id)!;
    const ensuite = rooms.find(r => r.id === `${id}-split-2`);
    assert.ok(bedroom);
    assert.ok(ensuite);
    assert.equal(ensuite!.type, "ensuite");
    assert.ok((bedroom.approxAreaSqm || 0) > 0);
    assert.ok((ensuite!.approxAreaSqm || 0) >= 1.8);
    assert.ok((bedroom.approxAreaSqm || 0) < source.approxAreaSqm!);
    const total = (bedroom.approxAreaSqm || 0) + (ensuite!.approxAreaSqm || 0);
    assert.ok(Math.abs(total - source.approxAreaSqm!) < 0.01);
  }
});

test("valid room splits are geometry-driven and preserve area", () => {
  for (const width of [700, 900, 1200]) {
    const source = room(`split-${width}`, "Large Room", "utility", 0, 0, width, 700, [{ wall: "left" }, { wall: "right" }], [{ wall: "top" }]);
    const result = buildMaximumHMOLayout(planOf([source]), [{ roomId: source.id, action: "SplitRoom", reason: "test geometry", split: { firstName: "Bedroom 1", firstType: "bedroom", secondName: "Bedroom 2", secondType: "bedroom", direction: "vertical", firstRatio: 0.5 } }]);
    const bedrooms = result.plan.floors[0].rooms.filter(r => r.type === "bedroom");
    if (bedrooms.length === 2) {
      const total = bedrooms.reduce((sum, r) => sum + (r.approxAreaSqm || 0), 0);
      assert.ok(Math.abs(total - source.approxAreaSqm!) < 0.01);
    }
  }
});

test("invalid split with an opening crossing the proposed partition is rejected", () => {
  const source = room("blocked", "Large Room", "utility", 0, 0, 1000, 1000, [{ wall: "left" }, { wall: "right" }], [{ wall: "top", start: 450, end: 550 }]);
  const result = buildMaximumHMOLayout(planOf([source]), [{ roomId: source.id, action: "SplitRoom", split: { firstName: "Bedroom 1", firstType: "bedroom", secondName: "Bedroom 2", secondType: "bedroom", direction: "vertical", firstRatio: 0.5 } }]);
  assert.equal(result.appliedChanges.length, 0);
});

test("planner accepts a valid ensuite candidate and rejects impossible geometry", () => {
  const valid = applyBestEnsuites(planOf([room("valid", "Bedroom", "bedroom", 0, 0, 400, 500)]), [ensuiteChange("valid")]);
  assert.equal(valid.applied.length, 1);
  assert.ok(valid.plan.floors[0].rooms.some(r => r.type === "ensuite"));

  const impossible = applyBestEnsuites(planOf([room("tiny", "Bedroom", "bedroom", 0, 0, 120, 120)]), [ensuiteChange("tiny")]);
  assert.equal(impossible.applied.length, 0);
});

test("maximum HMO preserves the largest communal ground-floor room while converting viable alternatives", () => {
  const plan = planOf([
    room("dining", "Dining Room", "dining", 0, 0, 320, 300),
    room("kitchen", "Kitchen", "kitchen", 320, 0, 400, 300),
    room("lounge", "Lounge", "living", 0, 300, 360, 330),
    room("living", "Living Room", "living", 360, 300, 500, 400),
    room("bed1", "Bedroom 1", "bedroom", 0, 630, 400, 400),
    room("bed2", "Bedroom 2", "bedroom", 400, 630, 400, 400),
  ]);
  const result = buildMaximumHMOLayout(plan);
  const finalLiving = result.plan.floors[0].rooms.find(r => r.id === "living");
  const finalDining = result.plan.floors[0].rooms.find(r => r.id === "dining");
  const finalLounge = result.plan.floors[0].rooms.find(r => r.id === "lounge");
  assert.equal(finalLiving?.type, "living");
  assert.equal(finalDining?.type, "bedroom");
  assert.equal(finalLounge?.type, "bedroom");
  assert.equal(result.bedrooms, 4);
});

test("reserved gross floor area is carried through without creating area", () => {
  const result = buildMaximumHMOLayout(planOf([room("one", "Bedroom", "bedroom", 0, 0, 500, 400)], 154.6));
  assert.equal(result.grossAreaAudit.reservedGrossFloorAreaSqm, 154.6);
  assert.equal(result.grossAreaAudit.proposedGrossFloorAreaSqm, 154.6);
  assert.equal(result.plan.metadata?.grossFloorAreaSqm, 154.6);
  assert.equal(result.plan.metadata?.proposedGrossFloorAreaSqm, 154.6);
  assert.equal(result.plan.metadata?.grossAreaReserved, true);
  assert.equal(result.grossAreaAudit.roomGeometryAreaConserved, true);
});

test("maximum HMO result varies with source geometry instead of targeting a fixed bedroom count", () => {
  const oneRoom = buildMaximumHMOLayout(planOf([room("one", "Large Room", "living", 0, 0, 500, 400)]));
  const twoRoom = buildMaximumHMOLayout(planOf([room("a", "Room A", "bedroom", 0, 0, 400, 500), room("b", "Room B", "bedroom", 400, 0, 400, 500)]));
  assert.notEqual(oneRoom.plan.floors[0].rooms.length, twoRoom.plan.floors[0].rooms.length);
});
