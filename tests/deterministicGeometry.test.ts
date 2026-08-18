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

test("carves a real ensuite from a final bedroom polygon without consuming the principal window", () => {
  const sourcePolygon = rectangle(0, 0, 600, 400);
  const plan = { floors: [{ name: "First Floor", level: 1, rooms: [{
    id: "room-c", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 600, height: 400,
    polygon: sourcePolygon, approxAreaSqm: 12, approxWidthM: 3, approxDepthM: 2, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "left" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-c", action: "ConvertToEnsuite", newType: "ensuite" }]);
  assert.equal(result.floors[0].rooms.length, 2);
  const bedroom: any = result.floors[0].rooms.find((room: any) => room.id === "room-c");
  const ensuite: any = result.floors[0].rooms.find((room: any) => room.type === "ensuite");
  assert.ok(bedroom && ensuite);
  assert.ok(bedroom.approxAreaSqm >= BEDROOM_MIN_SQM);
  assert.ok(ensuite.approxAreaSqm > 0);
  assert.ok(ensuite.polygon.every((point: any) => pointInPolygon(point, sourcePolygon)));
  const sourceArea = polygonArea(sourcePolygon);
  assert.ok(Math.abs((polygonArea(bedroom.polygon) + polygonArea(ensuite.polygon)) - sourceArea) / sourceArea <= 0.02);
  assert.ok(bedroom.windows.some((window: any) => window.wall === "top"));
  assert.ok(bedroom.doors.some((door: any) => door.wall === "left"));
});

test("finds an ensuite when the bedroom has the common top-door / bottom-window arrangement", () => {
  const sourcePolygon = rectangle(0, 0, 700, 500);
  const plan = { floors: [{ name: "Second Floor", level: 2, rooms: [{
    id: "room-d", name: "Bedroom 4", type: "bedroom", x: 0, y: 0, width: 700, height: 500,
    polygon: sourcePolygon, approxAreaSqm: 16.9, approxWidthM: 3.58, approxDepthM: 4.42, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "bottom" as const }], doors: [{ wall: "top" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-d", action: "ConvertToEnsuite", newType: "ensuite" }]);
  assert.equal(result.floors[0].rooms.length, 2, "ensuite should be carved rather than leaving the bedroom unchanged");
  const bedroom: any = result.floors[0].rooms.find((room: any) => room.id === "room-d");
  const ensuite: any = result.floors[0].rooms.find((room: any) => room.type === "ensuite");
  assert.ok(bedroom && ensuite);
  assert.ok(bedroom.approxAreaSqm >= BEDROOM_MIN_SQM);
  assert.ok(ensuite.approxAreaSqm >= 1.8);
  assert.ok(bedroom.windows.some((window: any) => window.wall === "bottom"));
  assert.ok(bedroom.doors.some((door: any) => door.wall === "top"));
  assert.ok(polygonArea(bedroom.polygon) < polygonArea(sourcePolygon), "bedroom polygon must physically shrink around the ensuite");
});
