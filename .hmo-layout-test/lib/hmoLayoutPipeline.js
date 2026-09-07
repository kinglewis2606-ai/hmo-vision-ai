"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMaximumHMOLayout = buildMaximumHMOLayout;
exports.finalLayoutRooms = finalLayoutRooms;
const hmoPlanner_1 = require("./hmoPlanner");
const geometryValidation_1 = require("./geometryValidation");
const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isBedroomLabel = (room) => norm(`${room.type} ${room.name}`).includes("bedroom");
const isEnsuite = (room) => norm(`${room.type} ${room.name}`).includes("ensuite");
function allRooms(plan) { return plan.floors.flatMap(f => f.rooms); }
function geometryArea(plan) { return Number(allRooms(plan).reduce((sum, room) => sum + (0, hmoPlanner_1.roomArea)(room), 0).toFixed(4)); }
function stripInvalidBedroomLabels(plan) {
    const updated = structuredClone(plan);
    for (const room of allRooms(updated)) {
        if (!isBedroomLabel(room))
            continue;
        if ((0, geometryValidation_1.validateBedroomGeometry)(room).valid)
            continue;
        room.type = "retained";
        room.name = String(room.name || "Existing Room").replace(/\bbedroom\b/gi, "Existing Room").replace(/\s+/g, " ").trim() || "Existing Room";
        room.notes = [room.notes, "Excluded from final HMO bedroom count because deterministic geometry is below the 6.51 sqm minimum or lacks required openings."].filter(Boolean).join("; ");
    }
    return updated;
}
function conservedSourceGeometryArea(source, proposed) {
    const sourceRooms = new Map(allRooms(source).map(r => [r.id, r]));
    let before = 0, after = 0;
    for (const original of sourceRooms.values()) {
        const sourceSqm = (0, geometryValidation_1.sourcePolygonAreaSqm)(original);
        if (sourceSqm <= 0)
            continue;
        before += sourceSqm;
        const current = allRooms(proposed).find(r => r.id === original.id);
        const children = allRooms(proposed).filter(r => r.id.startsWith(`${original.id}-split-`));
        if (!current)
            continue;
        after += (0, geometryValidation_1.sqmForPolygon)(original, current.polygon || []);
        for (const child of children)
            after += (0, geometryValidation_1.sqmForPolygon)(original, child.polygon || []);
    }
    const difference = Math.abs(after - before);
    return { before: Number(before.toFixed(4)), after: Number(after.toFixed(4)), conserved: difference <= Math.max(0.005, before * 0.0005) };
}
function buildMaximumHMOLayout(plan, aiChanges = [], targetBedrooms) {
    const source = structuredClone(plan);
    const maximum = (0, hmoPlanner_1.findMaximumHMO)(source, aiChanges, targetBedrooms);
    const cleanedMaximum = stripInvalidBedroomLabels(maximum.plan);
    const ensuiteResult = (0, hmoPlanner_1.applyBestEnsuites)(cleanedMaximum, maximum.ensuiteCandidates);
    const proposed = stripInvalidBedroomLabels(ensuiteResult.plan);
    const final = (0, hmoPlanner_1.finalRoomSummary)(proposed);
    const reservedGross = Number(proposed.metadata?.grossFloorAreaSqm ?? source.metadata?.grossFloorAreaSqm);
    const hasReservedGross = Number.isFinite(reservedGross) && reservedGross > 0;
    const conservation = conservedSourceGeometryArea(source, proposed);
    const grossAreaAudit = { reservedGrossFloorAreaSqm: hasReservedGross ? reservedGross : undefined, proposedGrossFloorAreaSqm: hasReservedGross ? reservedGross : undefined, reserved: hasReservedGross, roomGeometryAreaBeforeSqm: conservation.before, roomGeometryAreaAfterSqm: conservation.after, roomGeometryAreaConserved: conservation.conserved, grossAreaConserved: conservation.conserved };
    proposed.metadata = { ...(proposed.metadata || {}), ...(hasReservedGross ? { grossFloorAreaSqm: reservedGross, proposedGrossFloorAreaSqm: reservedGross, grossAreaReserved: true } : { grossAreaReserved: false }) };
    return { plan: proposed, appliedChanges: [...maximum.appliedChanges, ...ensuiteResult.applied], rejectedChanges: [...maximum.rejectedChanges, ...ensuiteResult.rejected], bedrooms: final.bedrooms, ensuites: final.ensuites, bedroomIds: final.bedroomIds, ensuiteIds: final.ensuiteIds, grossAreaAudit };
}
function finalLayoutRooms(plan) { return plan.floors.flatMap(floor => floor.rooms.map(room => ({ ...room, floor: floor.name, finalRole: isEnsuite(room) ? "private-ensuite" : norm(`${room.type} ${room.name}`).includes("bedroom") ? "bedroom" : "retained" }))); }
