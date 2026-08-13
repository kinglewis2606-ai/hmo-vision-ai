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
import { applyRoomChanges } from "@/lib/applyRoomChanges";

export const runtime = "nodejs";
export const maxDuration = 300;

type WallSide = "top" | "bottom" | "left" | "right";
type RoomLabel = { roomId?: string; name?: string; type?: string; floor?: string; confidence?: string; areaSqm?: number; widthM?: number; depthM?: number; windows?: WallSide[]; doors?: WallSide[]; [key: string]: unknown };

function norm(v: unknown): string { return String(v ?? "").toLowerCase().replace(/[^a-z]/g, ""); }
function isBedroom(v: unknown): boolean { return norm(v).includes("bedroom"); }
function isBathroom(v: unknown): boolean { const x = norm(v); return x.includes("bath") || x.includes("shower") || x.includes("ensuite") || x === "wc" || x.includes("toilet"); }

function applyLabels(plan: any, labels: RoomLabel[]): void {
  const byId = new Map<string, any>(); for (const f of plan.floors) for (const r of f.rooms) byId.set(r.id, r);
  for (const l of labels) {
    const r = byId.get(String(l.roomId ?? "")); if (!r) continue;
    if (l.name) r.name = String(l.name);
    if (l.type) r.type = String(l.type);
    if (l.confidence) r.confidence = String(l.confidence);
    if (Array.isArray(l.windows)) r.windows = l.windows.filter((w): w is WallSide => ["top", "bottom", "left", "right"].includes(w));
    if (Array.isArray(l.doors)) r.doors = l.doors.filter((d): d is WallSide => ["top", "bottom", "left", "right"].includes(d)).map(wall => ({ wall }));
  }
}

function noOpChange(c: any, plan: any): boolean {
  const action = norm(c?.action); if (!action || action === "nochange") return true;
  const room = plan.floors.flatMap((f: any) => f.rooms).find((r: any) => r.id === String(c?.roomId ?? ""));
  if (!room) return true;
  if (action === "splitroom" || action === "converttoensuite") return false;
  const current = norm(room.type), target = norm(c?.newType || (action === "converttobedroom" ? "bedroom" : action === "converttokitchen" ? "kitchen" : action === "converttobathroom" ? "bathroom" : ""));
  if (!target) return false;
  if (target.includes("bedroom")) return current.includes("bedroom");
  if (target.includes("bath") || target.includes("shower") || target.includes("ensuite") || target === "wc" || target.includes("toilet")) return isBathroom(room.type);
  return target === current;
}

function bedroomConversionIsPhysicallyEligible(change: any, label: RoomLabel | undefined): boolean {
  if (norm(change?.action) !== "converttobedroom" && !norm(change?.newType).includes("bedroom")) return true;
  if (!label || !isBedroom(label.type) && Number(label.areaSqm || 0) < 6.51) {
    // A conversion target must have a real detected label and statutory-scale area.
    return !!label && Number(label.areaSqm || 0) >= 6.51 && Array.isArray(label.windows) && label.windows.length > 0 && Array.isArray(label.doors) && label.doors.length > 0;
  }
  return Number(label.areaSqm || 0) >= 6.51 && Array.isArray(label.windows) && label.windows.length > 0 && Array.isArray(label.doors) && label.doors.length > 0;
}

/**
 * The AI owns the architectural decision. This function only normalises the
 * representation of an AI-requested ensuite so the deterministic geometry
 * engine can validate and apply it. It deliberately does NOT invent ensuites
 * for every large bedroom.
 */
function normaliseRequestedEnsuites(plan: any, labels: RoomLabel[], changes: any[]): any[] {
  const byId = new Map<string, RoomLabel>(); for (const l of labels) byId.set(String(l.roomId ?? ""), l);
  return changes.map((change: any) => {
    const action = norm(change?.action);
    const id = String(change?.roomId ?? "");
    const label = byId.get(id);
    const room = plan.floors.flatMap((f: any) => f.rooms).find((r: any) => r.id === id);
    const requestedEnsuite = action === "converttoensuite" || (action === "splitroom" && /ensuite|bath|shower/i.test(String(change?.split?.secondType || "")));
    if (!requestedEnsuite || !room || !label || !isBedroom(label.type)) return change;
    const windows: WallSide[] = Array.isArray(label.windows) ? label.windows : [];
    let direction: "horizontal" | "vertical";
    if (windows.includes("top") !== windows.includes("bottom")) direction = "horizontal";
    else if (windows.includes("left") !== windows.includes("right")) direction = "vertical";
    else direction = room.width >= room.height ? "horizontal" : "vertical";
    const existingSplit = change.split || {};
    return {
      ...change,
      action: "SplitRoom",
      split: {
        firstName: existingSplit.firstName || label.name || room.name || "Bedroom",
        firstType: "bedroom",
        secondName: existingSplit.secondName || change.newName || "En-suite",
        secondType: "ensuite",
        direction: existingSplit.direction || direction,
        firstRatio: Number.isFinite(Number(existingSplit.firstRatio)) ? Number(existingSplit.firstRatio) : 0.72,
      },
    };
  });
}

/** Build the user-facing room proposal from rooms that actually survived geometry application. */
function buildAppliedRoomLayout(original: any, proposed: any, appliedChanges: any[]): string[] {
  const originalRooms = new Map<string, any>();
  const proposedRooms = new Map<string, any>();
  const floorByRoom = new Map<string, string>();
  for (const floor of original.floors) for (const room of floor.rooms) { originalRooms.set(room.id, room); floorByRoom.set(room.id, floor.name); }
  for (const floor of proposed.floors) for (const room of floor.rooms) { proposedRooms.set(room.id, room); floorByRoom.set(room.id, floor.name); }
  const lines: string[] = [];
  for (const change of appliedChanges) {
    const id = String(change?.roomId || "");
    const before = originalRooms.get(id);
    const after = proposedRooms.get(id);
    if (!before || !after) continue;
    const action = norm(change?.action);
    const floor = floorByRoom.get(id) || "Floor";
    if (action === "splitroom") {
      const child = proposedRooms.get(`${id}-split-2`);
      if (!child) continue;
      const firstName = after.name || change.split?.firstName || "Bedroom";
      const childType = String(child.type || "").toLowerCase();
      const childName = /ensuite|bath|shower/i.test(childType) ? "En-suite" : (child.name || change.split?.secondName || "Second room");
      lines.push(`${floor}: ${firstName} retained with its remaining geometry; ${childName} created only in the successfully carved area.`);
    } else {
      lines.push(`${floor}: ${after.name || after.type || "Room"} — converted from ${before.name || before.type || "existing room"}.`);
    }
  }
  if (!lines.length) lines.push("No proposed room changes were successfully applied to the detected geometry.");
  return lines;
}

function geometryVerdict(currentBedrooms: number, proposedBedrooms: number, appliedChanges: any[]): string {
  if (proposedBedrooms > currentBedrooms) {
    return `Geometry-feasible ${proposedBedrooms}-bed HMO layout based on the detected rooms and the changes that were actually applied. Planning, licensing and fire-safety approval still require professional/local-authority confirmation.`;
  }
  if (proposedBedrooms === currentBedrooms && appliedChanges.length === 0) {
    return `No higher-bedroom HMO conversion was physically validated from the detected geometry. The existing ${currentBedrooms}-bedroom arrangement remains the geometry-supported baseline.`;
  }
  return `Geometry supports a ${proposedBedrooms}-bedroom arrangement from the detected rooms and successfully applied changes. Planning, licensing and fire-safety approval still require professional/local-authority confirmation.`;
}

function annotatedImage(filePath: string, plan: any): Promise<string> {
  const source = fs.readFileSync(filePath); const width = plan.metadata?.imageWidth || 1600, height = plan.metadata?.imageHeight || 1200;
  const labels = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff0055" stroke-width="6"/><text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" text-anchor="middle" font-size="28" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${r.id}</text>`)).join("\n");
  const mime = path.extname(filePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:${mime};base64,${source.toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer().then(b => `data:image/png;base64,${b.toString("base64")}`);
}

export async function POST(req: Request) {
  try {
    const { filename, address, propertyType } = await req.json();
    if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/") || filename.includes("\\")) return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });
    const floors = await detectFloors(filePath), detectedRooms = await detectRooms(filePath, floors);
    const original = buildOriginalFloorPlan(floors, detectedRooms), meta = await sharp(filePath).metadata();
    original.metadata = { imageWidth: meta.width, imageHeight: meta.height, imageDpi: meta.density };
    const prompt = buildHMOAnalysisPrompt(address, propertyType).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(original, null, 2));
    const image = await annotatedImage(filePath, original);
    const response = await openai.responses.create({ model: "gpt-5", input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "high" }] }] });
    const cleaned = (response.output_text || "").replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
    const result = JSON.parse(cleaned), labels: RoomLabel[] = Array.isArray(result.roomLabels) ? result.roomLabels : [];
    const labelled = structuredClone(original); applyLabels(labelled, labels);
    const roomsById = new Map<string, { room: any; floor: string }>(); for (const f of original.floors) for (const r of f.rooms) roomsById.set(r.id, { room: r, floor: f.name });
    const labelsById = new Map<string, RoomLabel>(); for (const l of labels) labelsById.set(String(l.roomId ?? ""), l);
    const requested = Array.isArray(result.changes) ? result.changes : [];
    const valid = requested.filter((c: any) => {
      const id = String(c?.roomId || "");
      if (!roomsById.has(id) || noOpChange(c, labelled)) return false;
      const l = labelsById.get(id);
      if (l?.floor && String(l.floor).toLowerCase() !== String(roomsById.get(id)!.floor).toLowerCase()) return false;
      if (!bedroomConversionIsPhysicallyEligible(c, l)) return false;
      return true;
    });
    const finalChanges = normaliseRequestedEnsuites(labelled, labels, valid);
    const proposed = applyRoomChanges(labelled, finalChanges);

    const proposedRooms = proposed.floors.flatMap((f: any) => f.rooms);
    const appliedChanges = finalChanges.filter((c: any) => {
      const id = String(c?.roomId || "");
      const before = labelled.floors.flatMap((f: any) => f.rooms).find((r: any) => r.id === id);
      if (!before) return false;
      if (norm(c.action) === "splitroom" || norm(c.action) === "converttoensuite") {
        const child = proposedRooms.find((r: any) => r.id === `${before.id}-split-2` && String(r.notes || "").includes(`Created by split of ${before.id}`));
        const source = proposedRooms.find((r: any) => r.id === before.id);
        return !!child && !!source && Array.isArray(source.polygon) && source.polygon.length >= 3;
      }
      const after = proposedRooms.find((r: any) => r.id === before.id);
      return !!after && (after.type !== before.type || after.name !== before.name);
    });

    const originalBedrooms = labelled.floors.flatMap((f: any) => f.rooms).filter((r: any) => isBedroom(r.type)).length;
    const proposedBedrooms = proposedRooms.filter((r: any) => isBedroom(r.type)).length;
    const geometryPossible = proposedBedrooms > 0 && proposedRooms.filter((r: any) => isBedroom(r.type)).every((r: any) => Number(r.approxAreaSqm || 0) >= 6.51);

    result.changes = appliedChanges;
    result.originalFloorPlan = labelled;
    result.proposedFloorPlan = proposed;
    result.summary = {
      ...(result.summary || {}),
      bedrooms: originalBedrooms,
      bathrooms: labelled.floors.flatMap((f: any) => f.rooms).filter((r: any) => isBathroom(r.type)).length,
      possibleHMOBedrooms: proposedBedrooms,
    };
    result.highestPossibleHMO = {
      ...(result.highestPossibleHMO || {}),
      bedrooms: proposedBedrooms,
    };
    result.geometryFeasibility = {
      possible: geometryPossible,
      currentBedrooms: originalBedrooms,
      proposedBedrooms,
      appliedChanges: appliedChanges.length,
      rejectedChanges: Math.max(0, finalChanges.length - appliedChanges.length),
    };

    // The final written proposal and verdict are rebuilt from the same applied
    // geometry used by the renderer. The AI cannot report a different bedroom
    // count or claim a rejected room change.
    result.recommendedLayout = buildAppliedRoomLayout(labelled, proposed, appliedChanges);
    result.conversionSteps = [...result.recommendedLayout];
    result.verdict = geometryVerdict(originalBedrooms, proposedBedrooms, appliedChanges);
    result.investorSummary = `Geometry-selected scheme: ${proposedBedrooms} bedroom${proposedBedrooms === 1 ? "" : "s"} from the detected floor plan, with ${appliedChanges.length} change${appliedChanges.length === 1 ? "" : "s"} successfully applied. Any rejected AI proposal is excluded from the final scheme.`;

    result.generatedLayoutImage = renderFloorPlan(labelled, proposed, `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`, appliedChanges);
    return NextResponse.json({ success: true, result });
  } catch (error: any) { console.error("ANALYSE ERROR:", error); return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 }); }
}
