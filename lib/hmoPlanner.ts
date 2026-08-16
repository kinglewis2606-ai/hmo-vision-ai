import { FloorPlan, Room, RoomChange } from "@/lib/types/floorPlan";
import { applyRoomChanges } from "@/lib/deterministicGeometryEngine";
import { sqmForPolygon } from "@/lib/geometryValidation";

export const BEDROOM_MIN_SQM = 6.51;
const COMMUNAL_MIN_SQM = 8;

function norm(value: unknown): string { return String(value ?? "").toLowerCase().replace(/[^a-z]/g, ""); }
export function isBedroom(room: Room): boolean { return norm(room.type).includes("bedroom") || norm(room.name).includes("bedroom"); }
export function isLiving(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("living") || value.includes("lounge") || value.includes("reception"); }
export function isDining(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("dining") || value.includes("diner"); }
export function isCommunal(room: Room): boolean {
  const value = norm(`${room.type} ${room.name}`);
  if (value.includes("living") || value.includes("lounge") || value.includes("reception") || value.includes("dining") || value.includes("communal")) return true;
  return value.includes("kitchen") && roomArea(room) >= COMMUNAL_MIN_SQM && hasWindow(room);
}
export function isKitchen(room: Room): boolean { return norm(`${room.type} ${room.name}`).includes("kitchen"); }
export function isWetRoom(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("bath") || value.includes("shower") || value.includes("ensuite") || value.includes("toilet") || value === "wc"; }

// Geometry is authoritative. AI may classify a room, but it is not allowed to
// change the measured size used by the optimisation engine. This makes two
// different uploaded plans produce different HMO outcomes from their actual
// detected polygons rather than from an AI-supplied area guess.
export function roomArea(room: Room): number {
  if (room.polygon && room.polygon.length >= 3) {
    const measured = Number(sqmForPolygon(room, room.polygon));
    if (Number.isFinite(measured) && measured > 0) return measured;
  }
  return Number(room.approxAreaSqm || 0);
}
function hasWindow(room: Room): boolean { return Array.isArray(room.windows) && room.windows.length > 0; }
function hasDoor(room: Room): boolean { return Array.isArray(room.doors) && room.doors.length > 0; }
function allRooms(plan: FloorPlan): Room[] { return plan.floors.flatMap(f => f.rooms); }
function bedrooms(plan: FloorPlan): Room[] { return allRooms(plan).filter(isBedroom); }
function meaningfulCommunalSpace(plan: FloorPlan, excludedRoomId?: string): boolean { return allRooms(plan).some(room => room.id !== excludedRoomId && isCommunal(room) && roomArea(room) >= COMMUNAL_MIN_SQM && hasWindow(room)); }
function separateKitchenExists(plan: FloorPlan, excludedRoomId?: string): boolean { return allRooms(plan).some(room => room.id !== excludedRoomId && isKitchen(room)); }
function groundFloor(plan: FloorPlan) { return plan.floors.find(f => f.level === 0 || /ground/i.test(f.name)) || plan.floors[0]; }

function applyAndCount(plan: FloorPlan, changes: RoomChange[]): { plan: FloorPlan; changesApplied: RoomChange[]; bedrooms: number } {
  const candidate = applyRoomChanges(plan, changes);
  const applied: RoomChange[] = [];
  for (const change of changes) {
    const before = allRooms(plan).find(r => r.id === change.roomId);
    const after = allRooms(candidate).find(r => r.id === change.roomId);
    const child = allRooms(candidate).find(r => r.id === `${change.roomId}-split-2`);
    if (!before || !after) continue;
    const action = norm(change.action), childIsEnsuite = !!child && /ensuite/i.test(`${child.type} ${child.name}`);
    if ((action === "splitroom" || action === "split") && child?.polygon?.length && isBedroom(child)) applied.push(change);
    else if (action === "converttoensuite" && childIsEnsuite && child.polygon?.length && after.polygon?.length) applied.push(change);
    else if (after.type !== before.type || after.name !== before.name) applied.push(change);
  }
  return { plan: candidate, changesApplied: applied, bedrooms: bedrooms(candidate).length };
}

function groundConversionCandidates(plan: FloorPlan): Room[] {
  const ground = groundFloor(plan); if (!ground) return [];
  return ground.rooms
    .filter(room => !isBedroom(room) && !isWetRoom(room) && !isKitchen(room) && roomArea(room) >= BEDROOM_MIN_SQM && hasWindow(room) && hasDoor(room) && !!room.polygon && room.polygon.length >= 3 && (isLiving(room) || isDining(room)))
    .sort((a, b) => roomArea(b) - roomArea(a));
}
function splitCandidates(plan: FloorPlan): Room[] {
  return allRooms(plan).filter(room => !isWetRoom(room) && !isKitchen(room) && roomArea(room) >= BEDROOM_MIN_SQM * 2 && hasWindow(room) && hasDoor(room) && !!room.polygon && room.polygon.length >= 3).sort((a, b) => roomArea(b) - roomArea(a));
}
function livingChange(room: Room): RoomChange { return { roomId: room.id, action: "ConvertToBedroom", newType: "bedroom", reason: "Deterministic maximum-bedroom search: ground-floor living/lounge/reception room meets geometry, opening and communal-space constraints." }; }
function splitChange(room: Room): RoomChange { const direction = (room.windows || []).some(w => w.wall === "top" || w.wall === "bottom") ? "horizontal" : "vertical"; return { roomId: room.id, action: "SplitRoom", split: { firstName: room.name || "Bedroom", firstType: "bedroom", secondName: "Bedroom", secondType: "bedroom", direction, firstRatio: 0.5 }, reason: "Deterministic split search: both resulting polygons must independently satisfy the bedroom geometry rules." }; }

export type PlanningResult = { plan: FloorPlan; appliedChanges: RoomChange[]; rejectedChanges: RoomChange[]; bedrooms: number; ensuiteCandidates: RoomChange[] };

export function findMaximumHMO(plan: FloorPlan, aiChanges: RoomChange[] = []): PlanningResult {
  let current = structuredClone(plan);
  const appliedChanges: RoomChange[] = [], rejectedChanges: RoomChange[] = [];

  for (const change of aiChanges) {
    if (norm(change.action) === "converttoensuite" || /ensuite/i.test(String(change.split?.secondType || ""))) continue;
    const beforeCount = bedrooms(current).length, candidate = applyAndCount(current, [change]);
    if (candidate.changesApplied.length && candidate.bedrooms >= beforeCount) { current = candidate.plan; appliedChanges.push(...candidate.changesApplied); } else rejectedChanges.push(change);
  }

  for (const room of groundConversionCandidates(current)) {
    if (!separateKitchenExists(current, room.id)) continue;
    const change = livingChange(room);
    const beforeCount = bedrooms(current).length;
    const candidate = applyAndCount(current, [change]);
    if (!candidate.changesApplied.length || candidate.bedrooms <= beforeCount) continue;
    if (!meaningfulCommunalSpace(candidate.plan)) { rejectedChanges.push(change); continue; }
    current = candidate.plan;
    appliedChanges.push(...candidate.changesApplied);
  }

  let improved = true;
  while (improved) {
    improved = false;
    let best: { candidate: ReturnType<typeof applyAndCount>; change: RoomChange } | undefined;
    for (const room of splitCandidates(current)) {
      const beforeCount = bedrooms(current).length, change = splitChange(room), candidate = applyAndCount(current, [change]);
      if (candidate.bedrooms > beforeCount && candidate.changesApplied.length && (!best || candidate.bedrooms > best.candidate.bedrooms)) best = { candidate, change };
    }
    if (best) { current = best.candidate.plan; appliedChanges.push(...best.candidate.changesApplied); improved = true; }
  }

  const ensuiteCandidates: RoomChange[] = bedrooms(current).map(room => ({ roomId: room.id, action: "ConvertToEnsuite", newType: "ensuite", split: { firstName: room.name || "Bedroom", firstType: "bedroom", secondName: "En-suite", secondType: "ensuite" }, reason: "Deterministic ensuite search across the final bedroom geometry." }));
  return { plan: current, appliedChanges, rejectedChanges, bedrooms: bedrooms(current).length, ensuiteCandidates };
}

export function applyBestEnsuites(plan: FloorPlan, candidates: RoomChange[]): { plan: FloorPlan; applied: RoomChange[]; rejected: RoomChange[] } {
  let current = structuredClone(plan);
  const applied: RoomChange[] = [], rejected: RoomChange[] = [];
  for (const change of candidates) {
    const source = allRooms(current).find(r => r.id === change.roomId);
    if (!source || !isBedroom(source)) { rejected.push(change); continue; }
    const beforeArea = roomArea(source), candidate = applyAndCount(current, [change]);
    const remainder = allRooms(candidate.plan).find(r => r.id === change.roomId);
    const ensuite = allRooms(candidate.plan).find(r => r.id === `${change.roomId}-split-2` && /ensuite/i.test(`${r.type} ${r.name}`));
    const valid = !!remainder && !!remainder.polygon && remainder.polygon.length >= 3 && isBedroom(remainder) && roomArea(remainder) >= BEDROOM_MIN_SQM && !!ensuite && !!ensuite.polygon && ensuite.polygon.length >= 3 && roomArea(ensuite) > 0 && (beforeArea <= 0 || Math.abs((roomArea(remainder) + roomArea(ensuite)) - beforeArea) / beforeArea <= 0.02);
    if (valid && candidate.changesApplied.length) { current = candidate.plan; applied.push(...candidate.changesApplied); } else rejected.push(change);
  }
  return { plan: current, applied, rejected };
}

export function finalRoomSummary(plan: FloorPlan) {
  const rooms = allRooms(plan), finalBedrooms = rooms.filter(isBedroom), ensuites = rooms.filter(r => norm(`${r.type} ${r.name}`).includes("ensuite"));
  return { bedrooms: finalBedrooms.length, ensuites: ensuites.length, bedroomIds: finalBedrooms.map(r => r.id), ensuiteIds: ensuites.map(r => r.id) };
}
