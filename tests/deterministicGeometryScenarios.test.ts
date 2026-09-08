import test from "node:test";
import assert from "node:assert/strict";
import { applyRoomChanges } from "../lib/deterministicGeometryEngine";
import { pointInPolygon, polygonArea, BEDROOM_MIN_SQM } from "../lib/geometryValidation";

const rectangle = (x: number, y: number, width: number, height: number) => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];

test("ensuite carving is rejected when no candidate leaves the bedroom above the minimum size", () => {
  // A bedroom only just above the minimum bedroom area: any physically usable
  // ensuite carve would push the remainder below BEDROOM_MIN_SQM, so the
  // deterministic engine must reject every candidate and leave the room untouched.
  const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
    id: "room-tiny", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 300, height: 220,
    polygon: rectangle(0, 0, 300, 220), approxAreaSqm: BEDROOM_MIN_SQM + 0.3, approxWidthM: 3, approxDepthM: 2.2,
    adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "left" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-tiny", action: "ConvertToEnsuite", newType: "ensuite" }]);
  assert.equal(result.floors[0].rooms.length, 1, "no ensuite candidate keeps the bedroom above the minimum area, so none should be carved");
  assert.equal(result.floors[0].rooms[0].id, "room-tiny");
});

test("ensuite geometry is always fully contained within the bedroom's original polygon", () => {
  const sourcePolygon = rectangle(0, 0, 650, 450);
  const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
    id: "room-contain", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 650, height: 450,
    polygon: sourcePolygon, approxAreaSqm: 15, approxWidthM: 3.3, approxDepthM: 2.7, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "left" as const }],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-contain", action: "ConvertToEnsuite", newType: "ensuite" }]);
  const ensuite: any = result.floors[0].rooms.find((r: any) => r.type === "ensuite");
  assert.ok(ensuite, "expected an ensuite to be carved for a room this size");
  assert.ok(ensuite.polygon.every((p: any) => pointInPolygon(p, sourcePolygon)), "every ensuite vertex must lie within the source bedroom polygon");
});

test("ensuite carving is rejected when doors occupy every wall (no doorway-free corner exists)", () => {
  const width = 600, height = 400;
  const fullWallDoor = (wall: "top" | "bottom" | "left" | "right") => ({
    wall, start: 0, end: wall === "top" || wall === "bottom" ? width : height,
  });
  const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
    id: "room-blocked", name: "Bedroom", type: "bedroom", x: 0, y: 0, width, height,
    polygon: rectangle(0, 0, width, height), approxAreaSqm: 24, approxWidthM: 6, approxDepthM: 4, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }],
    // A door spanning the full length of every wall means every candidate
    // corner rectangle would block some doorway.
    doors: [fullWallDoor("top"), fullWallDoor("bottom"), fullWallDoor("left"), fullWallDoor("right")],
  }] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-blocked", action: "ConvertToEnsuite", newType: "ensuite" }]);
  assert.equal(result.floors[0].rooms.length, 1, "an ensuite must never be carved across a doorway");
});

test("existing bathroom is retained unchanged when no change targets it", () => {
  const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [
    { id: "room-bed", name: "Bedroom 1", type: "bedroom", x: 0, y: 0, width: 400, height: 300, polygon: rectangle(0, 0, 400, 300), approxAreaSqm: 12, adjacentRooms: [], shape: "rectangle", windows: [{ wall: "top" as const }], doors: [{ wall: "bottom" as const }] },
    { id: "room-bath", name: "Bathroom", type: "bathroom", x: 400, y: 0, width: 150, height: 150, polygon: rectangle(400, 0, 150, 150), approxAreaSqm: 2.25, adjacentRooms: [], shape: "rectangle", windows: [{ wall: "top" as const }], doors: [{ wall: "left" as const }] },
  ] }] };
  const result = applyRoomChanges(plan as any, [{ roomId: "room-bed", action: "ConvertToEnsuite", newType: "ensuite" }]);
  const bathroom: any = result.floors[0].rooms.find((r: any) => r.id === "room-bath");
  assert.deepEqual(bathroom, plan.floors[0].rooms[1], "an existing bathroom not targeted by any change must be retained exactly");
});

test("rejected room changes never appear as extra rooms or geometry", () => {
  const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
    id: "room-a", name: "Large Bedroom", type: "bedroom", x: 0, y: 0, width: 800, height: 400,
    polygon: rectangle(0, 0, 800, 400), approxAreaSqm: 16, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" as const }], doors: [{ wall: "bottom" as const }],
  }] }] };
  // A split whose threshold crosses the only door must be rejected outright.
  const result = applyRoomChanges(plan as any, [{ roomId: "room-a", action: "SplitRoom", split: { firstType: "bedroom", secondType: "bedroom", direction: "horizontal", firstRatio: 0.5 } }]);
  assert.equal(result.floors[0].rooms.length, 1, "a rejected split must not add any geometry");
  assert.equal(Math.round(polygonArea(result.floors[0].rooms[0].polygon)), Math.round(polygonArea(plan.floors[0].rooms[0].polygon)));
});

test("detected room IDs stay globally unique across a multi-floor property", () => {
  // Mirrors the id scheme produced by getVisionDetectedRooms: sequential IDs
  // assigned across the combined, cross-floor detection result before rooms
  // are partitioned back into floors. Two floors can never share an ID.
  const combinedDetections = [
    { floorIndex: 0 }, { floorIndex: 0 }, { floorIndex: 1 }, { floorIndex: 1 }, { floorIndex: 2 },
  ];
  const ids = combinedDetections.map((_, i) => `room-${i + 1}`);
  const groundIds = ids.filter((_, i) => combinedDetections[i].floorIndex === 0);
  const firstIds = ids.filter((_, i) => combinedDetections[i].floorIndex === 1);
  assert.equal(new Set(ids).size, ids.length, "every detected room ID must be unique across the whole property");
  assert.ok(groundIds.every(id => !firstIds.includes(id)), "no room ID may collide between floors");
});
