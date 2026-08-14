import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { renderFloorPlan } from "@/lib/floorplanRenderer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { detectRooms } from "@/lib/floorDetection/detectRooms";
import { detectFloors } from "@/lib/floorDetection/detectFloors";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
import { buildHMOAnalysisPrompt } from "@/lib/prompts/hmoAnalysisPrompt";
import { findMaximumHMO, applyBestEnsuites, finalRoomSummary } from "@/lib/hmoPlanner";
import { RoomChange, WallSide } from "@/lib/types/floorPlan";
export const runtime = "nodejs";
export const maxDuration = 300;
type RoomLabel = { roomId?: string; name?: string; type?: string; floor?: string; confidence?: string; areaSqm?: number; widthM?: number; depthM?: number; windows?: WallSide[]; doors?: WallSide[]; [key: string]: unknown };
const WALLS: WallSide[] = ["top", "bottom", "left", "right"];
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isBathroom = (v: unknown) => { const x = norm(v); return x.includes("bath") || x.includes("shower") || x.includes("ensuite") || x.includes("toilet") || x === "wc"; };
function roomIdNumber(id: unknown): string | undefined { const matches = String(id ?? "").match(/\d+/g); return matches?.length ? matches[matches.length - 1] : undefined; }
function floorKey(value: unknown): string { const x = norm(value); if (!x) return ""; if (x.includes("ground") || x === "gf" || x.includes("level0") || x === "0") return "ground"; if (x.includes("first") || x === "1f" || x.includes("level1") || x === "1") return "first"; if (x.includes("second") || x === "2f" || x.includes("level2") || x === "2") return "second"; if (x.includes("third") || x === "3f" || x.includes("level3") || x === "3") return "third"; return x; }
function resolveRoom(plan: any, label: RoomLabel): any | undefined {
  const floors = Array.isArray(plan?.floors) ? plan.floors : [];
  const rooms = floors.flatMap((f: any) => (f.rooms || []).map((r: any) => ({ room: r, floor: f })));
  const requestedId = String(label.roomId ?? "");
  const exact = rooms.find(({ room }: any) => String(room.id) === requestedId); if (exact) return exact.room;
  const number = roomIdNumber(label.roomId), requestedFloor = floorKey(label.floor);
  if (number) { const numeric = rooms.filter(({ room }: any) => roomIdNumber(room.id) === number); if (requestedFloor) { const sameFloor = numeric.filter(({ floor }: any) => floorKey(floor.name || floor.level) === requestedFloor); if (sameFloor.length === 1) return sameFloor[0].room; } if (numeric.length === 1) return numeric[0].room; }
  const requestedName = norm(label.name);
  if (requestedName) { const named = rooms.filter(({ room, floor }: any) => { if (requestedFloor && floorKey(floor.name || floor.level) !== requestedFloor) return false; return norm(room.name) === requestedName; }); if (named.length === 1) return named[0].room; }
  return undefined;
}
function copyLabel(r: any, l: RoomLabel) {
  if (l.name) r.name = String(l.name); if (l.type) r.type = String(l.type); if (l.confidence) r.confidence = String(l.confidence);
  if (Number(l.areaSqm) > 0) r.approxAreaSqm = Number(l.areaSqm); if (Number(l.widthM) > 0) r.approxWidthM = Number(l.widthM); if (Number(l.depthM) > 0) r.approxDepthM = Number(l.depthM);
  if (Array.isArray(l.windows) && l.windows.length > 0) r.windows = l.windows.filter((w): w is WallSide => WALLS.includes(w));
  if (Array.isArray(l.doors) && l.doors.length > 0) r.doors = l.doors.filter((w): w is WallSide => WALLS.includes(w)).map(wall => ({ wall }));
}
function applyLabels(plan: any, labels: RoomLabel[]) {
  let resolved = 0; const used = new Set<string>();
  for (const l of labels) { const r = resolveRoom(plan, l); if (!r || used.has(r.id)) continue; used.add(r.id); resolved++; copyLabel(r, l); }
  for (const floor of (plan.floors || [])) {
    const key = floorKey(floor.name || floor.level), rooms = (floor.rooms || []).filter((r: any) => !used.has(r.id));
    const unresolved = labels.filter(l => floorKey(l.floor) === key && !resolveRoom(plan, l));
    if (!rooms.length || unresolved.length !== rooms.length) continue;
    unresolved.forEach((l, i) => { const r = rooms[i]; used.add(r.id); resolved++; copyLabel(r, l); });
  }
  return resolved;
}
function extractLabels(result: any): RoomLabel[] {
  const candidates = [result?.roomLabels, result?.rooms, result?.room_labels, result?.analysis?.roomLabels, result?.data?.roomLabels];
  const labels = candidates.find(Array.isArray);
  return Array.isArray(labels) ? labels.filter((x: any) => x && typeof x === "object") : [];
}
function roomList(plan: any) { return plan.floors.flatMap((f: any) => (f.rooms || []).map((r: any) => ({ id: r.id, floor: f.name, level: f.level, x: r.x, y: r.y, width: r.width, height: r.height, areaSqm: r.approxAreaSqm }))); }
function labelCoverage(plan: any, labels: RoomLabel[]): number { const rooms = plan.floors.flatMap((f: any) => f.rooms); const resolved = new Set(labels.map(l => resolveRoom(plan, l)?.id).filter(Boolean)); return rooms.length ? resolved.size / rooms.length : 0; }
function normalizeRecoveredLabels(plan: any, labels: RoomLabel[]): RoomLabel[] {
  const rooms = roomList(plan);
  if (!labels.length) return labels;
  if (labelCoverage(plan, labels) >= 0.9) return labels;
  const normalized: RoomLabel[] = [];
  for (const floor of plan.floors) {
    const floorRooms = (floor.rooms || []).slice(), key = floorKey(floor.name || floor.level);
    const floorLabels = labels.filter(l => !l.floor || floorKey(l.floor) === key);
    if (!floorLabels.length || floorLabels.length !== floorRooms.length) continue;
    const used = new Set<string>(), orderedMatches: Array<{ label: RoomLabel; room: any }> = [];
    for (const label of floorLabels) { const room = resolveRoom(plan, label); if (room && !used.has(room.id)) { used.add(room.id); orderedMatches.push({ label, room }); } }
    const remainingRooms = floorRooms.filter((r: any) => !used.has(r.id));
    const remainingLabels = floorLabels.filter(l => !resolveRoom(plan, l));
    if (remainingRooms.length === remainingLabels.length) remainingLabels.forEach((l, i) => normalized.push({ ...l, roomId: remainingRooms[i].id, floor: floor.name }));
    normalized.push(...orderedMatches.map(x => ({ ...x.label, roomId: x.room.id, floor: floor.name })));
  }
  if (normalized.length === rooms.length) return normalized;
  // Final controlled fallback: the recovery prompt explicitly requests the same
  // floor/room order as the geometry list. If it returned the right number of
  // labels but malformed IDs/floor strings, bind by that canonical order.
  if (labels.length === rooms.length) return labels.map((label, i) => ({ ...label, roomId: rooms[i].id, floor: rooms[i].floor }));
  return labels;
}
function cleanJson(s: string) { return s.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim(); }
async function recoverRoomLabels(plan: any, annotatedImage: string, existing: RoomLabel[]): Promise<RoomLabel[]> {
  const initial = normalizeRecoveredLabels(plan, existing);
  if (labelCoverage(plan, initial) >= 0.9) return initial;
  const geometry = JSON.stringify(roomList(plan));
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await openai.responses.create({ model: "gpt-5-mini", max_output_tokens: 6000, input: [{ role: "user", content: [
        { type: "input_text", text: `Classify EVERY room in this supplied floor-plan geometry. The image has a magenta canonical room ID printed over every detected room. Return JSON ONLY: {"roomLabels":[...]}. Return exactly one item for EVERY supplied room, in the same floor order as the supplied geometry. roomId MUST be copied exactly from the supplied geometry list, not invented. Use type values only: bedroom,living,dining,kitchen,bathroom,shower,wc,circulation,utility,storage,other. Read the original printed room labels and dimensions. Windows and doors: only top,bottom,left,right and only when visibly supported. Geometry list: ${geometry}` },
        { type: "input_image", image_url: annotatedImage, detail: "high" },
      ] }], });
      const parsed = JSON.parse(cleanJson(response.output_text || "{}"));
      const recovered = normalizeRecoveredLabels(plan, extractLabels(parsed));
      if (labelCoverage(plan, recovered) >= 0.9) return recovered;
    } catch (error) { console.warn(`Room label recovery attempt ${attempt} failed`, error); }
  }
  return initial;
}
async function annotate(filePath: string, plan: any) {
  const source = fs.readFileSync(filePath), metadata = await sharp(source).metadata();
  const width = metadata.width || plan.metadata?.imageWidth || 1600, height = metadata.height || plan.metadata?.imageHeight || 1200;
  const annotated = await sharp(source).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
  const labels = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff0055" stroke-width="6"/><text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" text-anchor="middle" font-size="28" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${r.id}</text>`)).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/jpeg;base64,${annotated.toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  const final = await sharp(Buffer.from(svg)).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${final.toString("base64")}`;
}
function appliedLayout(original: any, proposed: any, changes: RoomChange[]): string[] {
  const before = new Map<string, any>(), after = new Map<string, any>(), floors = new Map<string, string>();
  for (const f of original.floors) for (const r of f.rooms) { before.set(r.id, r); floors.set(r.id, f.name); }
  for (const f of proposed.floors) for (const r of f.rooms) { after.set(r.id, r); floors.set(r.id, f.name); }
  const lines: string[] = [];
  for (const c of changes) { const b = before.get(c.roomId), a = after.get(c.roomId); if (!b || !a) continue; const child = after.get(`${c.roomId}-split-2`); lines.push(norm(c.action).includes("split") && child ? `${floors.get(c.roomId) || "Floor"}: ${a.name || "Bedroom"} retained; ${child.name || "En-suite"} created from the final carved geometry.` : `${floors.get(c.roomId) || "Floor"}: ${a.name || a.type || "Room"} converted from ${b.name || b.type || "existing room"}.`); }
  return lines.length ? lines : ["No valid proposed geometry was applied."];
}
export async function POST(req: Request) {
  try {
    const { filename, address, propertyType } = await req.json();
    if (!filename || typeof filename !== "string" || /\.\.|[\\/]/.test(filename)) return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    const filePath = path.join(process.cwd(), "public", "uploads", filename); if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });
    const floors = await detectFloors(filePath), detectedRooms = await detectRooms(filePath, floors), original = buildOriginalFloorPlan(floors, detectedRooms), meta = await sharp(filePath).metadata();
    original.metadata = { imageWidth: meta.width, imageHeight: meta.height, imageDpi: meta.density };
    const prompt = buildHMOAnalysisPrompt(address, propertyType).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(original, null, 2));
    const image = await annotate(filePath, original);
    const response = await openai.responses.create({ model: "gpt-5", max_output_tokens: 6000, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "high" }] }] });
    const result = JSON.parse(cleanJson(response.output_text || "{}")), labelled = structuredClone(original);
    let labels: RoomLabel[] = await recoverRoomLabels(original, image, extractLabels(result));
    const resolvedLabels = applyLabels(labelled, labels);
    const roomCount = original.floors.flatMap((f: any) => f.rooms).length;
    if (labelCoverage(original, labels) < 0.9 || resolvedLabels < Math.ceil(roomCount * 0.9)) throw new Error("Room classification could not be recovered for the detected floor plan. Analysis was stopped instead of producing a false 0-bedroom result.");
    const aiChanges: RoomChange[] = Array.isArray(result.changes) ? result.changes.filter((c: any) => c && typeof c.roomId === "string") : [];
    const maximum = findMaximumHMO(labelled, aiChanges), ensuites = applyBestEnsuites(maximum.plan, maximum.ensuiteCandidates), proposed = ensuites.plan;
    const appliedChanges = [...maximum.appliedChanges, ...ensuites.applied], rejectedChanges = [...maximum.rejectedChanges, ...ensuites.rejected];
    const final = finalRoomSummary(proposed), current = finalRoomSummary(labelled), currentBedrooms = current.bedrooms;
    const originalImage = `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`;
    result.originalFloorPlan = labelled; result.proposedFloorPlan = proposed; result.changes = appliedChanges;
    result.rejectedChanges = rejectedChanges.map(c => ({ roomId: c.roomId, action: c.action, reason: "Rejected by deterministic geometry validation." }));
    result.summary = { ...(result.summary || {}), bedrooms: currentBedrooms, bathrooms: labelled.floors.flatMap((f: any) => f.rooms).filter((r: any) => isBathroom(r.type)).length, possibleHMOBedrooms: final.bedrooms };
    result.highestPossibleHMO = { ...(result.highestPossibleHMO || {}), bedrooms: final.bedrooms, ensuites: final.ensuites, reason: `Highest bedroom count surviving deterministic geometry validation: ${final.bedrooms}; ${final.ensuites} private ensuites physically applied.` };
    result.geometryFeasibility = { ...(result.geometryFeasibility || {}), possible: final.bedrooms > 0, currentBedrooms, proposedBedrooms: final.bedrooms, proposedEnsuites: final.ensuites, appliedChanges: appliedChanges.length, rejectedChanges: rejectedChanges.length, finalBedroomIds: final.bedroomIds, finalEnsuiteIds: final.ensuiteIds };
    result.recommendedLayout = appliedLayout(labelled, proposed, appliedChanges); result.conversionSteps = result.recommendedLayout;
    result.verdict = final.bedrooms > currentBedrooms ? `Maximum geometry-feasible ${final.bedrooms}-bedroom HMO layout selected, with ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}. Planning/licensing/building-control approval still requires professional/local-authority confirmation.` : `Final deterministic geometry supports ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"} and ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}; no higher-bedroom transformation survived geometry validation.`;
    result.investorSummary = `Final applied geometry contains ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"} and ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}. Only successfully applied geometry is reported.`;
    result.generatedLayoutImage = renderFloorPlan(labelled, proposed, originalImage, appliedChanges);
    return NextResponse.json({ success: true, result });
  } catch (error: any) { console.error("ANALYSE ERROR:", error); return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 }); }
}
