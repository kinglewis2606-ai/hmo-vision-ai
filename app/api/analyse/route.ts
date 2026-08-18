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
import { normaliseHMOReport } from "@/lib/hmoReport";
import { RoomChange, WallSide } from "@/lib/types/floorPlan";

export const runtime = "nodejs";
export const maxDuration = 300;

type RoomLabel = { roomId?: string; name?: string; type?: string; floor?: string; confidence?: string; areaSqm?: number; widthM?: number; depthM?: number; windows?: WallSide[]; doors?: WallSide[]; [key: string]: unknown };
const WALLS: WallSide[] = ["top", "bottom", "left", "right"];
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isBedroom = (v: unknown) => norm(v).includes("bedroom");
const isBathroom = (v: unknown) => { const x = norm(v); return x.includes("bath") || x.includes("shower") || x.includes("ensuite") || x.includes("toilet") || x === "wc"; };
function roomIdNumber(id: unknown): number | undefined { const matches = String(id ?? "").match(/\d+/g); if (!matches?.length) return undefined; const value = Number.parseInt(matches[matches.length - 1], 10); return Number.isFinite(value) ? value : undefined; }
function resolveRoom(plan: any, label: RoomLabel): any | undefined {
  const rooms = plan.floors.flatMap((f: any) => f.rooms);
  const requested = String(label.roomId ?? "").trim().toLowerCase();
  if (requested) { const exact = rooms.find((r: any) => String(r.id).trim().toLowerCase() === requested); if (exact) return exact; }
  const number = roomIdNumber(label.roomId) ?? roomIdNumber(label.name);
  if (number === undefined) return undefined;
  const candidates = rooms.filter((r: any) => roomIdNumber(r.id) === number);
  return candidates.length === 1 ? candidates[0] : undefined;
}
function applyOneLabel(room: any, label: RoomLabel): void {
  if (label.name) room.name = String(label.name);
  if (label.type) room.type = String(label.type);
  if (label.confidence) room.confidence = String(label.confidence);
  if (Number(label.areaSqm) > 0) room.approxAreaSqm = Number(label.areaSqm);
  if (Number(label.widthM) > 0) room.approxWidthM = Number(label.widthM);
  if (Number(label.depthM) > 0) room.approxDepthM = Number(label.depthM);
  if (Array.isArray(label.windows) && label.windows.length) room.windows = label.windows.filter((w): w is WallSide => WALLS.includes(w));
  if (Array.isArray(label.doors) && label.doors.length) room.doors = label.doors.filter((w): w is WallSide => WALLS.includes(w)).map(wall => ({ wall }));
}
function applyLabels(plan: any, labels: RoomLabel[]): number { let applied = 0; for (const label of labels) { const room = resolveRoom(plan, label); if (!room) continue; applyOneLabel(room, label); applied += 1; } return applied; }
function applyLabelsByOrderWhenSafe(plan: any, labels: RoomLabel[]): number {
  const rooms = plan.floors.flatMap((f: any) => f.rooms);
  if (!rooms.length || labels.length !== rooms.length) return 0;
  if (labels.some(label => resolveRoom(plan, label))) return 0;
  for (let i = 0; i < rooms.length; i += 1) applyOneLabel(rooms[i], labels[i]);
  return rooms.length;
}
function fallbackLabelsFromResult(result: any): RoomLabel[] { if (Array.isArray(result.roomLabels)) return result.roomLabels; if (Array.isArray(result.rooms)) return result.rooms; return []; }
function cleanJson(value: string): any {
  const cleaned = value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { const first = cleaned.indexOf("{"); const last = cleaned.lastIndexOf("}"); if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1)); throw new Error("The AI analysis did not return valid JSON."); }
}
async function classifyRoomsAgain(original: any, image: string): Promise<RoomLabel[]> {
  const roomIds = original.floors.flatMap((f: any) => f.rooms.map((r: any) => ({ id: r.id, floor: f.name })));
  const response = await openai.responses.create({ model: "gpt-5-mini", input: [{ role: "user", content: [
    { type: "input_text", text: `Classify every supplied detected room. Return exactly one item per supplied room, in the SAME ORDER as the supplied list. Copy the supplied roomId exactly. Read the printed room label from the original floor plan. Bedroom N=bedroom; Living Room/Lounge/Reception=living; Dining Room=dining; Kitchen=kitchen; Shower Room/Bathroom=bathroom; WC/Toilet=WC; Landing/Hall/Entrance/stairs=circulation. Return JSON only: {"roomLabels":[{"roomId":"room-1","name":"Bedroom 1","type":"bedroom","floor":"Ground Floor","windows":[],"doors":[]}]}. Supplied rooms: ${JSON.stringify(roomIds)}. Never invent a room.` },
    { type: "input_image", image_url: image, detail: "high" },
  ] } ] });
  try { const parsed = cleanJson(response.output_text || "{}"); return Array.isArray(parsed.roomLabels) ? parsed.roomLabels : []; } catch { return []; }
}
async function annotate(filePath: string, plan: any): Promise<string> {
  const source = fs.readFileSync(filePath); const metadata = await sharp(source).metadata();
  const width = metadata.width || plan.metadata?.imageWidth || 1600; const height = metadata.height || plan.metadata?.imageHeight || 1200;
  const annotated = await sharp(source).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const labels = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff0055" stroke-width="6"/><text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" text-anchor="middle" font-size="28" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${r.id}</text>`)).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/jpeg;base64,${annotated.toString("base64")}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  const final = await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toBuffer(); return `data:image/jpeg;base64,${final.toString("base64")}`;
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
    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });
    const floors = await detectFloors(filePath); const detectedRooms = await detectRooms(filePath, floors); const original: any = buildOriginalFloorPlan(floors, detectedRooms);
    const meta = await sharp(filePath).metadata(); original.metadata = { imageWidth: meta.width, imageHeight: meta.height, imageDpi: meta.density };
    if (!original.floors.some((f: any) => f.rooms.length)) return NextResponse.json({ success: false, error: "No rooms were detected in the uploaded floor plan." }, { status: 422 });
    const prompt = buildHMOAnalysisPrompt(address, propertyType).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(original, null, 2));
    const image = await annotate(filePath, original);
    const response = await openai.responses.create({ model: "gpt-5", input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "high" }] }] });
    const result = cleanJson(response.output_text || "{}"); const labelled = structuredClone(original); let labels = fallbackLabelsFromResult(result); let appliedLabelCount = applyLabels(labelled, labels);
    if (appliedLabelCount === 0 || !labelled.floors.flatMap((f: any) => f.rooms).some((r: any) => isBedroom(`${r.type} ${r.name}`))) {
      const retryLabels = await classifyRoomsAgain(original, image); const retryApplied = applyLabels(labelled, retryLabels);
      if (retryApplied > 0) { labels = retryLabels; appliedLabelCount = retryApplied; } else { const ordered = applyLabelsByOrderWhenSafe(labelled, retryLabels); if (ordered > 0) { labels = retryLabels; appliedLabelCount = ordered; } }
    }
    if (appliedLabelCount === 0 || !labelled.floors.flatMap((f: any) => f.rooms).some((r: any) => isBedroom(`${r.type} ${r.name}`))) { const ordered = applyLabelsByOrderWhenSafe(labelled, labels); if (ordered > 0) appliedLabelCount = ordered; }
    const mappedBedrooms = labelled.floors.flatMap((f: any) => f.rooms).filter((r: any) => isBedroom(`${r.type} ${r.name}`)).length;
    if (mappedBedrooms === 0 && detectedRooms.length > 0) return NextResponse.json({ success: false, error: "Room recognition completed, but the room labels could not be mapped back to the detected geometry after two classification passes." }, { status: 422 });
    console.log(`HMO room mapping: detected=${detectedRooms.length}, labels=${labels.length}, mapped=${appliedLabelCount}, bedrooms=${mappedBedrooms}`);
    const aiChanges: RoomChange[] = Array.isArray(result.changes) ? result.changes.filter((c: any) => c && typeof c.roomId === "string") : [];
    const maximum = findMaximumHMO(labelled, aiChanges); const ensuites = applyBestEnsuites(maximum.plan, maximum.ensuiteCandidates); const proposed = ensuites.plan;
    const appliedChanges = [...maximum.appliedChanges, ...ensuites.applied]; const rejectedChanges = [...maximum.rejectedChanges, ...ensuites.rejected];
    const final = finalRoomSummary(proposed); const current = finalRoomSummary(labelled); const currentBedrooms = current.bedrooms;
    const originalImage = `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`;
    const report: any = normaliseHMOReport(result, labelled, proposed, currentBedrooms, appliedChanges, rejectedChanges, address, propertyType);
    report.originalFloorPlan = labelled; report.proposedFloorPlan = proposed; report.changes = appliedChanges;
    report.rejectedChanges = rejectedChanges.map(c => ({ roomId: c.roomId, action: c.action, reason: "Rejected by deterministic geometry validation." }));
    report.summary = { ...(report.summary || {}), bedrooms: currentBedrooms, bathrooms: labelled.floors.flatMap((f: any) => f.rooms).filter((r: any) => isBathroom(r.type)).length, possibleHMOBedrooms: final.bedrooms };
    report.highestPossibleHMO = { ...(report.highestPossibleHMO || {}), bedrooms: final.bedrooms, ensuites: final.ensuites, reason: `Highest bedroom count surviving deterministic geometry validation: ${final.bedrooms}; ${final.ensuites} private ensuites physically applied.` };
    report.geometryFeasibility = { ...(report.geometryFeasibility || {}), possible: final.bedrooms > 0, currentBedrooms, proposedBedrooms: final.bedrooms, proposedEnsuites: final.ensuites, appliedChanges: appliedChanges.length, rejectedChanges: rejectedChanges.length, finalBedroomIds: final.bedroomIds, finalEnsuiteIds: final.ensuiteIds };
    report.recommendedLayout = appliedLayout(labelled, proposed, appliedChanges).length ? report.recommendedLayout : ["No valid proposed geometry was applied."];
    report.conversionSteps = report.recommendedLayout;
    report.verdict = final.bedrooms > currentBedrooms ? `Maximum geometry-feasible ${final.bedrooms}-bedroom HMO layout selected, with ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}. Planning/licensing/building-control approval still requires professional/local-authority confirmation.` : `Final deterministic geometry supports ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"} and ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}; no higher-bedroom transformation survived geometry validation.`;
    report.investorSummary = `Final applied geometry contains ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"} and ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}. Only successfully applied geometry is reported.`;
    report.generatedLayoutImage = renderFloorPlan(labelled, proposed, originalImage, appliedChanges);
    return NextResponse.json({ success: true, result: report });
  } catch (error: any) { console.error("ANALYSE ERROR:", error); return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 }); }
}
