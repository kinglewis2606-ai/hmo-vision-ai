"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const deterministicGeometryEngine_1 = require("../lib/deterministicGeometryEngine");
const geometryValidation_1 = require("../lib/geometryValidation");
const rectangle = (x, y, width, height) => [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];
(0, node_test_1.default)("rejects a split when either resulting bedroom loses required openings", () => {
    const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
                        id: "room-a", name: "Large Bedroom", type: "bedroom", x: 0, y: 0, width: 800, height: 400,
                        polygon: rectangle(0, 0, 800, 400), approxAreaSqm: 16, adjacentRooms: [], shape: "rectangle",
                        windows: [{ wall: "top" }], doors: [{ wall: "bottom" }],
                    }] }] };
    const result = (0, deterministicGeometryEngine_1.applyRoomChanges)(plan, [{ roomId: "room-a", action: "SplitRoom", split: { firstType: "bedroom", secondType: "bedroom", direction: "horizontal", firstRatio: 0.5 } }]);
    strict_1.default.equal(result.floors[0].rooms.length, 1);
    strict_1.default.equal(result.floors[0].rooms[0].id, "room-a");
});
(0, node_test_1.default)("accepts a genuine split only when both resulting rooms retain separate openings", () => {
    const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [{
                        id: "room-b", name: "Large Bedroom", type: "bedroom", x: 0, y: 0, width: 800, height: 400,
                        polygon: rectangle(0, 0, 800, 400), approxAreaSqm: 16, adjacentRooms: [], shape: "rectangle",
                        windows: [{ wall: "top", start: 80, end: 260 }, { wall: "bottom", start: 540, end: 720 }],
                        doors: [{ wall: "left", start: 60, end: 140 }, { wall: "right", start: 260, end: 340 }],
                    }] }] };
    const result = (0, deterministicGeometryEngine_1.applyRoomChanges)(plan, [{ roomId: "room-b", action: "SplitRoom", split: { firstType: "bedroom", secondType: "bedroom", direction: "horizontal", firstRatio: 0.5 } }]);
    strict_1.default.equal(result.floors[0].rooms.length, 2);
    strict_1.default.ok(result.floors[0].rooms.every((room) => room.type === "bedroom" && (room.windows?.length ?? 0) > 0 && (room.doors?.length ?? 0) > 0 && room.approxAreaSqm >= geometryValidation_1.BEDROOM_MIN_SQM));
    strict_1.default.equal(Math.round(result.floors[0].rooms.reduce((sum, room) => sum + (0, geometryValidation_1.polygonArea)(room.polygon), 0)), 320000);
});
(0, node_test_1.default)("carves a real ensuite from a final bedroom polygon without consuming the principal window", () => {
    const sourcePolygon = rectangle(0, 0, 600, 400);
    const plan = { floors: [{ name: "First Floor", level: 1, rooms: [{
                        id: "room-c", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 600, height: 400,
                        polygon: sourcePolygon, approxAreaSqm: 12, approxWidthM: 3, approxDepthM: 2, adjacentRooms: [], shape: "rectangle",
                        windows: [{ wall: "top" }], doors: [{ wall: "left" }],
                    }] }] };
    const result = (0, deterministicGeometryEngine_1.applyRoomChanges)(plan, [{ roomId: "room-c", action: "ConvertToEnsuite", newType: "ensuite" }]);
    strict_1.default.equal(result.floors[0].rooms.length, 2);
    const bedroom = result.floors[0].rooms.find((room) => room.id === "room-c");
    const ensuite = result.floors[0].rooms.find((room) => room.type === "ensuite");
    strict_1.default.ok(bedroom && ensuite);
    strict_1.default.ok(bedroom.approxAreaSqm >= geometryValidation_1.BEDROOM_MIN_SQM);
    strict_1.default.ok(ensuite.approxAreaSqm > 0);
    strict_1.default.ok(ensuite.polygon.every((point) => (0, geometryValidation_1.pointInPolygon)(point, sourcePolygon)));
    const sourceArea = (0, geometryValidation_1.polygonArea)(sourcePolygon);
    strict_1.default.ok(Math.abs(((0, geometryValidation_1.polygonArea)(bedroom.polygon) + (0, geometryValidation_1.polygonArea)(ensuite.polygon)) - sourceArea) / sourceArea <= 0.02);
    strict_1.default.ok(bedroom.windows.some((window) => window.wall === "top"));
    strict_1.default.ok(bedroom.doors.some((door) => door.wall === "left"));
});
(0, node_test_1.default)("finds an ensuite when the bedroom has the common top-door / bottom-window arrangement", () => {
    const sourcePolygon = rectangle(0, 0, 700, 500);
    const plan = { floors: [{ name: "Second Floor", level: 2, rooms: [{
                        id: "room-d", name: "Bedroom 4", type: "bedroom", x: 0, y: 0, width: 700, height: 500,
                        polygon: sourcePolygon, approxAreaSqm: 16.9, approxWidthM: 3.58, approxDepthM: 4.42, adjacentRooms: [], shape: "rectangle",
                        windows: [{ wall: "bottom" }], doors: [{ wall: "top" }],
                    }] }] };
    const result = (0, deterministicGeometryEngine_1.applyRoomChanges)(plan, [{ roomId: "room-d", action: "ConvertToEnsuite", newType: "ensuite" }]);
    strict_1.default.equal(result.floors[0].rooms.length, 2, "ensuite should be carved rather than leaving the bedroom unchanged");
    const bedroom = result.floors[0].rooms.find((room) => room.id === "room-d");
    const ensuite = result.floors[0].rooms.find((room) => room.type === "ensuite");
    strict_1.default.ok(bedroom && ensuite);
    strict_1.default.ok(bedroom.approxAreaSqm >= geometryValidation_1.BEDROOM_MIN_SQM);
    strict_1.default.ok(ensuite.approxAreaSqm >= 1.8);
    strict_1.default.ok(bedroom.windows.some((window) => window.wall === "bottom"));
    strict_1.default.ok(bedroom.doors.some((door) => door.wall === "top"));
    strict_1.default.ok((0, geometryValidation_1.polygonArea)(bedroom.polygon) < (0, geometryValidation_1.polygonArea)(sourcePolygon), "bedroom polygon must physically shrink around the ensuite");
});
