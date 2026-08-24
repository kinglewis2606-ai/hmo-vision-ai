import { FloorPlan, RoomChange } from "./types/floorPlan";
import { applyBestEnsuites, findMaximumHMO, finalRoomSummary } from "./hmoPlanner";

export type TargetedHMOLayoutResult = {
  plan: FloorPlan;
  appliedChanges: RoomChange[];
  rejectedChanges: RoomChange[];
  bedrooms: number;
  ensuites: number;
  bedroomIds: string[];
  ensuiteIds: string[];
  targetBedrooms: number;
};

export function buildTargetedHMOLayout(plan: FloorPlan, aiChanges: RoomChange[], targetBedrooms: number): TargetedHMOLayoutResult {
  const planning = findMaximumHMO(plan, aiChanges, targetBedrooms);
  const ensuite = applyBestEnsuites(planning.plan, planning.ensuiteCandidates);
  const final = finalRoomSummary(ensuite.plan);
  return {
    plan: ensuite.plan,
    appliedChanges: [...planning.appliedChanges, ...ensuite.applied],
    rejectedChanges: [...planning.rejectedChanges, ...ensuite.rejected],
    bedrooms: final.bedrooms,
    ensuites: final.ensuites,
    bedroomIds: final.bedroomIds,
    ensuiteIds: final.ensuiteIds,
    targetBedrooms,
  };
}
