import { FloorPlan, Room, RoomChange } from "./types/floorPlan";
import { applyBestEnsuites, findMaximumHMO, finalRoomSummary } from "./hmoPlanner";

export type HMOLayoutPipelineResult = {
  plan: FloorPlan;
  appliedChanges: RoomChange[];
  rejectedChanges: RoomChange[];
  bedrooms: number;
  ensuites: number;
  bedroomIds: string[];
  ensuiteIds: string[];
};

const norm = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isBedroom = (room: Room) => norm(`${room.type} ${room.name}`).includes("bedroom");
const isEnsuite = (room: Room) => norm(`${room.type} ${room.name}`).includes("ensuite");

/**
 * Geometry-first HMO layout pipeline.
 * The vision model owns room recognition and HMO strategy; deterministic
 * geometry owns every physical transformation and can reject unsafe proposals.
 */
export function buildMaximumHMOLayout(plan: FloorPlan, aiChanges: RoomChange[] = []): HMOLayoutPipelineResult {
  // Apply the AI's room-specific strategy first. The planner validates every
  // requested transformation against the actual source polygons/openings.
  // Ensuite requests are deliberately handled in the exhaustive ensuite pass
  // below so every final bedroom receives the same physical-fit search.
  const maximum = findMaximumHMO(plan, aiChanges);
  const ensuiteResult = applyBestEnsuites(maximum.plan, maximum.ensuiteCandidates);
  const final = finalRoomSummary(ensuiteResult.plan);
  return {
    plan: ensuiteResult.plan,
    appliedChanges: [...maximum.appliedChanges, ...ensuiteResult.applied],
    rejectedChanges: [...maximum.rejectedChanges, ...ensuiteResult.rejected],
    bedrooms: final.bedrooms,
    ensuites: final.ensuites,
    bedroomIds: final.bedroomIds,
    ensuiteIds: final.ensuiteIds,
  };
}

export function finalLayoutRooms(plan: FloorPlan) {
  return plan.floors.flatMap((floor) => floor.rooms.map((room) => ({
    ...room,
    floor: floor.name,
    finalRole: isEnsuite(room) ? "private-ensuite" : isBedroom(room) ? "bedroom" : "retained",
  })));
}
