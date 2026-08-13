import { FloorPlan, Room, RoomChange } from "@/lib/types/floorPlan";
import { applyRoomChanges } from "@/lib/applyRoomChanges";

export const BEDROOM_MIN_SQM = 6.51;
const COMMUNAL_MIN_SQM = 8;

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

export function isBedroom(room: Room): boolean {
  return norm(room.type).includes("bedroom") || norm(room.name).includes("bedroom");
}

export function isLiving(room: Room): boolean {
  const value = norm(`${room.type} ${room.name}`);
  return value.includes("living") || value.includes("lounge") || value.includes("reception");
}

export function isCommunal(room: Room): boolean {
  const value = norm(`${room.type} ${room.name}`);
  return value.includes("living") || value.includes("lounge") || value.includes("reception") || value.includes("dining") || value.includes("communal");
}

export function isKitchen(room: Room): boolean {
  return norm(`${room.type} ${room.name}`).includes("kitchen");
}

export function isWetRoom(room: Room): boolean {
  const value = norm(`${room.type} ${room.name}`);
  return value.includes("bath") || value.includes("shower") || value.includes("ensuite") || value.includes("toilet") || value === "wc";
}

export function roomArea(room: Room): number {
  return Number(room.approxAreaSqm || 0);
}

function hasWindow(room: Room): boolean {
  return Array.isArray(room.windows) && room.windows.length > 0;
}

function hasDoor(room: Room): boolean {
  return Array.isArray(room.doors) && room.doors.length > 0;
}

function allRooms(plan: FloorPlan): Room[] {
  return plan.floors.flatMap(f => f.rooms);
}

function bedrooms(plan: FloorPlan): Room[] {
  return allRooms(plan).filter(isBedroom);
}

function meaningfulCommunalSpace(plan: FloorPlan, excludedRoomId?: string): boolean {
  return allRooms(plan).some(room =>
    room.id !== excludedRoomId &&
    isCommunal(room) &&
    roomArea(room) >= COMMUNAL_MIN_SQM &&
    hasWindow(room)
  );
}

function separateKitchenExists(plan: FloorPlan, excludedRoomId?: string): boolean {
  return allRooms(plan).some(room => room.id !== excludedRoomId && isKitchen(room));
}

function groundFloor(plan: FloorPlan) {
  return plan.floors.find(f => f.level === 0 || /ground/i.test(f.name)) || plan.floors[0];
}

function applyAndCount(plan: FloorPlan, changes: RoomChange[]): { plan: FloorPlan; changesApplied: RoomChange[]; bedrooms: number } {
  const candidate = applyRoomChanges(plan, changes);
  const applied: RoomChange[] = [];
  for (const change of changes) {
    const before = allRooms(plan).find(r => r.id === change.roomId);
    const after = allRooms(candidate).find(r => r.id === change.roomId);
    const child = allRooms(candidate).find(r => r.id === `${change.roomId}-split-2`);
    if (!before || !after) continue;
    const action = norm(change.action);
    if (action === "splitroom" || action === "split") {
      if (child && child.polygon && child.polygon.length >= 3) applied.push(change);
    } else if (after.type !== before.type || after.name !== before.name) {
      applied.push(change);
    }
  }
  return { plan: candidate, changesApplied: applied, bedrooms: bedrooms(candidate).length };
}

function livingCandidates(plan: FloorPlan): Room[] {
  const ground = groundFloor(plan);
  if (!ground) return [];
  return ground.rooms
    .filter(room => isLiving(room) && roomArea(room) >= BEDROOM_MIN_SQM && hasWindow(room) && hasDoor(room))
    .sort((a, b) => roomArea(b) - roomArea(a));
}

function splitCandidates(plan: FloorPlan): Room[] {
  return allRooms(plan)
    .filter(room => !isWetRoom(room) && !isKitchen(room) && roomArea(room) >= BEDROOM_MIN_SQM * 2 && hasWindow(room) && hasDoor(room) && !!room.polygon && room.polygon.length >= 3)
    .sort((a, b) => roomArea(b) - roomArea(a));
}

function livingChange(room: Room): RoomChange {
  return {
    roomId: room.id,
    action: "ConvertToBedroom",
    newType: "bedroom",
    reason: "Deterministic maximum-bedroom search: ground-floor living/lounge/reception room meets the geometry, opening and communal-space constraints.",
  };
}

function splitChange(room: Room): RoomChange {
  const direction = (room.windows || []).some(w => w.wall === "top" || w.wall === "bottom") ? "horizontal" : "vertical";
  return {
    roomId: room.id,
    action: "SplitRoom",
    split: {
      firstName: room.name || "Bedroom",
      firstType: "bedroom",
      secondName: "Bedroom",
      secondType: "bedroom",
      direction,
      firstRatio: 0.5,
    },
    reason: "Deterministic split search: both resulting polygons must independently satisfy the bedroom geometry rules.",
  };
}

export type PlanningResult = {
  plan: FloorPlan;
  appliedChanges: RoomChange[];
  rejectedChanges: RoomChange[];
  bedrooms: number;
  ensuiteCandidates: RoomChange[];
};

/**
 * Search the detected geometry rather than accepting the first AI scheme.
 * Existing bedrooms are retained. Each additional bedroom candidate is
 * accepted only when applying it to the current geometry actually increases
 * the final bedroom count and the communal-space constraint remains true.
 */
export function findMaximumHMO(plan: FloorPlan, aiChanges: RoomChange[] = []): PlanningResult {
  let current = structuredClone(plan);
  const appliedChanges: RoomChange[] = [];
  const rejectedChanges: RoomChange[] = [];

  // First honour AI changes that are real room conversions/splits, but only if
  // they improve the deterministic geometry. This keeps AI in the strategy role
  // without allowing it to manufacture rooms.
  for (const change of aiChanges) {
    if (norm(change.action) === "converttoensuite" || /ensuite/i.test(String(change.split?.secondType || ""))) continue;
    const beforeCount = bedrooms(current).length;
    const candidate = applyAndCount(current, [change]);
    if (candidate.changesApplied.length && candidate.bedrooms >= beforeCount) {
      current = candidate.plan;
      appliedChanges.push(...candidate.changesApplied);
    } else {
      rejectedChanges.push(change);
    }
  }

  // Explicitly test every viable ground-floor living/lounge/reception candidate.
  // Do not require a room literally labelled Dining/Communal: a separate
  // detected living/lounge/reception/dining room is enough to preserve meaningful
  // communal space, provided the kitchen remains separate.
  for (const room of livingCandidates(current)) {
    if (!separateKitchenExists(current, room.id) || !meaningfulCommunalSpace(current, room.id)) continue;
    const beforeCount = bedrooms(current).length;
    const candidate = applyAndCount(current, [livingChange(room)]);
    if (candidate.bedrooms > beforeCount && candidate.changesApplied.length) {
      current = candidate.plan;
      appliedChanges.push(...candidate.changesApplied);
      break;
    }
  }

  // Iteratively test genuine room splits. Each accepted split is applied to the
  // current plan, so later candidates are evaluated against the already changed
  // geometry rather than the original drawing.
  let improved = true;
  while (improved) {
    improved = false;
    let best: { candidate: ReturnType<typeof applyAndCount>; change: RoomChange } | undefined;
    for (const room of splitCandidates(current)) {
      const beforeCount = bedrooms(current).length;
      const change = splitChange(room);
      const candidate = applyAndCount(current, [change]);
      if (candidate.bedrooms > beforeCount && candidate.changesApplied.length) {
        if (!best || candidate.bedrooms > best.candidate.bedrooms) best = { candidate, change };
      }
    }
    if (best) {
      current = best.candidate.plan;
      appliedChanges.push(...best.candidate.changesApplied);
      improved = true;
    }
  }

  // En-suite search is deliberately separate from AI suggestions. Every final
  // bedroom is tested using the real geometry engine; failed candidates never
  // enter the proposed plan or report.
  const ensuiteCandidates: RoomChange[] = bedrooms(current).map(room => ({
    roomId: room.id,
    action: "ConvertToEnsuite",
    newType: "ensuite",
    split: {
      firstName: room.name || "Bedroom",
      firstType: "bedroom",
      secondName: "En-suite",
      secondType: "ensuite",
    },
    reason: "Deterministic ensuite search across the final bedroom geometry.",
  }));

  return {
    plan: current,
    appliedChanges,
    rejectedChanges,
    bedrooms: bedrooms(current).length,
    ensuiteCandidates,
  };
}

/** Apply every viable ensuite one at a time and retain only genuine child geometry. */
export function applyBestEnsuites(plan: FloorPlan, candidates: RoomChange[]): { plan: FloorPlan; applied: RoomChange[]; rejected: RoomChange[] } {
  let current = structuredClone(plan);
  const applied: RoomChange[] = [];
  const rejected: RoomChange[] = [];

  for (const change of candidates) {
    const source = allRooms(current).find(r => r.id === change.roomId);
    if (!source || !isBedroom(source)) {
      rejected.push(change);
      continue;
    }
    const beforeArea = roomArea(source);
    const candidate = applyAndCount(current, [change]);
    const child = allRooms(candidate.plan).find(r => r.id === `${change.roomId}-split-2` && /ensuite/i.test(`${r.type} ${r.name}`));
    const remainder = allRooms(candidate.plan).find(r => r.id === change.roomId);
    const valid = !!child && !!remainder && isBedroom(remainder) && !!child.polygon && child.polygon.length >= 3 && !!remainder.polygon && remainder.polygon.length >= 3 && roomArea(remainder) >= BEDROOM_MIN_SQM && roomArea(child) > 0 && (roomArea(remainder) + roomArea(child) <= beforeArea * 1.08 || beforeArea <= 0);
    if (valid && candidate.changesApplied.length) {
      current = candidate.plan;
      applied.push(...candidate.changesApplied);
    } else {
      rejected.push(change);
    }
  }

  return { plan: current, applied, rejected };
}

export function finalRoomSummary(plan: FloorPlan) {
  const rooms = allRooms(plan);
  const finalBedrooms = rooms.filter(isBedroom);
  const ensuites = rooms.filter(r => norm(`${r.type} ${r.name}`).includes("ensuite"));
  return {
    bedrooms: finalBedrooms.length,
    ensuites: ensuites.length,
    bedroomIds: finalBedrooms.map(r => r.id),
    ensuiteIds: ensuites.map(r => r.id),
  };
}
