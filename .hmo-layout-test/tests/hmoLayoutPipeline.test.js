"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const hmoLayoutPipeline_1 = require("../lib/hmoLayoutPipeline");
const deterministicGeometryEngine_1 = require("../lib/deterministicGeometryEngine");
const hmoPlanner_1 = require("../lib/hmoPlanner");
function room(id, name, type, x, y, width, height, windows = [{ wall: "left" }], doors = [{ wall: "top" }]) { return { id, name, type, x, y, width, height, polygon: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }], adjacentRooms: [], shape: "rectangle", approxAreaSqm: (width * height) / 10000, approxWidthM: width / 100, approxDepthM: height / 100, windows, doors }; }
function planOf(rooms, grossFloorAreaSqm) { return { floors: [{ name: "Ground Floor", level: 0, rooms }], metadata: grossFloorAreaSqm ? { grossFloorAreaSqm } : undefined }; }
function ensuiteChange(roomId) { return { roomId, action: "ConvertToEnsuite", newType: "ensuite", split: { firstName: "Bedroom", firstType: "bedroom", secondName: "En-suite", secondType: "ensuite" } }; }
(0, node_test_1.default)("ensuite conversion always uses physical polygon carving", () => { const source = room("valid", "Bedroom", "bedroom", 0, 0, 400, 500); const result = (0, deterministicGeometryEngine_1.applyRoomChanges)(planOf([source]), [ensuiteChange("valid")]); const bedroom = result.floors[0].rooms.find(r => r.id === "valid"), ensuite = result.floors[0].rooms.find(r => r.id === "valid-split-2"); strict_1.default.equal(ensuite.type, "ensuite"); strict_1.default.ok(bedroom.approxAreaSqm < source.approxAreaSqm); strict_1.default.ok(Math.abs((bedroom.approxAreaSqm || 0) + (ensuite.approxAreaSqm || 0) - source.approxAreaSqm) < 0.01); strict_1.default.notDeepEqual(bedroom.polygon, source.polygon); strict_1.default.ok(ensuite.polygon && ensuite.polygon.length >= 4); });
(0, node_test_1.default)("ensuite carving conserves source geometry on different valid bedroom sizes", () => { for (const [id, width, height] of [["small", 320, 420], ["medium", 400, 500], ["large", 520, 600]]) {
    const source = room(id, "Bedroom", "bedroom", 0, 0, width, height);
    const result = (0, deterministicGeometryEngine_1.applyRoomChanges)(planOf([source]), [ensuiteChange(id)]);
    const rooms = result.floors[0].rooms, bedroom = rooms.find(r => r.id === id), ensuite = rooms.find(r => r.id === `${id}-split-2`);
    strict_1.default.ok(bedroom);
    strict_1.default.ok(ensuite);
    strict_1.default.equal(ensuite.type, "ensuite");
    strict_1.default.ok((bedroom.approxAreaSqm || 0) > 0);
    strict_1.default.ok((ensuite.approxAreaSqm || 0) >= 1.8);
    strict_1.default.ok((bedroom.approxAreaSqm || 0) < source.approxAreaSqm);
    strict_1.default.ok(Math.abs((bedroom.approxAreaSqm || 0) + (ensuite.approxAreaSqm || 0) - source.approxAreaSqm) < 0.01);
} });
(0, node_test_1.default)("valid room splits are geometry-driven and preserve area", () => { for (const width of [700, 900, 1200]) {
    const source = room(`split-${width}`, "Large Room", "utility", 0, 0, width, 700, [{ wall: "left" }, { wall: "right" }], [{ wall: "top" }]);
    const result = (0, hmoLayoutPipeline_1.buildMaximumHMOLayout)(planOf([source]), [{ roomId: source.id, action: "SplitRoom", reason: "test geometry", split: { firstName: "Bedroom 1", firstType: "bedroom", secondName: "Bedroom 2", secondType: "bedroom", direction: "vertical", firstRatio: .5 } }]);
    const bedrooms = result.plan.floors[0].rooms.filter(r => r.type === "bedroom");
    if (bedrooms.length === 2) {
        const total = bedrooms.reduce((sum, r) => sum + (r.approxAreaSqm || 0), 0);
        strict_1.default.ok(Math.abs(total - source.approxAreaSqm) < .01);
    }
} });
(0, node_test_1.default)("invalid split with an opening crossing proposed partition is rejected", () => { const source = room("blocked", "Large Room", "utility", 0, 0, 1000, 1000, [{ wall: "left" }, { wall: "right" }], [{ wall: "top", start: 450, end: 550 }]); const result = (0, hmoLayoutPipeline_1.buildMaximumHMOLayout)(planOf([source]), [{ roomId: source.id, action: "SplitRoom", split: { firstName: "Bedroom 1", firstType: "bedroom", secondName: "Bedroom 2", secondType: "bedroom", direction: "vertical", firstRatio: .5 } }]); strict_1.default.equal(result.appliedChanges.length, 0); });
(0, node_test_1.default)("planner accepts valid ensuite and rejects impossible geometry", () => { const valid = (0, hmoPlanner_1.applyBestEnsuites)(planOf([room("valid", "Bedroom", "bedroom", 0, 0, 400, 500)]), [ensuiteChange("valid")]); strict_1.default.equal(valid.applied.length, 1); strict_1.default.ok(valid.plan.floors[0].rooms.some(r => r.type === "ensuite")); const impossible = (0, hmoPlanner_1.applyBestEnsuites)(planOf([room("tiny", "Bedroom", "bedroom", 0, 0, 120, 120)]), [ensuiteChange("tiny")]); strict_1.default.equal(impossible.applied.length, 0); });
(0, node_test_1.default)("maximum HMO preserves largest communal ground-floor room while converting viable alternatives", () => { const plan = planOf([room("dining", "Dining Room", "dining", 0, 0, 320, 300), room("kitchen", "Kitchen", "kitchen", 320, 0, 400, 300), room("lounge", "Lounge", "living", 0, 300, 360, 330), room("living", "Living Room", "living", 360, 300, 500, 400), room("bed1", "Bedroom 1", "bedroom", 0, 630, 400, 400), room("bed2", "Bedroom 2", "bedroom", 400, 630, 400, 400)]); const result = (0, hmoLayoutPipeline_1.buildMaximumHMOLayout)(plan); strict_1.default.equal(result.plan.floors[0].rooms.find(r => r.id === "living")?.type, "living"); strict_1.default.equal(result.plan.floors[0].rooms.find(r => r.id === "dining")?.type, "bedroom"); strict_1.default.equal(result.plan.floors[0].rooms.find(r => r.id === "lounge")?.type, "bedroom"); strict_1.default.equal(result.bedrooms, 4); });
(0, node_test_1.default)("gross area is reserved independently from internal room geometry", () => { const result = (0, hmoLayoutPipeline_1.buildMaximumHMOLayout)(planOf([room("one", "Bedroom", "bedroom", 0, 0, 500, 400)], 154.6)); strict_1.default.equal(result.grossAreaAudit.reservedGrossFloorAreaSqm, 154.6); strict_1.default.equal(result.grossAreaAudit.proposedGrossFloorAreaSqm, 154.6); strict_1.default.equal(result.plan.metadata?.grossFloorAreaSqm, 154.6); strict_1.default.equal(result.plan.metadata?.proposedGrossFloorAreaSqm, 154.6); strict_1.default.equal(result.plan.metadata?.grossAreaReserved, true); strict_1.default.equal(result.grossAreaAudit.grossAreaConserved, true); strict_1.default.equal(result.grossAreaAudit.roomGeometryAreaConserved, true); });
(0, node_test_1.default)("maximum HMO varies with source geometry instead of fixed bedroom target", () => { const one = (0, hmoLayoutPipeline_1.buildMaximumHMOLayout)(planOf([room("one", "Large Room", "living", 0, 0, 500, 400)])); const two = (0, hmoLayoutPipeline_1.buildMaximumHMOLayout)(planOf([room("a", "Room A", "bedroom", 0, 0, 400, 500), room("b", "Room B", "bedroom", 400, 0, 400, 500)])); strict_1.default.notEqual(one.plan.floors[0].rooms.length, two.plan.floors[0].rooms.length); });
