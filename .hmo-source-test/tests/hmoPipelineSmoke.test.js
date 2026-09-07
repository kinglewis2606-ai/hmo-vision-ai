"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const hmoLayoutPipeline_1 = require("../lib/hmoLayoutPipeline");
const room = (id, name, type, x, y, width, height) => ({ id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: width * height / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "left" }], doors: [{ wall: "top" }] });
function assertGeometryBackedResult(plan) {
    const result = (0, hmoLayoutPipeline_1.buildMaximumHMOLayout)(plan);
    const rooms = result.plan.floors.flatMap(f => f.rooms);
    strict_1.default.equal(result.plan.floors.length, plan.floors.length);
    strict_1.default.ok(result.bedrooms >= 0);
    strict_1.default.equal(result.bedrooms, rooms.filter(r => r.type === "bedroom").length);
    strict_1.default.equal(result.ensuites, rooms.filter(r => /ensuite/i.test(r.type || "") || /en-suite/i.test(r.name || "")).length);
    for (const r of rooms) {
        strict_1.default.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.width) && Number.isFinite(r.height));
        strict_1.default.ok(r.width > 0 && r.height > 0);
        strict_1.default.ok(Array.isArray(r.polygon) && r.polygon.length >= 3);
        strict_1.default.ok(Number.isFinite(r.approxAreaSqm || 0) && (r.approxAreaSqm || 0) >= 0);
    }
    return result;
}
(0, node_test_1.default)("pipeline accepts different property geometries without a fixed bedroom target", () => {
    const plans = [
        { floors: [{ name: "Ground", level: 0, rooms: [room("living-a", "Lounge", "living", 0, 0, 500, 400), room("kitchen-a", "Kitchen", "kitchen", 500, 0, 300, 300)] }] },
        { floors: [{ name: "Ground", level: 0, rooms: [room("living-b", "Living Room", "living", 0, 0, 700, 450), room("kitchen-b", "Kitchen", "kitchen", 0, 450, 350, 300), room("bed-b", "Bedroom", "bedroom", 350, 450, 350, 300)] }] },
        { floors: [{ name: "Ground", level: 0, rooms: [room("bed-c1", "Bedroom 1", "bedroom", 0, 0, 400, 500), room("bed-c2", "Bedroom 2", "bedroom", 400, 0, 400, 500), room("bath-c", "Bathroom", "bathroom", 800, 0, 200, 250)] }, { name: "First", level: 1, rooms: [room("bed-c3", "Bedroom 3", "bedroom", 0, 0, 450, 500)] }] }
    ];
    for (const plan of plans)
        assertGeometryBackedResult(plan);
});
(0, node_test_1.default)("source geometry changes the result rather than forcing a reference-property count", () => {
    const oneRoom = assertGeometryBackedResult({ floors: [{ name: "Ground", level: 0, rooms: [room("one", "Living Room", "living", 0, 0, 500, 400)] }] });
    const threeRoom = assertGeometryBackedResult({ floors: [{ name: "Ground", level: 0, rooms: [room("one", "Bedroom 1", "bedroom", 0, 0, 400, 500), room("two", "Bedroom 2", "bedroom", 400, 0, 400, 500), room("three", "Kitchen", "kitchen", 800, 0, 300, 300)] }] });
    strict_1.default.notEqual(oneRoom.bedrooms, 6);
    strict_1.default.notEqual(threeRoom.bedrooms, 6);
});
