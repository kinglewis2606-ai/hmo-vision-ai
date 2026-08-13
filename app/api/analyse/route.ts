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

function applyLabels(plan: any, labels: RoomLabel[]) {
  const rooms = new Map<string, any>();
  for (const f of plan.floors) for (const r of f.rooms) rooms.set(String(r.id), r);
  for (const l of labels) {
    const r = rooms.get(String(l.roomId ?? "")); if (!r) continue;
    if (l.name) r.name = String(l.name); if (l.type) r.type = String(l.type); if (l.confidence) r.confidence = String(l.confidence);
    if (Number(l.areaSqm) > 0) r.approxAreaSqm = Number(l.areaSqm);
    if (Number(l.widthM) > 0) r.approxWidthM = Number(l.widthM); if (Number(l.depthM) > 0) r.approxDepthM = Number(l.depthM);
    if (Array.isArray(l.windows)) r.windows = l.windows.filter((w): w is WallSide => WALLS.includes(w));
    if (Array.isArray(l.doors)) r.doors = l.doors.filter((w): w is WallSide => WALLS.includes(w)).map(wall => ({ wall }));
  }
}
function cleanJson(s: string) { return s.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim(); }

async function annotate(filePath: string, plan: any) {
  const source = fs.readFileSync(filePath), width = plan.metadata?.imageWidth || 1600, height = plan.metadata?.imageHeight || 1200;
  const labels = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff0055" stroke-width="6"/><text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" text-anchor="middle" font-size="28" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${r.id}</text>`))).join("\n");
  const mime = path.extname(filePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:${mime};base64,${source.toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  return `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64")}`;
}

function appliedLayout(original: any, proposed: any, changes: RoomChange[]): string[] {
  const before = new Map<string, any>(), after = new Map<string, any>(), floors = new Map<string, string>();
  for (const f of original.floors) for (const r of f.rooms) { before.set(r.id, r); floors.set(r.id, f.name); }
  for (const f of proposed.floors) for (const r of f.rooms) { after.set(r.id, r); floors.set(r.id, f.name); }
  const lines: string[] = [];
  for (const c of changes) {
    const b = before.get(c.roomId), a = after.get(c.roomId); if (!b || !a) continue;
    const child = after.get(`${c.roomId}-split-2`);
    lines.push(norm(c.action).includes("split") && child
      ? `${floors.get(c.roomId) || "Floor"}: ${a.name || "Bedroom"} retained; ${child.name || "En-suite"} created from the final carved geometry.`
      : `${floors.get(c.roomId) || "Floor"}: ${a.name || a.type || "Room"} converted from ${b.name || b.type || "existing room"}.`);
  }
  return lines.length ? lines : ["No valid proposed geometry was applied."];
}

export async function POST(req: Request) {
  try {
    const { filename, address, propertyType } = await req.json();
    if (!filename || typeof filename !== "string" || /\.\.|[\\/]/.test(filename)) return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });

    const floors = await detectFloors(filePath), detectedRooms = await detectRooms(filePath, floors), original = buildOriginalFloorPlan(floors, detectedRooms), meta = await sharp(filePath).metadata();
    original.metadata = { imageWidth: meta.width, imageHeight: meta.height, imageDpi: meta.density };
    const prompt = buildHMOAnalysisPrompt(address, propertyType).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(original, null, 2));
    const image = await annotate(filePath, original);
    const response = await openai.responses.create({ model: "gpt-5", input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "high" }] }] });
    const result = JSON.parse(cleanJson(response.output_text || "{}"));
    const labelled = structuredClone(original), labels: RoomLabel[] = Array.isArray(result.roomLabels) ? result.roomLabels : [];
    applyLabels(labelled, labels);
    const aiChanges: RoomChange[] = Array.isArray(result.changes) ? result.changes.filter((c: any) => c && typeof c.roomId === "string") : [];

    const maximum = findMaximumHMO(labelled, aiChanges);
    const ensuites = applyBestEnsuites(maximum.plan, maximum.ensuiteCandidates);
    const proposed = ensuites.plan, appliedChanges = [...maximum.appliedChanges, ...ensuites.applied], rejectedChanges = [...maximum.rejectedChanges, ...ensuites.rejected];
    const final = finalRoomSummary(proposed), current = finalRoomSummary(labelled), currentBedrooms = current.bedrooms;
    const originalImage = `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`;

    result.originalFloorPlan = labelled;
    result.proposedFloorPlan = proposed;
    result.changes = appliedChanges;
    result.rejectedChanges = rejectedChanges.map(c => ({ roomId: c.roomId, action: c.action, reason: "Rejected by deterministic geometry validation." }));
    result.summary = { ...(result.summary || {}), bedrooms: currentBedrooms, bathrooms: labelled.floors.flatMap((f: any) => f.rooms).filter((r: any) => isBathroom(r.type)).length, possibleHMOBedrooms: final.bedrooms };
    result.highestPossibleHMO = { ...(result.highestPossibleHMO || {}), bedrooms: final.bedrooms, ensuites: final.ensuites, reason: `Highest bedroom count surviving deterministic geometry validation: ${final.bedrooms}; ${final.ensuites} private ensuites physically applied.` };
    result.geometryFeasibility = { ...(result.geometryFeasibility || {}), possible: final.bedrooms > 0, currentBedrooms, proposedBedrooms: final.bedrooms, proposedEnsuites: final.ensuites, appliedChanges: appliedChanges.length, rejectedChanges: rejectedChanges.length, finalBedroomIds: final.bedroomIds, finalEnsuiteIds: final.ensuiteIds };
    result.recommendedLayout = appliedLayout(labelled, proposed, appliedChanges);
    result.conversionSteps = result.recommendedLayout;
    result.verdict = final.bedrooms > currentBedrooms
      ? `Maximum geometry-feasible ${final.bedrooms}-bedroom HMO layout selected, with ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}. Planning/licensing/building-control approval still requires professional/local-authority confirmation.`
      : `Final deterministic geometry supports ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"} and ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}; no higher-bedroom transformation survived geometry validation.`;
    result.investorSummary = `Final applied geometry contains ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"} and ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}. Only successfully applied geometry is reported.`;
    result.generatedLayoutImage = renderFloorPlan(labelled, proposed, originalImage, appliedChanges);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("ANALYSE ERROR:", error);
    return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 });
  }
}
