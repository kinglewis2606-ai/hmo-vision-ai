"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const geometryValidation_1 = require("../lib/geometryValidation");
const rect = (x, y, width, height) => [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];
const room = (areaSqm = 12) => ({
    id: "room-1", name: "Bedroom", type: "bedroom", x: 0, y: 0, width: 400, height: 300,
    polygon: rect(0, 0, 400, 300), approxAreaSqm: areaSqm, adjacentRooms: [], shape: "rectangle",
    windows: [{ wall: "top" }], doors: [{ wall: "bottom" }],
});
(0, node_test_1.default)("validates polygon cardinality, positive area and self-intersection", () => {
    strict_1.default.equal((0, geometryValidation_1.validatePolygon)(rect(0, 0, 100, 80)).valid, true);
    strict_1.default.equal((0, geometryValidation_1.validatePolygon)([{ x: 0, y: 0 }, { x: 1, y: 1 }]).valid, false);
    strict_1.default.equal((0, geometryValidation_1.validatePolygon)([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }]).valid, false);
});
(0, node_test_1.default)("checks containment and point membership", () => {
    const outer = rect(0, 0, 400, 300), inner = rect(0, 0, 120, 100);
    strict_1.default.equal((0, geometryValidation_1.pointInPolygon)({ x: 50, y: 50 }, outer), true);
    strict_1.default.equal((0, geometryValidation_1.polygonContainsPolygon)(outer, inner), true);
    strict_1.default.equal((0, geometryValidation_1.polygonContainsPolygon)(inner, outer), false);
});
(0, node_test_1.default)("preserves area when a room is carved into remainder plus ensuite", () => {
    const source = room(12), child = rect(0, 0, 120, 100);
    const remainder = [{ x: 120, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 100 }, { x: 120, y: 100 }];
    strict_1.default.equal((0, geometryValidation_1.areasConserve)(source, remainder, child), true);
    strict_1.default.equal(Math.round((0, geometryValidation_1.polygonArea)(remainder) + (0, geometryValidation_1.polygonArea)(child)), (0, geometryValidation_1.polygonArea)(source.polygon));
});
(0, node_test_1.default)("enforces the 6.51 sqm bedroom rule and openings", () => {
    strict_1.default.equal((0, geometryValidation_1.validateBedroomGeometry)(room(8)).valid, true);
    strict_1.default.ok((0, geometryValidation_1.validateBedroomGeometry)(room(8)).areaSqm >= geometryValidation_1.BEDROOM_MIN_SQM);
    strict_1.default.equal((0, geometryValidation_1.validateBedroomGeometry)(room(6)).valid, false);
    strict_1.default.equal((0, geometryValidation_1.validateBedroomGeometry)({ ...room(8), windows: [] }).valid, false);
    strict_1.default.equal((0, geometryValidation_1.validateBedroomGeometry)({ ...room(8), doors: [] }).valid, false);
});
(0, node_test_1.default)("converts polygon area proportionally to square metres", () => {
    const source = room(12), half = rect(0, 0, 200, 300);
    strict_1.default.equal(Number((0, geometryValidation_1.sqmForPolygon)(source, half).toFixed(2)), 6);
});
