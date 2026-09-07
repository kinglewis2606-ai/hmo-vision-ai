"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const hmoPlanner_1 = require("../lib/hmoPlanner");
function room(id, name, type, x, y, width, height, approxAreaSqm = (width * height) / 10000) {
    return { id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm, approxWidthM: width / 100, approxDepthM: height / 100, windows: [{ wall: "bottom" }], doors: [{ wall: "top" }] };
}
(0, node_test_1.default)("maximum HMO preserves the largest ground-floor living room and converts the other viable living room", () => {
    const plan = { floors: [
            { name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 340, 340), room("gf-living", "Living Room", "living", 340, 0, 440, 340), room("gf-kitchen", "Kitchen", "kitchen", 0, 340, 280, 300)] },
            { name: "First Floor", level: 1, rooms: [room("ff-bed", "Bedroom 1", "bedroom", 0, 0, 400, 400)] },
        ] };
    const result = (0, hmoPlanner_1.findMaximumHMO)(plan);
    strict_1.default.equal(result.bedrooms, 2);
    strict_1.default.equal(result.appliedChanges.length, 1);
});
(0, node_test_1.default)("a single ground-floor living room is retained as communal space rather than fabricated into a bedroom", () => {
    const plan = { floors: [{ name: "Ground Floor", level: 0, rooms: [room("gf-lounge", "Lounge", "living", 0, 0, 500, 400), room("gf-kitchen", "Kitchen", "kitchen", 500, 0, 300, 300)] }] };
    const result = (0, hmoPlanner_1.findMaximumHMO)(plan);
    strict_1.default.equal(result.bedrooms, 0);
    strict_1.default.notEqual(result.bedrooms, 6);
});
(0, node_test_1.default)("does not count an existing bedroom below the 6.51 sqm minimum", () => {
    const small = room("small-bed", "Bedroom 1", "bedroom", 0, 0, 400, 300, 6);
    strict_1.default.equal((0, hmoPlanner_1.isBedroom)(small), false);
    strict_1.default.equal((0, hmoPlanner_1.finalRoomSummary)({ floors: [{ name: "First Floor", level: 1, rooms: [small] }] }).bedrooms, 0);
});
(0, node_test_1.default)("counts an existing bedroom when geometry and openings pass the bedroom rule", () => {
    const valid = room("valid-bed", "Bedroom 1", "bedroom", 0, 0, 400, 300, 8);
    strict_1.default.equal((0, hmoPlanner_1.isBedroom)(valid), true);
    strict_1.default.equal((0, hmoPlanner_1.finalRoomSummary)({ floors: [{ name: "First Floor", level: 1, rooms: [valid] }] }).bedrooms, 1);
});
