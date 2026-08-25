import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { openai, parseAIJson } from "@/lib/openai";
import { renderFloorPlan } from "@/lib/floorplanRenderer";
import { detectRooms } from "@/lib/floorDetection/detectRooms";
import { labelDetectedRooms } from "@/lib/floorDetection/labelDetectedRooms";
import { detectFloors } from "@/lib/floorDetection/detectFloors";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
import { buildHMOAnalysisPrompt } from "@/lib/prompts/hmoAnalysisPrompt";
import { buildMaximumHMOLayout } from "@/lib/hmoLayoutPipeline";
import { finalRoomSummary } from "@/lib/hmoPlanner";
import { normaliseHMOReport } from "@/lib/hmoReport";
import { RoomChange } from "@/lib/types/floorPlan";

export const runtime = "nodejs";
export const maxDuration = 60;

type Stage = "file" | "floor detection" | "room detection" | "room labels" | "AI strategy" | "geometry validation" | "rendering" | "report";

class AnalysisStageError extends Error {
  stage: Stage;
  constructor(stage: Stage, message: string) { super(`${stage[0].toUpperCase()}${stage.slice(1)} failed: ${message}`); this.stage = stage; }
}

async function timed<T>(stage: Stage, operation: () => Promise<T>): Promise<T> {
  const started = Date.now();
  console.log(`[HMO][${stage}] START`);
  try {
    const result = await operation();
    console.log(`[HMO][${stage}] END ${Date.now() - started}ms`);
    return result;
  } catch (error: any) {
    console.error(`[HMO][${stage}] ERROR ${Date.now() - started}ms`, error);
    const message = error?.name === "AbortError" || /timed out|timeout/i.test(String(error?.message)) ? "the operation timed out before the server deadline" : String(error?.message || "unexpected error");
    throw new AnalysisStageError(stage, message);
  }
}

function normaliseRoomTypes(plan: any): void {
  for (const room of plan.floors.flatMap((f: any) => f.rooms)) {
    const value = String(room.name || room.type || "").toLowerCase().replace(/[^a-z]/g, "");
    if (value.includes("bedroom")) room.type = "bedroom";
    else if (value.includes("living") || value.includes("lounge") || value.includes("reception")) room.type = "living";
    else if (value.includes("dining") || value.includes("diner")) room.type = "dining";
    else if (value.includes("kitchen")) room.type = "kitchen";
    else if (value.includes("shower") || value.includes("bathroom") || value === "bath" || value === "wc" || value.includes("toilet")) room.type = "bathroom";
    else if (value.includes("landing") || value.includes("hall") || value.includes("entrance") || value.includes("stair")) room.type = "circulation";
  }
}

function compactRooms(plan: any) {
  return plan.floors.flatMap((floor: any) => floor.rooms.map((room: any) => ({
    roomId: room.id, floor: floor.name, name: room.name, type: room.type,
    areaSqm: Number(room.approxAreaSqm || 0), widthM: Number(room.approxWidthM || 0), depthM: Number(room.approxDepthM || 0),
    hasWindow: Array.isArray(room.windows) && room.windows.length > 0,
    hasDoor: Array.isArray(room.doors) && room.doors.length > 0,
  })));
}

function safeChanges(result: any): RoomChange[] {
  if (!Array.isArray(result?.changes)) return [];
  return result.changes.filter((change: any) => change && typeof change.roomId === "string" && typeof change.action === "string").map((change: any) => ({
    roomId: change.roomId,
    action: change.action,
    newName: typeof change.newName === "string" ? change.newName : undefined,
    newType: typeof change.newType === "string" ? change.newType : undefined,
    reason: typeof change.reason === "string" ? change.reason : undefined,
    split: change.split && typeof change.split === "object" ? {
      firstName: typeof change.split.firstName === "string" ? change.split.firstName : undefined,
      firstType: typeof change.split.firstType === "string" ? change.split.firstType : undefined,
      secondName: typeof change.split.secondName === "string" ? change.split.secondName : undefined,
      secondType: typeof change.split.secondType === "string" ? change.split.secondType : undefined,
      direction: change.split.direction === "vertical" ? "vertical" : "horizontal",
      firstRatio: Number.isFinite(Number(change.split.firstRatio)) ? Number(change.split.firstRatio) : undefined,
    } : undefined,
  }));
}

function appliedLayout(original: any, proposed: any, changes: RoomChange[]): string[] {
  const before = new Map<string, any>();
  const after = new Map<string, any>();
  const floors = new Map<string, string>();
  for (const floor of original.floors) for (const room of floor.rooms) { before.set(room.id, room); floors.set(room.id, floor.name); }
  for (const floor of proposed.floors) for (const room of floor.rooms) { after.set(room.id, room); floors.set(room.id, floor.name); }
  const lines: string[] = [];
  for (const change of changes) {
    const source = before.get(change.roomId), result = after.get(change.roomId);
    if (!source || !result) continue;
    const child = after.get(`${change.roomId}-split-2`);
    if (child && /split/i.test(change.action || "")) lines.push(`${floors.get(change.roomId) || "Floor"}: ${result.name || "Bedroom"} retained and ${child.name || "En-suite"} created from validated carved geometry.`);
    else lines.push(`${floors.get(change.roomId) || "Floor"}: ${result.name || result.type || "Room"} converted from ${source.name || source.type || "existing room"}.`);
  }
  return lines.length ? lines : ["No proposed transformation survived deterministic geometry validation."];
}

export async function POST(req: Request) {
  const started = Date.now();
  try {
    const input = await req.json();
    const { filename, address, propertyType } = input || {};
    if (!filename || typeof filename !== "string" || /\.\.|[\\/]/.test(filename)) return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    await timed("file", async () => { if (!fs.existsSync(filePath)) throw new Error("uploaded floor plan not found"); });

    const floors = await timed("floor detection", () => detectFloors(filePath));
    const detectedRooms = await timed("room detection", () => detectRooms(filePath, floors));
    const labelledDetectedRooms = await timed("room labels", () => labelDetectedRooms(filePath, detectedRooms));
    if (!labelledDetectedRooms.length) return NextResponse.json({ success: false, error: "Room detection failed: no enclosed rooms were detected in the uploaded floor plan." }, { status: 422 });

    const original: any = buildOriginalFloorPlan(floors, labelledDetectedRooms);
    const metadata = await sharp(filePath).metadata();
    original.metadata = { imageWidth: metadata.width, imageHeight: metadata.height, imageDpi: metadata.density };
    normaliseRoomTypes(original);
    const existingRooms = compactRooms(original);
    const existingBedrooms = existingRooms.filter((room: any) => String(`${room.type} ${room.name}`).toLowerCase().includes("bedroom")).length;

    const prompt = `${buildHMOAnalysisPrompt(address, propertyType)}\n\nAUTHORITATIVE DETECTED ROOMS:\n${JSON.stringify(existingRooms)}\n\nReturn only the strategy JSON.`;
    const aiResult = await timed("AI strategy", async () => {
      const response = await openai.responses.create({ model: "gpt-5-mini", input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], max_output_tokens: 3000 });
      return parseAIJson<any>(response.output_text || "");
    });

    const aiChanges = safeChanges(aiResult);
    const layout = await timed("geometry validation", async () => buildMaximumHMOLayout(original, aiChanges));
    const proposed = layout.plan;
    const final = { bedrooms: layout.bedrooms, ensuites: layout.ensuites, bedroomIds: layout.bedroomIds, ensuiteIds: layout.ensuiteIds };
    const current = finalRoomSummary(original);
    const originalImage = `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`;

    const report = await timed("report", async () => normaliseHMOReport(aiResult, original, proposed, current.bedrooms, layout.appliedChanges, layout.rejectedChanges, address, propertyType));
    report.originalFloorPlan = original;
    report.proposedFloorPlan = proposed;
    report.changes = layout.appliedChanges;
    report.rejectedChanges = layout.rejectedChanges.map((change: RoomChange) => ({ roomId: change.roomId, action: change.action, reason: "Rejected by deterministic geometry validation." }));
    report.summary = { ...(report.summary || {}), bedrooms: current.bedrooms, bathrooms: original.floors.flatMap((f: any) => f.rooms).filter((r: any) => /bath|shower|toilet|ensuite|wc/i.test(`${r.type} ${r.name}`)).length, possibleHMOBedrooms: final.bedrooms, grossFloorAreaSqm: original.metadata?.grossFloorAreaSqm || 0, confidence: report.summary?.confidence || "Geometry validated" };
    report.highestPossibleHMO = { ...(report.highestPossibleHMO || {}), bedrooms: final.bedrooms, ensuites: final.ensuites, reason: `Highest bedroom count surviving deterministic geometry validation: ${final.bedrooms}.` };
    report.geometryFeasibility = { ...(report.geometryFeasibility || {}), possible: final.bedrooms > 0 && layout.grossAreaAudit.roomGeometryAreaConserved, currentBedrooms: current.bedrooms, proposedBedrooms: final.bedrooms, proposedEnsuites: final.ensuites, appliedChanges: layout.appliedChanges.length, rejectedChanges: layout.rejectedChanges.length, finalBedroomIds: final.bedroomIds, finalEnsuiteIds: final.ensuiteIds, grossAreaAudit: layout.grossAreaAudit };
    report.recommendedLayout = appliedLayout(original, proposed, layout.appliedChanges);
    report.conversionSteps = report.recommendedLayout;
    report.verdict = final.bedrooms > existingBedrooms ? `Maximum geometry-feasible ${final.bedrooms}-bedroom HMO layout selected.` : `Deterministic geometry supports ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"}.`;
    report.investorSummary = `Final applied geometry contains ${final.bedrooms} bedroom${final.bedrooms === 1 ? "" : "s"} and ${final.ensuites} private en-suite${final.ensuites === 1 ? "" : "s"}. Only geometry that passed validation is reported.`;

    report.generatedLayoutImage = await timed("rendering", async () => renderFloorPlan(original, proposed, originalImage, layout.appliedChanges));
    console.log(`[HMO][complete] total=${Date.now() - started}ms detected=${detectedRooms.length} currentBedrooms=${current.bedrooms} finalBedrooms=${final.bedrooms} ensuites=${final.ensuites}`);
    return NextResponse.json({ success: true, result: report });
  } catch (error: any) {
    console.error("ANALYSE ERROR:", error);
    const status = error instanceof AnalysisStageError && /no enclosed rooms/i.test(error.message) ? 422 : 500;
    return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status });
  }
}
