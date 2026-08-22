import { FloorPlan, Room, RoomChange, WallSide } from "./types/floorPlan";
import { applyRoomChanges } from "./deterministicGeometryEngine";
import { sqmForPolygon, validateBedroomGeometry } from "./geometryValidation";

export const BEDROOM_MIN_SQM = 6.51;
const COMMUNAL_MIN_SQM = 8;
function norm(value: unknown): string { return String(value ?? "").toLowerCase().replace(/[^a-z]/g, ""); }
export function isBedroom(room: Room): boolean { return norm(room.type).includes("bedroom") || norm(room.name).includes("bedroom"); }
export function isLiving(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("living") || value.includes("lounge") || value.includes("reception"); }
export function isDining(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("dining") || value.includes("diner"); }
export function isCommunal(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); if (value.includes("living") || value.includes("lounge") || value.includes("reception") || value.includes("dining") || value.includes("communal")) return true; return value.includes("kitchen") && roomArea(room) >= COMMUNAL_MIN_SQM && hasWindow(room); }
export function isKitchen(room: Room): boolean { return norm(`${room.type} ${room.name}`).includes("kitchen"); }
export function isWetRoom(room: Room): boolean { const value = norm(`${room.type} ${room.name}`); return value.includes("bath") || value.includes("shower") || value.includes("ensuite") || value.includes("toilet") || value === "wc"; }
export function roomArea(room: Room): number { if (room.polygon && room.polygon.length >= 3) { const measured = Number(sqmForPolygon(room, room.polygon)); if (Number.isFinite(measured) && measured > 0) return measured; } return Number(room.approxAreaSqm || 0); }
function hasWindow(room: Room): boolean { return Array.isArray(room.windows) && room.windows.length > 0; }
function hasDoor(room: Room): boolean { return Array.isArray(room.doors) && room.doors.length > 0; }
function allRooms(plan: FloorPlan): Room[] { return plan.floors.flatMap(f => f.rooms); }
function bedrooms(plan: FloorPlan): Room[] { return allRooms(plan).filter(isBedroom); }
function canonicaliseRoomTypes(plan: FloorPlan): FloorPlan { const updated = structuredClone(plan); for (const room of allRooms(updated)) { const value = norm(room.name); if (value.includes("bedroom")) room.type = "bedroom"; else if (value.includes("living") || value.includes("lounge") || value.includes("reception")) room.type = "living"; else if (value.includes("dining") || value.includes("diner")) room.type = "dining"; else if (value.includes("kitchen")) room.type = "kitchen"; else if (value.includes("shower") || value.includes("bathroom") || value === "bath" || value === "wc" || value.includes("toilet")) room.type = "bathroom"; else if (value.includes("landing") || value.includes("hall") || value.includes("entrance") || value.includes("stair")) room.type = "circulation"; } return updated; }
function meaningfulCommunalSpace(plan: FloorPlan, excludedRoomId?: string): boolean { return allRooms(plan).some(room => room.id !== excludedRoomId && isCommunal(room) && roomArea(room) >= COMMUNAL_MIN_SQM && hasWindow(room)); }
function separateKitchenExists(plan: FloorPlan, excludedRoomId?: string): boolean { return allRooms(plan).some(room => room.id !== excludedRoomId && isKitchen(room)); }
function groundFloor(plan: FloorPlan) { return plan.floors.find(f => f.level === 0 || /ground/i.test(f.name)) || plan.floors[0]; }
function inferSharedAccessWall(room: Room, plan: FloorPlan): WallSide | undefined { const rooms = allRooms(plan).filter(r => r.id !== room.id && r.id !== `${room.id}-split-2`); let best: { wall: WallSide; length: number } | undefined; const tolerance = 15; for (const other of rooms) { const verticalOverlap = Math.max(0, Math.min(room.y + room.height, other.y + other.height) - Math.max(room.y, other.y)); const horizontalOverlap = Math.max(0, Math.min(room.x + room.width, other.x + other.width) - Math.max(room.x, other.x)); const candidates: Array<{ wall: WallSide; length: number }> = [{ wall: "right", length: Math.abs(room.x + room.width - other.x) <= tolerance ? verticalOverlap : 0 }, { wall: "left", length: Math.abs(other.x + other.width - room.x) <= tolerance ? verticalOverlap : 0 }, { wall: "bottom", length: Math.abs(room.y + room.height - other.y) <= tolerance ? horizontalOverlap : 0 }, { wall: "top", length: Math.abs(other.y + other.height - room.y) <= tolerance ? horizontalOverlap : 0 }]; for (const candidate of candidates) if (candidate.length > (best?.length || 30)) best = candidate; } return best?.wall; }
function prepareConversionPlan(plan: FloorPlan, changes: RoomChange[]): FloorPlan { const prepared = structuredClone(plan); for (const change of changes) { if (norm(change.action) !== "converttobedroom" && norm(change.newType) !== "bedroom") continue; for (const floor of prepared.floors) { const room = floor.rooms.find(r => r.id === change.roomId); if (!room || isBedroom(room) || hasDoor(room) || (!isLiving(room) && !isDining(room))) continue; const inferredWall = inferSharedAccessWall(room, prepared); if (inferredWall) room.doors = [{ wall: inferredWall }]; } } return prepared; }
function isValidBedroomGeometry(room: Room): boolean { return !!room.polygon && room.polygon.length >= 3 && validateBedroomGeometry(room).valid; }
function applyAndCount(plan: FloorPlan, changes: RoomChange[]): { plan: FloorPlan; changesApplied: RoomChange[]; bedrooms: number } { const candidate = applyRoomChanges(prepareConversionPlan(plan, changes), changes); const applied: RoomChange[] = []; for (const change of changes) { const before = allRooms(plan).find(r => r.id === change.roomId), after = allRooms(candidate).find(r => r.id === change.roomId), child = allRooms(candidate).find(r => r.id === `${change.roomId}-split-2`); if (!before || !after) continue; const action = norm(change.action), requested = norm(change.newType || ""), childIsEnsuite = !!child && /ensuite/i.test(`${child.type} ${child.name}`); if (action === "converttobedroom" || requested === "bedroom") { if (isBedroom(after) && isValidBedroomGeometry(after)) applied.push(change); continue; } if ((action === "splitroom" || action === "split") && child?.polygon?.length && isBedroom(child)) applied.push(change); else if (action === "converttoensuite" && childIsEnsuite && child.polygon?.length && after.polygon?.length) applied.push(change); else if (after.type !== before.type || after.name !== before.name) applied.push(change); } return { plan: candidate, changesApplied: applied, bedrooms: bedrooms(candidate).length }; }
function groundConversionCandidates(plan: FloorPlan): Room[] { const ground = groundFloor(plan); if (!ground) return []; return ground.rooms.filter(room => !isBedroom(room) && !isWetRoom(room) && !isKitchen(room) && roomArea(room) >= BEDROOM_MIN_SQM && hasWindow(room) && !!room.polygon && room.polygon.length >= 3 && isLiving(room)).sort((a, b) => roomArea(b) - roomArea(a)); }
function splitCandidates(plan: FloorPlan): Room[] { return allRooms(plan).filter(room => !isBedroom(room) && !isWetRoom(room) && !isKitchen(room) && roomArea(room) >= BEDROOM_MIN_SQM * 2 && hasWindow(room) && hasDoor(room) && !!room.polygon && room.polygon.length >= 3).sort((a, b) => roomArea(b) - roomArea(a)); }
function livingChange(room: Room): RoomChange { return { roomId: room.id, action: "ConvertToBedroom", newType: "bedroom", newName: `Bedroom - ${room.name || "Converted Room"}`, reason: "Geometry-first HMO search: viable ground-floor living space converted while retaining communal kitchen provision." }; }
function splitChange(room: Room): RoomChange { const direction = (room.windows || []).some(w => w.wall === "top" || w.wall === "bottom") ? "horizontal" : "vertical"; return { roomId: room.id, action: "SplitRoom", split: { firstName: room.name || "Bedroom", firstType: "bedroom", secondName: "Bedroom", secondType: "bedroom", direction, firstRatio: 0.5 }, reason: "Both resulting polygons must independently satisfy bedroom geometry rules." }; }
export type PlanningResult = { plan: FloorPlan; appliedChanges: RoomChange[]; rejectedChanges: RoomChange[]; bedrooms: number; ensuiteCandidates: RoomChange[]; targetBedrooms?: number };

export function findMaximumHMO(plan: FloorPlan, aiChanges: RoomChange[] = [], targetBedrooms?: number): PlanningResult {
  let current = canonicaliseRoomTypes(plan);
  const appliedChanges: RoomChange[] = [], rejectedChanges: RoomChange[] = [];
  const target = Number.isFinite(Number(targetBedrooms)) && Number(targetBedrooms) > 0 ? Math.floor(Number(targetBedrooms)) : undefined;
  const reachedTarget = () => target !== undefined && bedrooms(current).length >= target;

  for (const change of aiChanges) {
    if (reachedTarget()) break;
    if (norm(change.action) === "converttoensuite" || /ensuite/i.test(String(change.split?.secondType || ""))) continue;
    const beforeCount = bedrooms(current).length;
    const candidate = applyAndCount(current, [change]);
    if (candidate.changesApplied.length && candidate.bedrooms >= beforeCount && (target === undefined || candidate.bedrooms <= target)) {
      current = candidate.plan;
      appliedChanges.push(...candidate.changesApplied);
    } else rejectedChanges.push(change);
  }

  if (!reachedTarget()) {
    for (const room of groundConversionCandidates(current)) {
      if (reachedTarget()) break;
      if (!separateKitchenExists(current, room.id)) continue;
      const change = livingChange(room), beforeCount = bedrooms(current).length, candidate = applyAndCount(current, [change]);
      if (!candidate.changesApplied.length || candidate.bedrooms <= beforeCount || !meaningfulCommunalSpace(candidate.plan) || (target !== undefined && candidate.bedrooms > target)) {
        rejectedChanges.push(change); continue;
      }
      current = candidate.plan; appliedChanges.push(...candidate.changesApplied);
    }
  }

  let improved = true;
  while (improved && !reachedTarget()) {
    improved = false;
    let best: { candidate: ReturnType<typeof applyAndCount>; change: RoomChange } | undefined;
    for (const room of splitCandidates(current)) {
      const beforeCount = bedrooms(current).length, change = splitChange(room), candidate = applyAndCount(current, [change]);
      if (candidate.bedrooms > beforeCount && candidate.changesApplied.length && (target === undefined || candidate.bedrooms <= target) && (!best || candidate.bedrooms > best.candidate.bedrooms)) best = { candidate, change };
    }
    if (best) { current = best.candidate.plan; appliedChanges.push(...best.candidate.changesApplied); improved = true; }
  }

  const ensuiteCandidates: RoomChange[] = bedrooms(current).map(room => ({ roomId: room.id, action: "ConvertToEnsuite", newType: "ensuite", split: { firstName: room.name || "Bedroom", firstType: "bedroom", secondName: "En-suite", secondType: "ensuite" }, reason: "Try a physically contained ensuite carve in the final bedroom polygon." }));
  return { plan: current, appliedChanges, rejectedChanges, bedrooms: bedrooms(current).length, ensuiteCandidates, targetBedrooms: target };
}

export function applyBestEnsuites(plan: FloorPlan, candidates: RoomChange[]): { plan: FloorPlan; applied: RoomChange[]; rejected: RoomChange[] } { let current = structuredClone(plan); const applied: RoomChange[] = [], rejected: RoomChange[] = []; for (const change of candidates) { const source = allRooms(current).find(r => r.id === change.roomId); if (!source || !isBedroom(source)) { rejected.push(change); continue; } const beforeArea = roomArea(source); const candidatePlan = applyRoomChanges(current, [change]); const remainder = allRooms(candidatePlan).find(r => r.id === change.roomId); const ensuite = allRooms(candidatePlan).find(r => r.id === `${change.roomId}-split-2` && /ensuite/i.test(`${r.type} ${r.name}`)); const valid = !!remainder?.polygon?.length && isBedroom(remainder) && roomArea(remainder) >= BEDROOM_MIN_SQM && !!ensuite?.polygon?.length && roomArea(ensuite) > 0 && (beforeArea <= 0 || Math.abs((roomArea(remainder) + roomArea(ensuite)) - beforeArea) / beforeArea <= 0.02); if (valid) { current = candidatePlan; applied.push(change); } else rejected.push(change); } return { plan: current, applied, rejected }; }
export function finalRoomSummary(plan: FloorPlan) { const rooms = allRooms(plan), finalBedrooms = rooms.filter(isBedroom), ensuites = rooms.filter(r => norm(`${r.type} ${r.name}`).includes("ensuite")); return { bedrooms: finalBedrooms.length, ensuites: ensuites.length, bedroomIds: finalBedrooms.map(r => r.id), ensuiteIds: ensuites.map(r => r.id) }; }
