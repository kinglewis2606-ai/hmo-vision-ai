import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { renderFloorPlan } from "@/lib/floorplanRenderer";
import { detectRooms } from "@/lib/floorDetection/detectRooms";
import { labelDetectedRooms } from "@/lib/floorDetection/labelDetectedRooms";
import { detectFloors } from "@/lib/floorDetection/detectFloors";
import { buildOriginalFloorPlan } from "@/lib/floorDetection/buildOriginalFloorPlan";
import { buildHMOTargetedDesignPrompt } from "@/lib/prompts/hmoTargetedDesignPrompt";
import { buildTargetedHMOLayout } from "@/lib/targetedHMOLayout";
import { finalRoomSummary } from "@/lib/hmoPlanner";
import { normaliseHMOReport } from "@/lib/hmoReport";
import { RoomChange } from "@/lib/types/floorPlan";
import fs from "fs";
import path from "path";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 300;

function cleanJson(value: string): any {
  const cleaned = value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { const first = cleaned.indexOf("{"); const last = cleaned.lastIndexOf("}"); if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1)); throw new Error("The AI design did not return valid JSON."); }
}

async function annotate(filePath: string, plan: any): Promise<string> {
  const source = fs.readFileSync(filePath);
  const metadata = await sharp(source).metadata();
  const width = metadata.width || plan.metadata?.imageWidth || 1600;
  const height = metadata.height || plan.metadata?.imageHeight || 1200;
  const labels = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff0055" stroke-width="6"/><text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" text-anchor="middle" font-size="28" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${r.id}</text>`)).join("\n");
  const jpeg = await sharp(source).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/jpeg;base64,${jpeg.toString("base64")}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  const rendered = await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${rendered.toString("base64")}`;
}

function applyLabels(plan: any, labels: any[]) {
  const rooms = plan.floors.flatMap((f: any) => f.rooms);
  for (const label of labels) {
    const room = rooms.find((r: any) => String(r.id) === String(label.roomId));
    if (!room) continue;
    if (label.name) room.name = String(label.name);
    if (label.type) room.type = String(label.type);
    if (Number(label.areaSqm) > 0) room.approxAreaSqm = Number(label.areaSqm);
    if (Number(label.widthM) > 0) room.approxWidthM = Number(label.widthM);
    if (Number(label.depthM) > 0) room.approxDepthM = Number(label.depthM);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filename = body?.filename;
    const address = body?.address;
    const propertyType = body?.propertyType;
    const requested = Number(body?.targetBedrooms);
    if (!filename || typeof filename !== "string" || /\.\.|[\\/]/.test(filename)) return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    if (!Number.isInteger(requested) || requested < 1 || requested > 20) return NextResponse.json({ success: false, error: "Choose a target HMO bedroom count between 1 and 20." }, { status: 400 });

    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });

    const floors = await detectFloors(filePath);
    const detectedRooms = await detectRooms(filePath, floors);
    const labelledDetectedRooms = await labelDetectedRooms(filePath, detectedRooms);
    const original: any = buildOriginalFloorPlan(floors, labelledDetectedRooms);
    const meta = await sharp(filePath).metadata();
    original.metadata = { imageWidth: meta.width, imageHeight: meta.height, imageDpi: meta.density };
    if (!original.floors.some((f: any) => f.rooms.length)) return NextResponse.json({ success: false, error: "No rooms were detected in the uploaded floor plan." }, { status: 422 });

    const image = await annotate(filePath, original);
    const prompt = buildHMOTargetedDesignPrompt(address, propertyType, requested).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(original, null, 2));
    const response = await openai.responses.create({ model: "gpt-5", input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "high" }] }] });
    const result = cleanJson(response.output_text || "{}");

    const labelled = structuredClone(original);
    if (Array.isArray(result.roomLabels)) applyLabels(labelled, result.roomLabels);
    const changes: RoomChange[] = Array.isArray(result.changes) ? result.changes : [];
    const layout = buildTargetedHMOLayout(labelled, changes, requested);
    const current = finalRoomSummary(labelled);
    const originalImage = `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`;
    const report: any = normaliseHMOReport(result, labelled, layout.plan, current.bedrooms, layout.appliedChanges, layout.rejectedChanges, address, propertyType);
    report.requestedBedrooms = requested;
    report.originalFloorPlan = labelled;
    report.proposedFloorPlan = layout.plan;
    report.changes = layout.appliedChanges;
    report.rejectedChanges = layout.rejectedChanges.map(c => ({ roomId: c.roomId, action: c.action, reason: "Rejected by deterministic geometry validation or target-count constraint." }));
    report.geometryFeasibility = { ...(report.geometryFeasibility || {}), possible: layout.bedrooms === requested, requestedBedrooms: requested, currentBedrooms: current.bedrooms, proposedBedrooms: layout.bedrooms, proposedEnsuites: layout.ensuites, appliedChanges: layout.appliedChanges.length, rejectedChanges: layout.rejectedChanges.length, finalBedroomIds: layout.bedroomIds, finalEnsuiteIds: layout.ensuiteIds };
    report.highestPossibleHMO = { ...(report.highestPossibleHMO || {}), bedrooms: layout.bedrooms, ensuites: layout.ensuites, reason: `Requested ${requested}; deterministic geometry produced ${layout.bedrooms}.` };
    report.verdict = layout.bedrooms === requested ? `Requested ${requested}-bedroom HMO layout achieved and rendered from validated geometry, with ${layout.ensuites} private en-suite${layout.ensuites === 1 ? "" : "s"}.` : `Requested ${requested} bedrooms could not all be created inside the fixed footprint. The deterministic geometry engine produced ${layout.bedrooms} physically valid bedroom${layout.bedrooms === 1 ? "" : "s"} instead.`;
    report.generatedLayoutImage = renderFloorPlan(labelled, layout.plan, originalImage, layout.appliedChanges);
    return NextResponse.json({ success: true, result: report });
  } catch (error: any) {
    console.error("TARGETED HMO ANALYSE ERROR:", error);
    return NextResponse.json({ success: false, error: error?.message || "Targeted HMO analysis failed on the server." }, { status: 500 });
  }
}
