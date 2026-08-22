import { FloorPlan, Room, RoomChange } from "./types/floorPlan";
import { applyBestEnsuites, findMaximumHMO, finalRoomSummary, roomArea } from "./hmoPlanner";

export type HMOLayoutPipelineResult = {
  plan: FloorPlan;
  appliedChanges: RoomChange[];
  rejectedChanges: RoomChange[];
  bedrooms: number;
  ensuites: number;
  bedroomIds: string[];
  ensuiteIds: string[];
  grossAreaAudit: {
    reservedGrossFloorAreaSqm?: number;
    proposedGrossFloorAreaSqm?: number;
    reserved: boolean;
    roomGeometryAreaBeforeSqm: number;
    roomGeometryAreaAfterSqm: number;
    roomGeometryAreaConserved: boolean;
  };
};

const norm = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isBedroom = (room: Room) => norm(`${room.type} ${room.name}`).includes("bedroom");
const isEnsuite = (room: Room) => norm(`${room.type} ${room.name}`).includes("ensuite");
function allRooms(plan: FloorPlan): Room[] { return plan.floors.flatMap(f => f.rooms); }
function geometryArea(plan: FloorPlan): number { return Number(allRooms(plan).reduce((sum, room) => sum + roomArea(room), 0).toFixed(4)); }

/**
 * Geometry-first HMO pipeline.
 * AI owns room recognition and conversion strategy; deterministic geometry owns
 * every physical transformation. Internal subdivision may change, but the
 * source gross floor area is a hard reserved quantity and cannot be increased.
 */
export function buildMaximumHMOLayout(plan: FloorPlan, aiChanges: RoomChange[] = [], targetBedrooms?: number): HMOLayoutPipelineResult {
  const source = structuredClone(plan);
  const sourceGeometryArea = geometryArea(source);
  const maximum = findMaximumHMO(source, aiChanges, targetBedrooms);
  const ensuiteResult = applyBestEnsuites(maximum.plan, maximum.ensuiteCandidates);
  const proposed = ensuiteResult.plan;
  const final = finalRoomSummary(proposed);
  const proposedGeometryArea = geometryArea(proposed);
  const reservedGross = Number(proposed.metadata?.grossFloorAreaSqm ?? source.metadata?.grossFloorAreaSqm);
  const hasReservedGross = Number.isFinite(reservedGross) && reservedGross > 0;
  const geometryConserved = Math.abs(proposedGeometryArea - sourceGeometryArea) <= Math.max(0.02, sourceGeometryArea * 0.002);
  const grossAreaAudit = {
    reservedGrossFloorAreaSqm: hasReservedGross ? reservedGross : undefined,
    proposedGrossFloorAreaSqm: hasReservedGross ? reservedGross : undefined,
    reserved: hasReservedGross,
    roomGeometryAreaBeforeSqm: sourceGeometryArea,
    roomGeometryAreaAfterSqm: proposedGeometryArea,
    roomGeometryAreaConserved: geometryConserved,
  };
  proposed.metadata = {
    ...(proposed.metadata || {}),
    ...(hasReservedGross ? { grossFloorAreaSqm: reservedGross, proposedGrossFloorAreaSqm: reservedGross, grossAreaReserved: true } : { grossAreaReserved: false }),
  };
  return {
    plan: proposed,
    appliedChanges: [...maximum.appliedChanges, ...ensuiteResult.applied],
    rejectedChanges: [...maximum.rejectedChanges, ...ensuiteResult.rejected],
    bedrooms: final.bedrooms,
    ensuites: final.ensuites,
    bedroomIds: final.bedroomIds,
    ensuiteIds: final.ensuiteIds,
    grossAreaAudit,
  };
}

export function finalLayoutRooms(plan: FloorPlan) {
  return plan.floors.flatMap((floor) => floor.rooms.map((room) => ({
    ...room,
    floor: floor.name,
    finalRole: isEnsuite(room) ? "private-ensuite" : isBedroom(room) ? "bedroom" : "retained",
  })));
}
