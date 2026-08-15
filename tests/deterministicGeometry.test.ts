import test from "node:test";
import assert from "node:assert/strict";
import { applyRoomChanges } from "../lib/deterministicGeometryEngine";
import { polygonArea, pointInPolygon, BEDROOM_MIN_SQM } from "../lib/geometryValidation";

const rectangle = (x: number, y: number, width: number, height: number) => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];

test("rejects a split when either resulting bedroom loses required openings", () => {
  const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
    id: "room-a", name: "Large Bedroom", type: "bedroom", x: 0, y: 0, width: 800, height: 400,
    polygon: rectangle(0, 0, 800, 400), approxAreaSqm: 16, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "bottom" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-a", action: "SplitRoom", split: { firstType: "bedroom", secondType: "bedroom", direction: "horizontal", firstRatio: 0.5 } }]);
  assert.equal(result.floors[0].rooms.length, 1);
  assert.equal(result.floors[0].rooms[0].id, "room-a");
});

test("accepts a genuine split only when both resulting rooms remain valid bedrooms", () => {
  const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
    id: "room-b", name: "Large Bedroom", type: "bedroom", x: 0, y: 0, width: 800, height: 400,
    polygon: rectangle(0, 0, 800, 400), approxAreaSqm: 16, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }, { wall: "bottom" as const }],
    doors: [{ wall: "left" as const }, { wall: "right" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-b", action: "SplitRoom", split: { firstType: "bedroom", secondType: "bedroom", direction: "horizontal", firstRatio: 0.5 } }]);
  assert.equal(result.floors[0].rooms.length, 2);
  assert.ok(result.floors[0].rooms.every((room: any) => room.type === "bedroom" && (room.windows?.length ?? 0) > 0 && (room.doors?.length ?? 0) > 0 && room.approxAreaSqm >= BEDROOM_MIN_SQM));
  assert.equal(Math.round(result.floors[0].rooms.reduce((sum: number, room: any) => sum + polygonArea(room.polygon), 0)), 320000);
});

test("carves the ensuite from the bedroom and reduces the bedroom area", () => {
  const sourcePolygon = rectangle(0, 0, 600, 500);
  const plan = { floors: [{ name: "First Floor", level: 1, rooms: [{
    id: "room-c", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 600, height: 500,
    polygon: sourcePolygon, approxAreaSqm: 15, approxWidthM: 3, approxDepthM: 2.5, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "left" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-c", action: "ConvertToEnsuite", newType: "ensuite" }]);
  assert.equal(result.floors[0].rooms.length, 2);
  const bedroom: any = result.floors[0].rooms.find((room: any) => room.id === "room-c");
  const ensuite: any = result.floors[0].rooms.find((room: any) => room.type === "ensuite");
  assert.ok(bedroom && ensuite);
  assert.ok(bedroom.approxAreaSqm >= BEDROOM_MIN_SQM);
  assert.ok(bedroom.approxAreaSqm < 15, "bedroom area must be reduced after carving the ensuite");
  assert.ok(ensuite.approxAreaSqm >= 2.52);
  assert.ok(ensuite.approxWidthM >= 1.2 || ensuite.approxDepthM >= 1.2);
  assert.ok((ensuite.approxWidthM >= 1.2 && ensuite.approxDepthM >= 2.1) || (ensuite.approxWidthM >= 2.1 && ensuite.approxDepthM >= 1.2));
  assert.ok(ensuite.polygon.every((point: any) => pointInPolygon(point, sourcePolygon)));
  const sourceArea = polygonArea(sourcePolygon);
  assert.ok(Math.abs((polygonArea(bedroom.polygon) + polygonArea(ensuite.polygon)) - sourceArea) / sourceArea <= 0.002);
  assert.ok(bedroom.windows.some((window: any) => window.wall === "top"));
  assert.ok(bedroom.doors.some((door: any) => door.wall === "left"));
});

test("rejects an ensuite that would consume the only external window wall", () => {
  const plan = { floors: [{ name: "First Floor", level: 1, rooms: [{
    id: "room-d", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 600, height: 500,
    polygon: rectangle(0, 0, 600, 500), approxAreaSqm: 15, approxWidthM: 3, approxDepthM: 2.5, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "bottom" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-d", action: "ConvertToEnsuite", newType: "ensuite" }]);
  assert.equal(result.floors[0].rooms.length, 1);
  assert.equal(result.floors[0].rooms[0].type, "bedroom");
});

test("stairs and circulation cannot be converted into bedrooms", () => {
  const plan = { floors: [{ name: "First Floor", level: 1, rooms: [{
    id: "stairs", name: "Stairs / Landing", type: "circulation", x: 0, y: 0, width: 900, height: 500,
    polygon: rectangle(0, 0, 900, 500), approxAreaSqm: 12, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "bottom" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "stairs", action: "ConvertToBedroom", newType: "bedroom" }]);
  assert.equal(result.floors[0].rooms[0].type, "circulation");
});
