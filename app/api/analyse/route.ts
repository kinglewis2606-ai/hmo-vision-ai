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

function normaliseType(type: unknown): string { return String(type ?? "").toLowerCase().replace(/[^a-z]/g, ""); }
function isBedroomType(type: unknown): boolean { return normaliseType(type).includes("bedroom"); }
function isBathroomType(type: unknown): boolean {
  const value = normaliseType(type);
  return value.includes("bath") || value.includes("shower") || value.includes("ensuite") || value === "wc" || value.includes("toilet");
}
function isBedroomChange(change: any): boolean {
  return normaliseType(change?.action) === "converttobedroom" || String(change?.newType ?? "").toLowerCase().includes("bedroom");
}

function applyRoomLabels(floorPlan: any, labels: any[]): void {
  const roomsById = new Map<string, any>();
  for (const floor of floorPlan.floors) for (const room of floor.rooms) roomsById.set(room.id, room);
  for (const label of labels) {
    const room = roomsById.get(String(label?.roomId ?? ""));
    if (!room) continue;
    if (label.name) room.name = String(label.name);
    if (label.type) room.type = String(label.type);
    if (label.confidence) room.confidence = String(label.confidence);
    if (Array.isArray(label.windowWalls)) room.windows = label.windowWalls.map((wall: any) => String(wall).toLowerCase()).filter((wall: string) => ["top","bottom","left","right"].includes(wall)).map((wall: any) => ({ wall }));
    if (Array.isArray(label.doorWalls)) room.doors = label.doorWalls.map((wall: any) => String(wall).toLowerCase()).filter((wall: string) => ["top","bottom","left","right"].includes(wall)).map((wall: any) => ({ wall }));
  }
}

function intersectionRatio(a: any, b: any): number {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 ? intersection / smaller : 0;
}

function recoverMissingRooms(floorPlan: any, labels: any[], detectedFloors: any[]): void {
  let recovered = 0;
  for (const label of labels) {
    if (String(label?.roomId ?? "") !== "RECOVER" || label?.geometryValid === false || !label?.bbox) continue;
    const floorIndex = detectedFloors.findIndex((floor: any) => String(floor.name).trim().toLowerCase() === String(label?.floor ?? "").trim().toLowerCase());
    if (floorIndex < 0) continue;
    let { x, y, width, height } = label.bbox;
    x = Number(x); y = Number(y); width = Number(width); height = Number(height);
    const imageWidth = Number(floorPlan.metadata?.imageWidth || 0), imageHeight = Number(floorPlan.metadata?.imageHeight || 0);
    if ([x,y,width,height].some(v => !Number.isFinite(v)) || imageWidth <= 0 || imageHeight <= 0) continue;
    if (Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(width) <= 1 && Math.abs(height) <= 1) { x *= imageWidth; y *= imageHeight; width *= imageWidth; height *= imageHeight; }
    const sourceFloor = detectedFloors[floorIndex];
    const floorLeft = Number(sourceFloor.left ?? 0), floorTop = Number(sourceFloor.top ?? 0), floorRight = Number(sourceFloor.right ?? imageWidth), floorBottom = Number(sourceFloor.bottom ?? imageHeight);
    x = Math.max(floorLeft, Math.min(floorRight - 1, x)); y = Math.max(floorTop, Math.min(floorBottom - 1, y));
    width = Math.min(width, floorRight - x); height = Math.min(height, floorBottom - y);
    if (width < 25 || height < 25 || width * height > (floorRight-floorLeft)*(floorBottom-floorTop)*0.55) continue;
    if (Math.max(width/height, height/width) > 6) continue;
    const floor = floorPlan.floors[floorIndex];
    const existing = floor.rooms.find((room: any) => intersectionRatio({x,y,width,height}, room) >= 0.35);
    if (existing) { label.roomId = existing.id; continue; }
    const roomId = `room-recovered-${++recovered}`;
    floor.rooms.push({ id: roomId, name: "Unknown Room", type: "unknown", x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), approxAreaSqm: Number(((width*height)/10000).toFixed(1)), approxWidthM: Number((width/100).toFixed(1)), approxDepthM: Number((height/100).toFixed(1)), shape: "rectangle", adjacentRooms: [], doors: [], windows: [], notes: "Recovered from visually validated room boundary.", confidence: "Visual Geometry Recovery" });
    label.roomId = roomId; label.geometryValid = true;
  }
  if (recovered) console.log(`Recovered ${recovered} visually validated rooms missed by pixel segmentation`);
}

function pruneRejectedGeometry(floorPlan: any, labels: any[]): any {
  const rejected = new Set(labels.filter(label => label?.geometryValid === false).map(label => String(label?.roomId ?? "")).filter(Boolean));
  for (const floor of floorPlan.floors) floor.rooms = floor.rooms.filter((room: any) => !rejected.has(room.id));
  return floorPlan;
}

function countRoomsByType(floorPlan: any, predicate: (type: unknown) => boolean): number {
  return floorPlan?.floors?.reduce((count: number, floor: any) => count + (floor.rooms || []).filter((room: any) => predicate(room.type)).length, 0) || 0;
}

function isNoOpChange(change: any, floorPlan: any): boolean {
  const action = normaliseType(change?.action);
  if (!action || action === "nochange") return true;
  if (action === "converttoensuite" || action === "splitroom") return false;
  const room = floorPlan?.floors?.flatMap((floor: any) => floor.rooms || []).find((candidate: any) => candidate.id === String(change?.roomId ?? ""));
  if (!room) return true;
  const current = normaliseType(room.type), explicit = normaliseType(change?.newType);
  let target = explicit;
  if (!target && action === "converttobedroom") target = "bedroom";
  if (!target && action === "converttokitchen") target = "kitchen";
  if (!target && action === "converttobathroom") target = "bathroom";
  if (!target) return false;
  if (target.includes("bedroom")) return current.includes("bedroom");
  if (target.includes("bath") || target.includes("shower") || target.includes("ensuite") || target === "wc") return isBathroomType(room.type);
  if (target.includes("kitchen")) return current.includes("kitchen");
  return current === target;
}

function enforceGroundFloorConversions(floorPlan: any, labels: any[], changes: any[]): any[] {
  const output = [...changes];
  const ground = floorPlan.floors.find((floor: any) => String(floor.name).toLowerCase() === "ground floor");
  if (!ground) return output;
  const labelById = new Map<string, any>();
  for (const label of labels) labelById.set(String(label?.roomId ?? ""), label);
  const hasKitchen = ground.rooms.some((room: any) => /kitchen/i.test(String(room.type)));
  const hasDining = ground.rooms.some((room: any) => /dining/i.test(String(room.type)));
  if (!hasKitchen || !hasDining) return output;

  const candidates = ground.rooms.filter((room: any) => {
    const label = labelById.get(room.id);
    if (label?.geometryValid === false) return false;
    const text = `${String(label?.name ?? "")} ${String(label?.type ?? room.type ?? "")}`.toLowerCase();
    if (!/(living|lounge|reception)/.test(text)) return false;
    const area = Number(room.approxAreaSqm || (room.width * room.height) / 10000);
    return Number.isFinite(area) && area >= 6.51;
  });

  for (const room of candidates) {
    if (output.some(change => String(change?.roomId) === room.id && normaliseType(change?.action) === "converttobedroom")) continue;
    const existingBedroomConversions = output.filter(isBedroomChange).length;
    output.push({ roomId: room.id, action: "ConvertToBedroom", newName: `Bedroom ${existingBedroomConversions + 1}`, newType: "bedroom", reason: "Ground-floor living/lounge/reception converted while separate kitchen and dining rooms remain as communal provision." });
  }
  return output;
}

function ensureLargeBedroomEnsuites(floorPlan: any, labels: any[], changes: any[], result: any): any[] {
  const output = [...changes];
  const selectedBedrooms = Number(result?.summary?.possibleHMOBedrooms);
  if (!Number.isFinite(selectedBedrooms) || selectedBedrooms < 4) return output;
  const labelById = new Map<string, any>();
  for (const label of labels) labelById.set(String(label?.roomId ?? ""), label);
  for (const floor of floorPlan.floors) for (const room of floor.rooms) {
    const label = labelById.get(room.id);
    if (!label || label.geometryValid === false || !isBedroomType(label.type)) continue;
    const area = Number(room.approxAreaSqm || 0);
    if (!Number.isFinite(area) || area < 18) continue;
    if (output.some(change => String(change?.roomId ?? "") === room.id && ["splitroom","converttoensuite"].includes(normaliseType(change?.action)))) continue;
    const doorWalls = new Set((room.doors || []).map((door: any) => door.wall));
    const windowWalls = new Set((room.windows || []).map((window: any) => window.wall));
    let direction: "horizontal" | "vertical" = Number(room.width) >= Number(room.height) ? "horizontal" : "vertical";
    if ((doorWalls.has("top") || doorWalls.has("bottom")) && !(doorWalls.has("left") || doorWalls.has("right"))) direction = "vertical";
    else if ((doorWalls.has("left") || doorWalls.has("right")) && !(doorWalls.has("top") || doorWalls.has("bottom"))) direction = "horizontal";
    else if (windowWalls.has("top") || windowWalls.has("bottom")) direction = "vertical";
    else direction = "horizontal";
    output.push({ roomId: room.id, action: "SplitRoom", reason: `Large bedroom (${area.toFixed(1)} sqm) has enough area for a compact internal en-suite; entrance wall is retained.`, split: { firstName: label.name || room.name || "Bedroom", firstType: "bedroom", secondName: "En-suite", secondType: "ensuite", direction, firstRatio: 0.72 } });
  }
  return output;
}

function canonicaliseResult(result: any, currentFloorPlan: any, proposedFloorPlan: any, finalChanges: any[]): void {
  const current = countRoomsByType(currentFloorPlan, isBedroomType);
  const proposed = countRoomsByType(proposedFloorPlan, isBedroomType);
  if (!result.summary || typeof result.summary !== "object") result.summary = {};
  result.summary.bedrooms = current;
  result.summary.bathrooms = countRoomsByType(currentFloorPlan, isBathroomType);
  result.summary.possibleHMOBedrooms = proposed;

  const previousHighest = Number(result?.highestPossibleHMO?.bedrooms || 0);
  if (!result.highestPossibleHMO || typeof result.highestPossibleHMO !== "object") result.highestPossibleHMO = {};
  result.highestPossibleHMO.bedrooms = proposed;
  result.highestPossibleHMO.reason = proposed > current
    ? `Highest applied option is ${proposed} bedrooms: ${proposed-current} additional bedroom conversion${proposed-current === 1 ? "" : "s"} is physically represented in the proposed floor-plan geometry.`
    : String(result.highestPossibleHMO.reason || "");

  const conversionNames = finalChanges.filter(isBedroomChange).map(change => change.newName || change.roomId);
  const appliedLine = proposed > current
    ? ` Applied layout: ${proposed} bedrooms (${current} existing + ${proposed-current} physical conversion${proposed-current === 1 ? "" : "s"}).`
    : ` Applied layout: ${proposed} bedrooms.`;
  result.verdict = `${appliedLine} ${String(result.verdict || "").replace(/\s+/g, " ").trim()}`.trim();
  result.investorSummary = `${appliedLine} ${String(result.investorSummary || "").replace(/\s+/g, " ").trim()}`.trim();
  if (conversionNames.length) result.conversionSteps = [`Applied bedroom conversions: ${conversionNames.join(", ")}.`, ...(Array.isArray(result.conversionSteps) ? result.conversionSteps : [])];
  if (previousHighest !== proposed) console.log(`Canonicalised AI HMO count ${previousHighest} -> applied geometry count ${proposed}`);
}

async function buildAnnotatedAnalysisImage(filePath: string, floorPlan: any): Promise<{ dataUri: string; mime: string }> {
  const source = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const width = floorPlan.metadata?.imageWidth ?? 1600, height = floorPlan.metadata?.imageHeight ?? 1200;
  const labels = floorPlan.floors.flatMap((floor: any) => floor.rooms.map((room: any) => {
    const cx = room.x + room.width / 2, cy = room.y + room.height / 2;
    return `<rect x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}" fill="none" stroke="#ff0055" stroke-width="6" stroke-dasharray="16 9"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="20" font-weight="800" fill="#ff0055" stroke="white" stroke-width="4" paint-order="stroke">${room.id}</text>`;
  })).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:${mime};base64,${source.toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${labels}</g></svg>`;
  const annotated = await sharp(Buffer.from(svg)).png().toBuffer();
  return { dataUri: `data:image/png;base64,${annotated.toString("base64")}`, mime: "image/png" };
}

export async function POST(req: Request) {
  console.log("=== ANALYSE ROUTE HIT ===");
  try {
    const { filename, address, propertyType } = await req.json();
    if (!filename || typeof filename !== "string" || filename.includes("..") || filename.includes("/") || filename.includes("\\")) return NextResponse.json({ success: false, error: "Invalid uploaded filename." }, { status: 400 });
    const filePath = path.join(process.cwd(), "public", "uploads", filename);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: "Uploaded floor plan not found." }, { status: 404 });

    const detectedFloors = await detectFloors(filePath);
    const detectedRooms = await detectRooms(filePath, detectedFloors);
    const originalFloorPlan = buildOriginalFloorPlan(detectedFloors, detectedRooms);
    const imageMetadata = await sharp(filePath).metadata();
    originalFloorPlan.metadata = { imageWidth: imageMetadata.width, imageHeight: imageMetadata.height, imageDpi: imageMetadata.density };
    const promptText = buildHMOAnalysisPrompt(address, propertyType).replace("[FLOOR_PLAN_JSON_WILL_BE_INSERTED_HERE]", JSON.stringify(originalFloorPlan, null, 2));
    const annotated = await buildAnnotatedAnalysisImage(filePath, originalFloorPlan);

    // gpt-5 was intermittently taking longer than the UI's four-minute request window.
    // gpt-4.1 is the proven vision-capable model used by the earlier working analyser and
    // is fast enough for this structured room/geometry task while retaining high-detail vision.
    const response = await openai.responses.create({
      model: "gpt-4.1",
      max_output_tokens: 6000,
      input: [{ role: "user", content: [{ type: "input_text", text: promptText }, { type: "input_image", image_url: annotated.dataUri, detail: "high" }] }]
    });
    const cleaned = (response.output_text ?? "").replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();

    try {
      const result = JSON.parse(cleaned);
      const roomLabels = Array.isArray(result.roomLabels) ? result.roomLabels : [];
      const requestedChanges = Array.isArray(result.changes) ? result.changes : [];
      const recoveredFloorPlan = structuredClone(originalFloorPlan);
      recoverMissingRooms(recoveredFloorPlan, roomLabels, detectedFloors);
      const validatedOriginalFloorPlan = pruneRejectedGeometry(recoveredFloorPlan, roomLabels);
      applyRoomLabels(validatedOriginalFloorPlan, roomLabels);
      const roomsById = new Map<string, { room: any; floorName: string }>();
      for (const floor of validatedOriginalFloorPlan.floors) for (const room of floor.rooms) roomsById.set(room.id, { room, floorName: floor.name });
      const labelsById = new Map<string, any>();
      for (const label of roomLabels) labelsById.set(String(label?.roomId ?? ""), label);

      const validChanges = requestedChanges.filter((change: any) => {
        const id = String(change?.roomId ?? "");
        if (!roomsById.has(id) || isNoOpChange(change, validatedOriginalFloorPlan)) return false;
        const geometry = roomsById.get(id)!;
        const label = labelsById.get(id);
        if (label?.geometryValid === false) return false;
        const declaredFloor = String(label?.floor ?? "").trim().toLowerCase();
        if (declaredFloor && declaredFloor !== geometry.floorName.trim().toLowerCase()) return false;
        const action = normaliseType(change?.action), labelType = String(label?.type ?? "").toLowerCase();
        if (action === "converttobedroom" && /(bath|shower|wc|toilet|landing|hall|kitchen|dining)/.test(labelType)) return false;
        if (action === "converttokitchen" && geometry.floorName !== "Ground Floor") return false;
        return true;
      });

      const withGroundFloorConversions = enforceGroundFloorConversions(validatedOriginalFloorPlan, roomLabels, validChanges);
      const currentFloorPlan = structuredClone(validatedOriginalFloorPlan);
      const provisionalFloorPlan = applyRoomChanges(currentFloorPlan, withGroundFloorConversions);
      const provisionalBedroomCount = countRoomsByType(provisionalFloorPlan, isBedroomType);
      result.summary = result.summary || {};
      result.summary.possibleHMOBedrooms = provisionalBedroomCount;
      const finalChanges = ensureLargeBedroomEnsuites(validatedOriginalFloorPlan, roomLabels, withGroundFloorConversions, result);
      const proposedFloorPlan = applyRoomChanges(validatedOriginalFloorPlan, finalChanges);

      result.changes = finalChanges;
      result.originalFloorPlan = validatedOriginalFloorPlan;
      result.proposedFloorPlan = proposedFloorPlan;
      canonicaliseResult(result, validatedOriginalFloorPlan, proposedFloorPlan, finalChanges);

      const ensuiteChanges = finalChanges.filter((change: any) => normaliseType(change?.action) === "splitroom" && normaliseType(change?.split?.secondType).includes("ensuite"));
      if (ensuiteChanges.length) {
        const names = ensuiteChanges.map((change: any) => labelsById.get(String(change.roomId))?.name || change.roomId);
        const note = `Internal ensuite opportunities added for ${names.join(" and ")}; bedroom window walls are retained.`;
        result.recommendations = [note, ...(Array.isArray(result.recommendations) ? result.recommendations : [])];
      }

      result.generatedLayoutImage = renderFloorPlan(validatedOriginalFloorPlan, proposedFloorPlan, `data:${filename.toLowerCase().endsWith(".png") ? "image/png" : filename.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`, finalChanges);
      console.log("Analyse complete", { detectedRooms: detectedRooms.length, validatedRooms: validatedOriginalFloorPlan.floors.reduce((sum: number, floor: any) => sum + floor.rooms.length, 0), changesRequested: requestedChanges.length, changesApplied: finalChanges.length, bedrooms: result.summary.bedrooms, proposedBedrooms: result.summary.possibleHMOBedrooms, automaticEnsuites: ensuiteChanges.length });
      return NextResponse.json({ success: true, result });
    } catch (err: any) {
      console.error("JSON ERROR:", err?.message);
      console.error(cleaned.slice(0, 3000));
      return NextResponse.json({ success: false, error: `AI returned invalid analysis JSON: ${err?.message || "unknown error"}` }, { status: 502 });
    }
  } catch (error: any) {
    console.error("ANALYSE ERROR:", error);
    return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 });
  }
}
