import { FloorPlan, Room, RoomChange } from "@/lib/types/floorPlan";
import { applyRoomChanges } from "@/lib/deterministicGeometryEngine";
import { BEDROOM_MIN_SQM, polygonArea, validateBedroomGeometry } from "@/lib/geometryValidation";

const COMMUNAL_MIN_SQM = 8;

function norm(value: unknown): string { return String(value ?? "").toLowerCase().replace(/[^a-z]/g, ""); }
export function isBedroom(room: Room): boolean { return norm(room.type).includes("bedroom") || norm(room.name).includes("bedroom"); }
export function isLiving(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("living") || value.includes("lounge") || value.includes("reception"); }
export function isCommunal(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("living") || value.includes("lounge") || value.includes("reception") || value.includes("dining") || value.includes("communal"); }
export function isKitchen(room: Room): boolean { return norm(`${room.type} ${room.name}`).includes("kitchen"); }
export function isWetRoom(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("bath") || value.includes("shower") || value.includes("ensuite") || value.includes("toilet") || value === "wc"; }
export function isCirculationOrStair(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("stair") || value.includes("landing") || value.includes("circulation") || value.includes("hall") || value.includes("stairs"); }
export function roomArea(room: Room): number { return Number(room.approxAreaSqm || 0); }
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

function livingCandidates(plan: FloorPlan): Room[] {
  const ground = groundFloor(plan); if (!ground) return [];
  return ground.rooms.filter(room => isLiving(room) && !isCirculationOrStair(room) && roomArea(room) >= BEDROOM_MIN_SQM && hasWindow(room) && hasDoor(room)).sort((a, b) => roomArea(b) - roomArea(a));
}
function splitCandidates(plan: FloorPlan): Room[] {
  return allRooms(plan).filter(room => !isWetRoom(room) && !isKitchen(room) && !isCirculationOrStair(room) && roomArea(room) >= BEDROOM_MIN_SQM * 2 && hasWindow(room) && hasDoor(room) && !!room.polygon && room.polygon.length >= 3).sort((a, b) => roomArea(b) - roomArea(a));
}
function livingChange(room: Room): RoomChange { return { roomId: room.id, action: "ConvertToBedroom", newType: "bedroom", reason: "Deterministic maximum-bedroom search: ground-floor living/lounge/reception room meets geometry, opening and communal-space constraints." }; }
function splitChange(room: Room): RoomChange { const direction = (room.windows || []).some(w => w.wall === "top" || w.wall === "bottom") ? "horizontal" : "vertical"; return { roomId: room.id, action: "SplitRoom", split: { firstName: room.name || "Bedroom", firstType: "bedroom", secondName: "Bedroom", secondType: "bedroom", direction, firstRatio: 0.5 }, reason: "Deterministic split search: both resulting polygons must independently satisfy the bedroom geometry rules." }; }

export type PlanningResult = { plan: FloorPlan; appliedChanges: RoomChange[]; rejectedChanges: RoomChange[]; bedrooms: number; ensuiteCandidates: RoomChange[] };

export function findMaximumHMO(plan: FloorPlan, aiChanges: RoomChange[] = []): PlanningResult {
  let current = structuredClone(plan);
  const appliedChanges: RoomChange[] = [], rejectedChanges: RoomChange[] = [];
  for (const change of aiChanges) {
    const source = allRooms(current).find(r => r.id === change.roomId);
    if (source && isCirculationOrStair(source)) { rejectedChanges.push(change); continue; }
    if (norm(change.action) === "converttoensuite" || /ensuite/i.test(String(change.split?.secondType || ""))) continue;
    const beforeCount = bedrooms(current).length, candidate = applyAndCount(current, [change]);
    if (candidate.changesApplied.length && candidate.bedrooms >= beforeCount) { current = candidate.plan; appliedChanges.push(...candidate.changesApplied); } else rejectedChanges.push(change);
  }
  for (const room of livingCandidates(current)) {
    if (!separateKitchenExists(current, room.id) || !meaningfulCommunalSpace(current, room.id)) continue;
    const beforeCount = bedrooms(current).length, candidate = applyAndCount(current, [livingChange(room)]);
    if (candidate.bedrooms > beforeCount && candidate.changesApplied.length) { current = candidate.plan; appliedChanges.push(...candidate.changesApplied); }
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
  const ensuiteCandidates: RoomChange[] = bedrooms(current).map(room => ({ roomId: room.id, action: "ConvertToEnsuite", newType: "ensuite", split: { firstName: room.name || "Bedroom", firstType: "bedroom", secondName: "En-suite", secondType: "ensuite" }, reason: "Deterministic ensuite search across the final bedroom geometry; ensuite must be carved from this bedroom and leave the bedroom valid." }));
  return { plan: current, appliedChanges, rejectedChanges, bedrooms: bedrooms(current).length, ensuiteCandidates };
}

export function applyBestEnsuites(plan: FloorPlan, candidates: RoomChange[]): { plan: FloorPlan; applied: RoomChange[]; rejected: RoomChange[] } {
  let current = structuredClone(plan);
  const applied: RoomChange[] = [], rejected: RoomChange[] = [];
  for (const change of candidates) {
    const source = allRooms(current).find(r => r.id === change.roomId);
    if (!source || !isBedroom(source) || isCirculationOrStair(source)) { rejected.push(change); continue; }
    const beforeArea = roomArea(source), beforePolygon = source.polygon ? structuredClone(source.polygon) : undefined, candidate = applyAndCount(current, [change]);
    const remainder = allRooms(candidate.plan).find(r => r.id === change.roomId);
    const ensuite = allRooms(candidate.plan).find(r => r.id === `${change.roomId}-split-2` && /ensuite/i.test(`${r.type} ${r.name}`));
    const remainderCheck = remainder ? validateBedroomGeometry(remainder) : { valid: false, areaSqm: 0 };
    const sourceAreaPx = beforePolygon ? polygonArea(beforePolygon) : 0;
    const finalBedroomAreaPx = remainder?.polygon ? polygonArea(remainder.polygon) : 0;
    const ensuiteAreaPx = ensuite?.polygon ? polygonArea(ensuite.polygon) : 0;
    const geometricConservation = sourceAreaPx > 0 && Math.abs((finalBedroomAreaPx + ensuiteAreaPx) - sourceAreaPx) / sourceAreaPx <= 0.002;
    const metricConservation = beforeArea > 0 && remainder && ensuite ? Math.abs((roomArea(remainder) + roomArea(ensuite)) - beforeArea) / beforeArea <= 0.02 : false;
    const actuallyReduced = !!remainder && roomArea(remainder) < beforeArea - 0.001;
    const valid = !!remainder && !!remainder.polygon && remainder.polygon.length >= 3 && isBedroom(remainder) && remainderCheck.valid && actuallyReduced && !!ensuite && !!ensuite.polygon && ensuite.polygon.length >= 3 && roomArea(ensuite) > 0 && geometricConservation && metricConservation;
    if (valid && candidate.changesApplied.length) { current = candidate.plan; applied.push(...candidate.changesApplied); } else rejected.push(change);
  }
  return { plan: current, applied, rejected };
}

export function finalRoomSummary(plan: FloorPlan) {
  const rooms = allRooms(plan), finalBedrooms = rooms.filter(isBedroom), ensuites = rooms.filter(r => norm(`${r.type} ${r.name}`).includes("ensuite"));
  return {
    bedrooms: finalBedrooms.length,
    ensuites: ensuites.length,
    bedroomIds: finalBedrooms.map(r => r.id),
    ensuiteIds: ensuites.map(r => r.id),
    bedroomSchedule: finalBedrooms.map(room => ({ id: room.id, name: room.name, floor: plan.floors.find(f => f.rooms.some(r => r.id === room.id))?.name || "Floor", usableAreaSqm: Number(roomArea(room).toFixed(2)), widthM: room.approxWidthM, depthM: room.approxDepthM, hasWindow: hasWindow(room), hasDoor: hasDoor(room) })),
    ensuiteSchedule: ensuites.map(room => ({ id: room.id, parentId: room.adjacentRooms?.[0], floor: plan.floors.find(f => f.rooms.some(r => r.id === room.id))?.name || "Floor", areaSqm: Number(roomArea(room).toFixed(2)), widthM: room.approxWidthM, depthM: room.approxDepthM })),
  };
}
