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

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isBedroom = (v: unknown) => norm(v).includes("bedroom");
const isWet = (v: unknown) => { const x = norm(v); return x.includes("bath") || x.includes("shower") || x.includes("ensuite") || x === "wc" || x.includes("toilet"); };
const isBedroomChange = (c: any) => norm(c?.action) === "converttobedroom" || String(c?.newType ?? "").toLowerCase().includes("bedroom");

function applyLabels(plan: any, labels: any[]): void {
  const byId = new Map<string, any>();
  for (const f of plan.floors) for (const r of f.rooms) byId.set(r.id, r);
  for (const l of labels) {
    const r = byId.get(String(l?.roomId ?? ""));
    if (!r) continue;
    if (l.name) r.name = String(l.name);
    if (l.type) r.type = String(l.type);
    if (l.confidence) r.confidence = String(l.confidence);
    if (Array.isArray(l.windows)) r.windows = l.windows.filter((w: any) => ["top","bottom","left","right"].includes(String(w))).map((wall: any) => ({ wall }));
    if (Array.isArray(l.doors)) r.doors = l.doors.filter((w: any) => ["top","bottom","left","right"].includes(String(w))).map((wall: any) => ({ wall }));
  }
}

function noOpChange(change: any, plan: any): boolean {
  const action = norm(change?.action);
  if (!action || action === "nochange") return true;
  if (action === "converttoensuite" || action === "splitroom" || action === "split") return false;
  const room = plan.floors.flatMap((f: any) => f.rooms).find((r: any) => r.id === String(change?.roomId ?? ""));
  if (!room) return true;
  const current = norm(room.type), target = norm(change?.newType || (action === "converttobedroom" ? "bedroom" : action === "converttokitchen" ? "kitchen" : action === "converttobathroom" ? "bathroom" : ""));
  if (!target) return false;
  if (target.includes("bedroom")) return current.includes("bedroom");
  if (target.includes("kitchen")) return current.includes("kitchen");
  if (target.includes("bath") || target.includes("shower") || target.includes("ensuite") || target === "wc") return isWet(room.type);
  return current === target;
}

function addBestRoomConversions(plan: any, labels: any[], changes: any[], result: any): any[] {
  const out = [...changes], byId = new Map(labels.map((l: any) => [String(l?.roomId), l]));
  const existing = labels.filter((l: any) => isBedroom(l?.type)).length;
  const converted = new Set(out.filter(isBedroomChange).map((c: any) => String(c.roomId)));
  const kitchen = labels.some((l: any) => norm(l?.type).includes("kitchen"));
  const dining = labels.some((l: any) => norm(l?.type).includes("dining"));
  const candidates = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => ({ r, floor: f.name, label: byId.get(r.id) })))
    .filter((x: any) => x.label && !isBedroom(x.label.type) && /lounge|living|reception/i.test(String(x.label.type)))
    .filter((x: any) => Number(x.r.approxAreaSqm) >= 6.51 && Number(x.r.approxWidthM) >= 2.1 && Number(x.r.approxDepthM) >= 2.1)
    .filter((x: any) => !converted.has(x.r.id))
    .sort((a: any, b: any) => Number(b.r.approxAreaSqm) - Number(a.r.approxAreaSqm));
  let count = existing + out.filter(isBedroomChange).filter((c: any) => !isBedroom(byId.get(String(c.roomId))?.type)).length;
  const target = Math.min(6, count + candidates.length);
  for (const x of candidates) {
    if (count >= target || !kitchen || (!dining && candidates.length > 1 && count >= 5)) break;
    out.push({ roomId: x.r.id, action: "ConvertToBedroom", newType: "bedroom", newName: `Bedroom ${count + 1}`, reason: `Viable ${x.label.name || x.label.type} conversion: approximately ${Number(x.r.approxAreaSqm).toFixed(1)} sqm while kitchen and communal amenity remain.` });
    converted.add(x.r.id); count++;
  }
  if (count > existing) {
    result.summary = { ...(result.summary || {}), possibleHMOBedrooms: count };
    result.highestPossibleHMO = { bedrooms: count, score: Number(result.hmoScore || 0), reason: "Highest practical count after testing detected living/reception spaces against the uploaded geometry." };
  }
  return out;
}

function addSafeEnsuites(plan: any, labels: any[], changes: any[], result: any): any[] {
  const out = [...changes];
  const byId = new Map(labels.map((l: any) => [String(l?.roomId), l]));
  if (Number(result?.summary?.possibleHMOBedrooms) < 4) return out;
  for (const floor of plan.floors) for (const room of floor.rooms) {
    const label = byId.get(room.id);
    if (!label || !isBedroom(label.type) || Number(room.approxAreaSqm || 0) < 18) continue;
    if (out.some((c: any) => String(c?.roomId) === room.id && (norm(c?.action) === "splitroom" || norm(c?.action) === "converttoensuite"))) continue;
    const walls = Array.from(new Set((room.windows || []).map((w: any) => w.wall)));
    if (walls.length !== 1) continue;
    const horizontal = walls[0] === "top" || walls[0] === "bottom";
    out.push({ roomId: room.id, action: "SplitRoom", reason: `Large ${label.name || "bedroom"} (${Number(room.approxAreaSqm).toFixed(1)} sqm): create a compact internal ensuite while retaining the ${walls[0]} external opening wall with the bedroom.`, split: { firstName: label.name || room.name, firstType: "bedroom", secondName: "En-suite", secondType: "ensuite", direction: horizontal ? "horizontal" : "vertical", firstRatio: 0.72 } });
  }
  return out;
}

async function annotatedImage(filePath: string, plan: any): Promise<string> {
  const source = fs.readFileSync(filePath), meta = await sharp(source).metadata();
  const width = plan.metadata?.imageWidth || meta.width || 1600, height = plan.metadata?.imageHeight || meta.height || 1200;
  const overlays = plan.floors.flatMap((f: any) => f.rooms.map((r: any) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="#ff0055" stroke-width="5" stroke-dasharray="14 8"/><text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="22" font-weight="800" fill="#ff0055" stroke="white" stroke-width="5" paint-order="stroke">${r.id}</text>`)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/${path.extname(filePath).toLowerCase() === ".png" ? "png" : "jpeg"};base64,${source.toString("base64")}" width="${width}" height="${height}" preserveAspectRatio="none"/><g>${overlays}</g></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
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
    const result = JSON.parse(cleaned), labels = Array.isArray(result.roomLabels) ? result.roomLabels : [];
    const labelled = structuredClone(original); applyLabels(labelled, labels);
    const roomsById = new Map<string, any>(); for (const f of original.floors) for (const r of f.rooms) roomsById.set(r.id, { room: r, floor: f.name });
    const labelsById = new Map<string, any>(labels.map((l: any) => [String(l?.roomId), l]));
    const requested = Array.isArray(result.changes) ? result.changes : [];
    const valid = requested.filter((c: any) => { const id = String(c?.roomId || ""); if (!roomsById.has(id) || noOpChange(c, labelled)) return false; const l = labelsById.get(id); if (l?.floor && String(l.floor).toLowerCase() !== String(roomsById.get(id).floor).toLowerCase()) return false; return true; });
    const withConversions = addBestRoomConversions(labelled, labels, valid, result);
    const finalChanges = addSafeEnsuites(labelled, labels, withConversions, result);
    const proposed = applyRoomChanges(labelled, finalChanges);
    const appliedChanges = finalChanges.filter((c: any) => {
      const before = roomsById.get(String(c.roomId))?.room;
      if (!before) return false;
      if (norm(c.action) === "splitroom" || norm(c.action) === "converttoensuite") return proposed.floors.some((f: any) => f.rooms.some((r: any) => r.id === `${before.id}-split-2`));
      const after = proposed.floors.flatMap((f: any) => f.rooms).find((r: any) => r.id === before.id);
      return !!after && (after.type !== before.type || after.name !== before.name);
    });
    result.changes = appliedChanges;
    result.originalFloorPlan = original;
    result.proposedFloorPlan = proposed;
    result.generatedLayoutImage = renderFloorPlan(labelled, proposed, `data:${path.extname(filename).toLowerCase() === ".png" ? "image/png" : "image/jpeg"};base64,${fs.readFileSync(filePath).toString("base64")}`, appliedChanges);
    result.summary = { ...(result.summary || {}), bedrooms: labels.filter((l: any) => isBedroom(l.type)).length, bathrooms: labels.filter((l: any) => isWet(l.type)).length, possibleHMOBedrooms: Math.max(Number(result.summary?.possibleHMOBedrooms || 0), labels.filter((l: any) => isBedroom(l.type)).length + appliedChanges.filter(isBedroomChange).length) };
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("ANALYSE ERROR:", error);
    return NextResponse.json({ success: false, error: error?.message || "Analysis failed on the server." }, { status: 500 });
  }
}
