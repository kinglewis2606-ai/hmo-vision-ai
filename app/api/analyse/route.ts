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
import { findMaximumHMO, applyBestEnsuites, finalRoomSummary, isBedroom } from "@/lib/hmoPlanner";
import { RoomChange, WallSide } from "@/lib/types/floorPlan";

export const runtime = "nodejs";
export const maxDuration = 300;

type RoomLabel = {
  roomId?: string;
  name?: string;
  type?: string;
  floor?: string;
  confidence?: string;
  areaSqm?: number;
  widthM?: number;
  depthM?: number;
  windows?: WallSide[];
  doors?: WallSide[];
  [key: string]: unknown;
};

const VALID_WALLS: WallSide[] = ["top", "bottom", "left", "right"];

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function isBathroom(value: unknown): boolean {
  const x = norm(value);
  return x.includes("bath") || x.includes("shower") || x.includes("ensuite") || x.includes("toilet") || x === "wc";
}

function applyLabels(plan: any, labels: RoomLabel[]): void {
  const byId = new Map<string, any>();
  for (const floor of plan.floors) for (const room of floor.rooms) byId.set(String(room.id), room);
  for (const label of labels) {
    const room = byId.get(String(label.roomId ?? ""));
    if (!room) continue;
    if (label.name) room.name = String(label.name);
    if (label.type) room.type = String(label.type);
    if (label.confidence) room.confidence = String(label.confidence);
    if (Number.isFinite(Number(label.areaSqm)) && Number(label.areaSqm) > 0) room.approxAreaSqm = Number(label.areaSqm);
    if (Number.isFinite(Number(label.widthM)) && Number(label.widthM) > 0) room.approxWidthM = Number(label.widthM);
    if (Number.isFinite(Number(label.depthM)) && Number(label.depthM) > 0) room.approxDepthM = Number(label.depthM);
    if (Array.isArray(label.windows)) room.windows = label.windows.filter((wall): wall is WallSide => VALID_WALLS.includes(wall));
    if (Array.isArray(label.doors)) room.doors = label.doors.filter((wall): wall is WallSide => VALID_WALLS.includes(wall)).map(wall => ({ wall }));
  }
}

function cleanJson(value: string): string {
  return value.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
}

function finalAppliedLayout(original: any, proposed: any, changes: RoomChange[]): string[] {
  const originalRooms = new Map<string, any>();
  const proposedRooms = new Map<string, any>();
  const floors = new Map<string, string>();
  for (const floor of original.floors) for (const room of floor.rooms) {
    originalRooms.set(room.id, room);
    floors.set(room.id, floor.name);
  }
  for (const floor of proposed.floors) for (const room of floor.rooms) {
    proposedRooms.set(room.id, room);
    floors.set(room.id, floor.name);
  }

  const lines: string[] = [];
  for (const change of changes) {
    const before = originalRooms.get(change.roomId);
    const after = proposedRooms.get(change.roomId);
    if (!before || !after) continue;
    const action = norm(change.action);
    if (action === "splitroom" || action === "split") {
      const child = proposedRooms.get(`${change.roomId}-split-2`);
      if (!child) continue;
      lines.push(`${floors.get(change.roomId) || "Floor"}: ${after.name || "Bedroom"} retained with its final geometry; ${child.name || "En-suite"} physically carved from the source room.`);
    } else {
      lines.push(`${floors.get(change.roomId) || "Floor"}: ${after.name || after.type || "Room"} — ${before.name || before.type || "existing room"} converted using the detected room geometry.`);
    }
  }
  return lines.length ? lines : ["No valid proposed geometry was applied."];
}

function geometryVerdict(currentBedrooms: number, finalBedrooms: number, ensuites: number): string {
  if (finalBedrooms > currentBedrooms) {
    return `Maximum geometry-feasible ${finalBedrooms}-bedroom HMO layout selected from the detected geometry, with ${ensuites} private en-suite${ensuites === 1 ? "" : "s"}. Planning, licensing, building-control and fire-safety approval still require professional/local-authority confirmation.`;
  }
  return `The final deterministic geometry supports ${finalBedrooms} bedroom${finalBedrooms === 1 ? "" : "s"} and ${ensuites} private en-suite${ensuites === 1 ? "" : "s"}. No physically valid higher-bedroom transformation survived the geometry checks. Planning, licensing, building-control and fire-safety approval still require professional/local-authority confirmation.`;
}

async function annotatedImage(filePath: string, plan: any): Promise<string> {
  const source = fs.readFileSync(filePath);
  const width = plan.metadata?.imageWidth || 1600;
  const height = plan.metadata?.imageHeight || 1200;
  const labels = plan.floors.flatMap((floor: any) => floor.rooms.map((room: any) =>
    `<rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}" fill="none" stroke="#ff0055" stroke-width="6"/><text x="${room.x + room.width / 2}" y="${room.y + room.height / 2}" text-anchor="middle" font-size="28" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${room.id}</text>`
  )).join("\n"));
  const mime = path.extname(filePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:${mime};base64,${source.toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  const rendered = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${rendered.toString("base64")}`;
}

export async function POST(req: Request) {
  try {
    const { filename, address, propertyType } = await req.json();
    if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });

    const floors = await detectFloors(filePath);
    const detectedRooms = await detectRooms(filePath, floors);
    const original = buildOriginalFloorPlan(floors, detectedRooms);
    const metadata = await sharp(filePath).metadata();
    original.metadata = { imageWidth: metadata.width, imageHeight: metadata.height, imageDpi: metadata.density };

    const prompt = buildHMOAnalysisPrompt(address, propertyType).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(original, null, 2));
    const annotated = await annotatedImage(filePath, original);
    const response = await openai.responses.create({
      model: "gpt-5",
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: annotated, detail: "high" },
      ] }],
    });

    const result = JSON.parse(cleanJson(response.output_text || "{}"));
    const labels: RoomLabel[] = Array.isArray(result.roomLabels) ? result.roomLabels : [];
    const labelled = structuredClone(original);
    applyLabels(labelled, labels);

    const aiChanges: RoomChange[] = Array.isArray(result.changes)
      ? result.changes.filter((change: any) => change && typeof change.roomId === "string")
      : [];

    // AI supplies strategy. The deterministic planner owns physical feasibility
    // and searches beyond the first/conservative AI solution.
    const maximum = findMaximumHMO(labelled, aiChanges);
    const ensuiteResult = applyBestEnsuites(maximum.plan, maximum.ensuiteCandidates);
    const proposed = ensuiteResult.plan;
    const appliedChanges = [...maximum.appliedChanges, ...ensuiteResult.applied];
    const rejectedChanges = [...maximum.rejectedChanges, ...ensuiteResult.rejected];
    const summary = finalRoomSummary(proposed);
    const currentSummary = finalRoomSummary(labelled);
    const currentBedrooms = currentSummary.bedrooms;

    // Re-numbering is a presentation concern. The renderer numbers the final
    // geometry sequentially; IDs remain stable source-room IDs plus split child IDs.
    const generatedImage = renderFloorPlan(
      labelled,
      proposed,
      `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`,
      appliedChanges,
    );

    const layout = finalAppliedLayout(labelled, proposed, appliedChanges);
    const verdict = geometryVerdict(currentBedrooms, summary.bedrooms, summary.ensuites);

    result.originalFloorPlan = labelled;
    result.proposedFloorPlan = proposed;
    result.changes = appliedChanges;
    result.rejectedChanges = rejectedChanges.map(change => ({ roomId: change.roomId, action: change.action, reason: "Rejected by deterministic geometry validation." }));
    result.summary = {
      ...(result.summary || {}),
      bedrooms: currentBedrooms,
      bathrooms: labelled.floors.flatMap((floor: any) => floor.rooms).filter((room: any) => isBathroom(room.type)).length,
      possibleHMOBedrooms: summary.bedrooms,
    };
    result.highestPossibleHMO = {
      ...(result.highestPossibleHMO || {}),
      bedrooms: summary.bedrooms,
      ensuites: summary.ensuites,
      reason: `Highest bedroom count surviving deterministic geometry validation: ${summary.bedrooms}. Every final bedroom was tested for an internal en-suite; ${summary.ensuites} were physically applied.`,
    };
    result.geometryFeasibility = {
      ...(result.geometryFeasibility || {}),
      possible: summary.bedrooms > 0,
      currentBedrooms,
      proposedBedrooms: summary.bedrooms,
      proposedEnsuites: summary.ensuites,
      appliedChanges: appliedChanges.length,
      rejectedChanges: rejectedChanges.length,
      finalBedroomIds: summary.bedroomIds,
      finalEnsuiteIds: summary.ensuiteIds,
    };
    result.recommendedLayout = layout;
    result.conversionSteps = layout;
    result.verdict = verdict;
    result.investorSummary = `Final geometry: ${summary.bedrooms} bedroom${summary.bedrooms === 1 ? "" : "s"} and ${summary.ensuites} private en-suite${summary.ensuites === 1 ? "" : "s"}. Only successfully applied geometry is included in the recommendation, report and rendered plan.`;
    result.generatedLayoutImage = generatedImage;

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("ANALYSE ERROR:", error);
    return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 });
  }
}
